from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional, Dict, Any
import uuid
from datetime import datetime, timedelta
import jwt
import bcrypt
import json
import re
from emergentintegrations.llm.chat import LlmChat, UserMessage
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound
import httpx
from bs4 import BeautifulSoup
import subprocess

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ.get('DB_NAME', 'clip_to_cart')]

# JWT Configuration
JWT_SECRET = os.environ.get('JWT_SECRET', 'clip-to-cart-secret-key-2024')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24 * 7  # 1 week

# Emergent LLM Key
EMERGENT_API_KEY = os.environ.get('EMERGENT_API_KEY', '')

# Create the main app
app = FastAPI(title="Clip-to-Cart API")

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

security = HTTPBearer(auto_error=False)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ==================== MODELS ====================

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class User(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    email: str
    name: str
    subscription_plan: str = "normal"  # normal or chef
    recipes_used_this_month: int = 0
    current_month: str = Field(default_factory=lambda: datetime.utcnow().strftime("%Y-%m"))
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Ingredient(BaseModel):
    name: str
    quantity: str
    unit: str
    category: str  # produce, dairy, meat, pantry, frozen, bakery, beverages, other
    checked: bool = False

class Recipe(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    title: str
    source_url: str
    source_platform: str  # youtube, tiktok, instagram
    ingredients: List[Ingredient] = []
    instructions: List[str] = []
    servings: int = 4
    prep_time: Optional[str] = None
    cook_time: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)

class MealPlanEntry(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    user_id: str
    recipe_id: str
    recipe_title: str
    date: str  # YYYY-MM-DD format
    meal_type: str  # breakfast, lunch, dinner, snack
    created_at: datetime = Field(default_factory=datetime.utcnow)

class RecipeExtractRequest(BaseModel):
    video_url: str

class UpgradeRequest(BaseModel):
    plan: str  # "chef"

# ==================== HELPERS ====================

def convert_mongo_doc(doc):
    """Convert MongoDB document to JSON-serializable format"""
    if doc is None:
        return None
    if isinstance(doc, list):
        return [convert_mongo_doc(item) for item in doc]
    if isinstance(doc, dict):
        result = {}
        for key, value in doc.items():
            if key == '_id':
                continue  # Skip MongoDB _id field
            result[key] = convert_mongo_doc(value)
        return result
    return doc

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str) -> str:
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get('user_id')
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    user_data = await db.users.find_one({"id": user_id})
    if not user_data:
        raise HTTPException(status_code=401, detail="User not found")
    
    # Check if month has changed and reset counter
    current_month = datetime.utcnow().strftime("%Y-%m")
    if user_data.get('current_month') != current_month:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"recipes_used_this_month": 0, "current_month": current_month}}
        )
        user_data['recipes_used_this_month'] = 0
        user_data['current_month'] = current_month
    
    return User(**user_data)

# ==================== PLATFORM DETECTION ====================

def detect_platform(url: str) -> str:
    """Detect the video platform from URL"""
    url_lower = url.lower()
    if 'youtube.com' in url_lower or 'youtu.be' in url_lower:
        return 'youtube'
    elif 'tiktok.com' in url_lower:
        return 'tiktok'
    elif 'instagram.com' in url_lower:
        return 'instagram'
    else:
        return 'unknown'

def extract_video_id(url: str, platform: str) -> Optional[str]:
    """Extract video ID from URL"""
    if platform == 'youtube':
        patterns = [
            r'(?:v=|/)([0-9A-Za-z_-]{11}).*',
            r'(?:youtu\.be/)([0-9A-Za-z_-]{11})'
        ]
        for pattern in patterns:
            match = re.search(pattern, url)
            if match:
                return match.group(1)
    elif platform == 'tiktok':
        match = re.search(r'/video/(\d+)', url)
        if match:
            return match.group(1)
    elif platform == 'instagram':
        match = re.search(r'/reel/([A-Za-z0-9_-]+)', url)
        if match:
            return match.group(1)
    return None

# ==================== VIDEO CONTENT EXTRACTION ====================

async def get_youtube_transcript(video_id: str) -> Optional[str]:
    """Fetch transcript/captions from YouTube video"""
    try:
        # Use the new API - create instance and fetch
        api = YouTubeTranscriptApi()
        transcript_data = api.fetch(video_id, languages=['en', 'en-US', 'en-GB', 'es', 'fr', 'de'])
        
        # Combine all text segments
        full_text = ' '.join([segment.text for segment in transcript_data])
        return full_text
            
    except (TranscriptsDisabled, NoTranscriptFound) as e:
        logger.warning(f"No transcript available for YouTube video {video_id}: {e}")
    except Exception as e:
        logger.error(f"Error fetching YouTube transcript: {e}")
    
    return None

async def get_youtube_video_info(video_id: str) -> Dict[str, Any]:
    """Get YouTube video title, description using yt-dlp"""
    try:
        result = subprocess.run(
            ['/root/.venv/bin/yt-dlp', '--dump-json', '--no-download', f'https://www.youtube.com/watch?v={video_id}'],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {
                'title': data.get('title', ''),
                'description': data.get('description', ''),
                'uploader': data.get('uploader', ''),
                'duration': data.get('duration', 0)
            }
    except subprocess.TimeoutExpired:
        logger.warning(f"Timeout getting YouTube video info for {video_id}")
    except Exception as e:
        logger.error(f"Error getting YouTube video info: {e}")
    return {}

async def get_tiktok_video_info(url: str) -> Dict[str, Any]:
    """Get TikTok video info using yt-dlp"""
    try:
        result = subprocess.run(
            ['/root/.venv/bin/yt-dlp', '--dump-json', '--no-download', url],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {
                'title': data.get('title', '') or data.get('description', ''),
                'description': data.get('description', ''),
                'uploader': data.get('uploader', '') or data.get('creator', ''),
            }
    except subprocess.TimeoutExpired:
        logger.warning(f"Timeout getting TikTok video info")
    except Exception as e:
        logger.error(f"Error getting TikTok video info: {e}")
    return {}

async def get_instagram_video_info(url: str) -> Dict[str, Any]:
    """Get Instagram video info using yt-dlp"""
    try:
        result = subprocess.run(
            ['/root/.venv/bin/yt-dlp', '--dump-json', '--no-download', url],
            capture_output=True,
            text=True,
            timeout=30
        )
        if result.returncode == 0:
            data = json.loads(result.stdout)
            return {
                'title': data.get('title', '') or data.get('description', ''),
                'description': data.get('description', ''),
                'uploader': data.get('uploader', '') or data.get('channel', ''),
            }
    except subprocess.TimeoutExpired:
        logger.warning(f"Timeout getting Instagram video info")
    except Exception as e:
        logger.error(f"Error getting Instagram video info: {e}")
    return {}

async def get_video_content(url: str, platform: str, video_id: Optional[str]) -> Dict[str, Any]:
    """Get video content (transcript, title, description) based on platform"""
    content = {
        'transcript': None,
        'title': None,
        'description': None,
        'uploader': None
    }
    
    if platform == 'youtube' and video_id:
        # Try to get transcript first
        transcript = await get_youtube_transcript(video_id)
        content['transcript'] = transcript
        
        # Get video info (title, description)
        video_info = await get_youtube_video_info(video_id)
        content['title'] = video_info.get('title')
        content['description'] = video_info.get('description')
        content['uploader'] = video_info.get('uploader')
        
    elif platform == 'tiktok':
        video_info = await get_tiktok_video_info(url)
        content['title'] = video_info.get('title')
        content['description'] = video_info.get('description')
        content['uploader'] = video_info.get('uploader')
        
    elif platform == 'instagram':
        video_info = await get_instagram_video_info(url)
        content['title'] = video_info.get('title')
        content['description'] = video_info.get('description')
        content['uploader'] = video_info.get('uploader')
    
    return content

# ==================== AI EXTRACTION ====================

async def extract_recipe_with_ai(video_url: str, platform: str) -> Dict[str, Any]:
    """Use GPT-4o to extract recipe ingredients from video content"""
    
    # First, extract video ID
    video_id = extract_video_id(video_url, platform)
    
    # Get actual video content (transcript, title, description)
    logger.info(f"Fetching video content from {platform} for URL: {video_url}")
    video_content = await get_video_content(video_url, platform, video_id)
    
    # Build context for AI
    context_parts = []
    
    if video_content.get('title'):
        context_parts.append(f"Video Title: {video_content['title']}")
    
    if video_content.get('uploader'):
        context_parts.append(f"Creator: {video_content['uploader']}")
    
    if video_content.get('transcript'):
        # Limit transcript to avoid token limits (first 8000 chars)
        transcript = video_content['transcript'][:8000]
        context_parts.append(f"Video Transcript/Captions:\n{transcript}")
    
    if video_content.get('description'):
        # Limit description to first 2000 chars
        description = video_content['description'][:2000]
        context_parts.append(f"Video Description:\n{description}")
    
    # Check if we have any content
    has_content = bool(context_parts)
    
    if has_content:
        video_context = "\n\n".join(context_parts)
        logger.info(f"Successfully extracted video content. Transcript: {bool(video_content.get('transcript'))}, Title: {bool(video_content.get('title'))}")
    else:
        video_context = f"No content could be extracted from this {platform} video URL: {video_url}"
        logger.warning(f"No content could be extracted from video: {video_url}")
    
    system_message = """You are a recipe extraction AI expert. Your job is to analyze video content (transcripts, titles, descriptions) and extract the exact recipe being shown.

IMPORTANT RULES:
1. Extract the ACTUAL recipe from the provided content - do NOT make up or guess recipes
2. If the content clearly shows a recipe, extract all ingredients with precise quantities
3. If the content is not about cooking/recipes, indicate that in your response
4. Return valid JSON only, no markdown formatting
5. Be accurate with ingredient quantities and names as mentioned in the video"""
    
    prompt = f"""Analyze the following {platform} video content and extract the recipe information.

{video_context}

Based on this content, extract the recipe details. Return ONLY a JSON object with this exact structure (no markdown, no extra text):
{{
    "title": "Exact recipe name from the video",
    "servings": 4,
    "prep_time": "X mins",
    "cook_time": "X mins", 
    "ingredients": [
        {{
            "name": "ingredient name",
            "quantity": "amount",
            "unit": "unit of measurement",
            "category": "one of: produce, dairy, meat, pantry, frozen, bakery, beverages, other"
        }}
    ],
    "instructions": [
        "Step 1: ...",
        "Step 2: ..."
    ],
    "is_recipe": true
}}

If the video content is NOT about a recipe or you cannot determine the recipe, return:
{{
    "title": "Unknown",
    "is_recipe": false,
    "error": "This video does not appear to contain a recipe"
}}"""

    try:
        # Create LlmChat instance with OpenAI model
        llm = LlmChat(
            api_key=EMERGENT_API_KEY,
            session_id=str(uuid.uuid4()),
            system_message=system_message
        ).with_model("openai", "gpt-4o")
        
        # Send message and get response
        user_msg = UserMessage(text=prompt)
        response = await llm.send_message(user_msg)
        
        # Parse JSON from response
        response_text = response.strip()
        
        # Remove markdown code blocks if present
        if response_text.startswith('```'):
            lines = response_text.split('\n')
            # Find the actual JSON content
            json_lines = []
            in_json = False
            for line in lines:
                if line.startswith('```') and not in_json:
                    in_json = True
                    continue
                elif line.startswith('```') and in_json:
                    break
                elif in_json:
                    json_lines.append(line)
            response_text = '\n'.join(json_lines)
        
        # Find JSON object in response
        json_start = response_text.find('{')
        json_end = response_text.rfind('}') + 1
        if json_start != -1 and json_end > json_start:
            json_str = response_text[json_start:json_end]
            result = json.loads(json_str)
            
            # Check if it's actually a recipe
            if result.get('is_recipe') == False:
                raise HTTPException(
                    status_code=400, 
                    detail=result.get('error', 'This video does not contain a recipe')
                )
            
            return result
        else:
            raise ValueError("No JSON found in response")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"AI extraction error: {e}")
        
        # If we had content but AI failed, provide more specific error
        if has_content:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to extract recipe from video content. Please try a different video."
            )
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Could not access video content. Please ensure the video is public and contains a recipe."
            )

# ==================== AUTH ENDPOINTS ====================

@api_router.post("/auth/register")
async def register(user_data: UserCreate):
    # Check if user exists
    existing = await db.users.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email,
        name=user_data.name
    )
    
    user_dict = user.dict()
    user_dict['password_hash'] = hash_password(user_data.password)
    
    await db.users.insert_one(user_dict)
    
    token = create_token(user.id)
    
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "subscription_plan": user.subscription_plan,
            "recipes_used_this_month": user.recipes_used_this_month
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user_data = await db.users.find_one({"email": credentials.email})
    if not user_data:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not verify_password(credentials.password, user_data.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    # Check if month has changed
    current_month = datetime.utcnow().strftime("%Y-%m")
    if user_data.get('current_month') != current_month:
        await db.users.update_one(
            {"id": user_data['id']},
            {"$set": {"recipes_used_this_month": 0, "current_month": current_month}}
        )
        user_data['recipes_used_this_month'] = 0
    
    token = create_token(user_data['id'])
    
    return {
        "token": token,
        "user": {
            "id": user_data['id'],
            "email": user_data['email'],
            "name": user_data['name'],
            "subscription_plan": user_data.get('subscription_plan', 'normal'),
            "recipes_used_this_month": user_data.get('recipes_used_this_month', 0)
        }
    }

@api_router.get("/auth/me")
async def get_me(user: User = Depends(get_current_user)):
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "subscription_plan": user.subscription_plan,
        "recipes_used_this_month": user.recipes_used_this_month
    }

# ==================== RECIPE ENDPOINTS ====================

@api_router.post("/recipes/extract")
async def extract_recipe(request: RecipeExtractRequest, user: User = Depends(get_current_user)):
    # Check subscription limits
    monthly_limit = 5 if user.subscription_plan == 'normal' else float('inf')
    
    if user.recipes_used_this_month >= monthly_limit:
        raise HTTPException(
            status_code=403,
            detail=f"Monthly recipe limit reached ({int(monthly_limit)} recipes). Upgrade to Chef plan for unlimited recipes!"
        )
    
    # Detect platform
    platform = detect_platform(request.video_url)
    if platform == 'unknown':
        raise HTTPException(
            status_code=400,
            detail="Unsupported video platform. Please use YouTube, TikTok, or Instagram links."
        )
    
    # Extract recipe using AI
    recipe_data = await extract_recipe_with_ai(request.video_url, platform)
    
    # Create recipe object
    ingredients = [
        Ingredient(
            name=ing.get('name', ''),
            quantity=str(ing.get('quantity', '')),
            unit=ing.get('unit', ''),
            category=ing.get('category', 'other')
        )
        for ing in recipe_data.get('ingredients', [])
    ]
    
    recipe = Recipe(
        user_id=user.id,
        title=recipe_data.get('title', 'Extracted Recipe'),
        source_url=request.video_url,
        source_platform=platform,
        ingredients=ingredients,
        instructions=recipe_data.get('instructions', []),
        servings=recipe_data.get('servings', 4),
        prep_time=recipe_data.get('prep_time'),
        cook_time=recipe_data.get('cook_time')
    )
    
    # Save to database
    await db.recipes.insert_one(recipe.dict())
    
    # Update user's recipe count
    await db.users.update_one(
        {"id": user.id},
        {"$inc": {"recipes_used_this_month": 1}}
    )
    
    return recipe.dict()

@api_router.get("/recipes")
async def get_recipes(user: User = Depends(get_current_user)):
    recipes = await db.recipes.find({"user_id": user.id}).sort("created_at", -1).to_list(100)
    return convert_mongo_doc(recipes)

@api_router.get("/recipes/{recipe_id}")
async def get_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user.id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return convert_mongo_doc(recipe)

@api_router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str, user: User = Depends(get_current_user)):
    result = await db.recipes.delete_one({"id": recipe_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return {"message": "Recipe deleted"}

@api_router.patch("/recipes/{recipe_id}/ingredients/{ingredient_index}/toggle")
async def toggle_ingredient(recipe_id: str, ingredient_index: int, user: User = Depends(get_current_user)):
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user.id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    ingredients = recipe.get('ingredients', [])
    if ingredient_index < 0 or ingredient_index >= len(ingredients):
        raise HTTPException(status_code=400, detail="Invalid ingredient index")
    
    ingredients[ingredient_index]['checked'] = not ingredients[ingredient_index].get('checked', False)
    
    await db.recipes.update_one(
        {"id": recipe_id},
        {"$set": {"ingredients": ingredients}}
    )
    
    return {"checked": ingredients[ingredient_index]['checked']}

# ==================== MEAL PLAN ENDPOINTS ====================

@api_router.post("/meal-plan")
async def add_to_meal_plan(recipe_id: str, date: str, meal_type: str, user: User = Depends(get_current_user)):
    # Only Chef plan users can use meal planning
    if user.subscription_plan != 'chef':
        raise HTTPException(
            status_code=403,
            detail="Meal planning is only available for Chef plan subscribers. Upgrade now!"
        )
    
    recipe = await db.recipes.find_one({"id": recipe_id, "user_id": user.id})
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    
    entry = MealPlanEntry(
        user_id=user.id,
        recipe_id=recipe_id,
        recipe_title=recipe.get('title', 'Recipe'),
        date=date,
        meal_type=meal_type
    )
    
    await db.meal_plans.insert_one(entry.dict())
    return entry.dict()

@api_router.get("/meal-plan")
async def get_meal_plan(start_date: str = None, end_date: str = None, user: User = Depends(get_current_user)):
    query = {"user_id": user.id}
    
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    entries = await db.meal_plans.find(query).sort("date", 1).to_list(100)
    return convert_mongo_doc(entries)

@api_router.delete("/meal-plan/{entry_id}")
async def remove_from_meal_plan(entry_id: str, user: User = Depends(get_current_user)):
    result = await db.meal_plans.delete_one({"id": entry_id, "user_id": user.id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Meal plan entry not found")
    return {"message": "Entry removed"}

# ==================== SUBSCRIPTION ENDPOINTS ====================

@api_router.post("/subscription/upgrade")
async def upgrade_subscription(request: UpgradeRequest, user: User = Depends(get_current_user)):
    if request.plan not in ['chef']:
        raise HTTPException(status_code=400, detail="Invalid plan")
    
    # In production, this would process payment through Stripe
    # For MVP, we'll mock the upgrade
    await db.users.update_one(
        {"id": user.id},
        {"$set": {"subscription_plan": request.plan}}
    )
    
    return {
        "message": f"Successfully upgraded to {request.plan} plan!",
        "subscription_plan": request.plan
    }

@api_router.get("/subscription/plans")
async def get_plans():
    return {
        "plans": [
            {
                "id": "normal",
                "name": "Normal",
                "price": 0,
                "features": [
                    "5 recipe extractions per month",
                    "Categorized grocery lists",
                    "Save recipes"
                ]
            },
            {
                "id": "chef",
                "name": "Chef",
                "price": 9.99,
                "features": [
                    "Unlimited recipe extractions",
                    "Meal planning calendar",
                    "Priority support",
                    "Export grocery lists"
                ]
            }
        ]
    }

# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Clip-to-Cart API is running!"}

@api_router.get("/health")
async def health():
    return {"status": "healthy", "timestamp": datetime.utcnow().isoformat()}

# Include the router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()

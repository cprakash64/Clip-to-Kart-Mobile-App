#!/usr/bin/env python3
"""
Comprehensive Backend API Testing for Clip-to-Cart App
Tests all authentication, recipe extraction, subscription, and meal planning endpoints
"""

import requests
import json
import time
from datetime import datetime, timedelta
import uuid

# Backend URL from frontend environment
BACKEND_URL = "https://meal-cart-ai.preview.emergentagent.com/api"

class ClipToCartTester:
    def __init__(self):
        self.base_url = BACKEND_URL
        self.auth_token = None
        self.user_data = None
        self.test_results = []
        self.created_recipe_id = None
        
    def log_result(self, test_name, success, message, details=None):
        """Log test results"""
        result = {
            "test": test_name,
            "success": success,
            "message": message,
            "details": details,
            "timestamp": datetime.now().isoformat()
        }
        self.test_results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name} - {message}")
        if details:
            print(f"   Details: {details}")
    
    def test_health_check(self):
        """Test basic health endpoints"""
        try:
            # Test root endpoint
            response = requests.get(f"{self.base_url}/")
            if response.status_code == 200:
                self.log_result("Health Check - Root", True, "API root endpoint accessible")
            else:
                self.log_result("Health Check - Root", False, f"Root endpoint failed: {response.status_code}")
            
            # Test health endpoint
            response = requests.get(f"{self.base_url}/health")
            if response.status_code == 200:
                data = response.json()
                self.log_result("Health Check - Health", True, f"Health endpoint working: {data.get('status')}")
            else:
                self.log_result("Health Check - Health", False, f"Health endpoint failed: {response.status_code}")
                
        except Exception as e:
            self.log_result("Health Check", False, f"Connection error: {str(e)}")
    
    def test_user_registration(self):
        """Test user registration endpoint"""
        try:
            # Generate unique test data
            test_email = f"testuser_{int(time.time())}@example.com"
            test_data = {
                "email": test_email,
                "password": "SecurePassword123!",
                "name": "Test User"
            }
            
            response = requests.post(f"{self.base_url}/auth/register", json=test_data)
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    self.auth_token = data["token"]
                    self.user_data = data["user"]
                    self.log_result("User Registration", True, "User registered successfully", 
                                  f"User ID: {data['user']['id']}, Plan: {data['user']['subscription_plan']}")
                else:
                    self.log_result("User Registration", False, "Missing token or user data in response")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("User Registration", False, f"Registration failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("User Registration", False, f"Registration error: {str(e)}")
    
    def test_user_login(self):
        """Test user login endpoint"""
        if not self.user_data:
            self.log_result("User Login", False, "Cannot test login - no user created")
            return
            
        try:
            login_data = {
                "email": self.user_data["email"],
                "password": "SecurePassword123!"
            }
            
            response = requests.post(f"{self.base_url}/auth/login", json=login_data)
            
            if response.status_code == 200:
                data = response.json()
                if "token" in data and "user" in data:
                    # Update token for subsequent tests
                    self.auth_token = data["token"]
                    self.log_result("User Login", True, "Login successful", 
                                  f"Token received, User: {data['user']['name']}")
                else:
                    self.log_result("User Login", False, "Missing token or user data in login response")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("User Login", False, f"Login failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("User Login", False, f"Login error: {str(e)}")
    
    def test_get_current_user(self):
        """Test get current user endpoint"""
        if not self.auth_token:
            self.log_result("Get Current User", False, "Cannot test - no auth token")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{self.base_url}/auth/me", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and "email" in data:
                    self.log_result("Get Current User", True, "User data retrieved successfully", 
                                  f"ID: {data['id']}, Email: {data['email']}")
                else:
                    self.log_result("Get Current User", False, "Incomplete user data in response")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Get Current User", False, f"Get user failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Get Current User", False, f"Get user error: {str(e)}")
    
    def test_recipe_extraction(self):
        """Test recipe extraction with different video URLs"""
        if not self.auth_token:
            self.log_result("Recipe Extraction", False, "Cannot test - no auth token")
            return
            
        test_urls = [
            ("https://www.youtube.com/watch?v=dQw4w9WgXcQ", "YouTube"),
            ("https://www.tiktok.com/@user/video/123456789", "TikTok"),
            ("https://www.instagram.com/reel/ABC123DEF", "Instagram")
        ]
        
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        
        for url, platform in test_urls:
            try:
                extract_data = {"video_url": url}
                response = requests.post(f"{self.base_url}/recipes/extract", 
                                       json=extract_data, headers=headers)
                
                if response.status_code == 200:
                    data = response.json()
                    if "id" in data and "ingredients" in data:
                        # Store first recipe ID for later tests
                        if not self.created_recipe_id:
                            self.created_recipe_id = data["id"]
                        self.log_result(f"Recipe Extraction - {platform}", True, 
                                      f"Recipe extracted successfully", 
                                      f"Title: {data.get('title')}, Ingredients: {len(data.get('ingredients', []))}")
                    else:
                        self.log_result(f"Recipe Extraction - {platform}", False, 
                                      "Incomplete recipe data in response")
                else:
                    error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                    self.log_result(f"Recipe Extraction - {platform}", False, 
                                  f"Extraction failed: {response.status_code} - {error_msg}")
                    
            except Exception as e:
                self.log_result(f"Recipe Extraction - {platform}", False, f"Extraction error: {str(e)}")
        
        # Test invalid URL
        try:
            invalid_data = {"video_url": "https://invalid-platform.com/video/123"}
            response = requests.post(f"{self.base_url}/recipes/extract", 
                                   json=invalid_data, headers=headers)
            
            if response.status_code == 400:
                self.log_result("Recipe Extraction - Invalid URL", True, 
                              "Correctly rejected invalid platform URL")
            else:
                self.log_result("Recipe Extraction - Invalid URL", False, 
                              f"Should have rejected invalid URL but got: {response.status_code}")
                
        except Exception as e:
            self.log_result("Recipe Extraction - Invalid URL", False, f"Error testing invalid URL: {str(e)}")
    
    def test_get_recipes(self):
        """Test getting user's recipes"""
        if not self.auth_token:
            self.log_result("Get Recipes", False, "Cannot test - no auth token")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{self.base_url}/recipes", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list):
                    self.log_result("Get Recipes", True, f"Retrieved {len(data)} recipes successfully")
                else:
                    self.log_result("Get Recipes", False, "Response is not a list of recipes")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Get Recipes", False, f"Get recipes failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Get Recipes", False, f"Get recipes error: {str(e)}")
    
    def test_get_single_recipe(self):
        """Test getting a single recipe by ID"""
        if not self.auth_token or not self.created_recipe_id:
            self.log_result("Get Single Recipe", False, "Cannot test - no auth token or recipe ID")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.get(f"{self.base_url}/recipes/{self.created_recipe_id}", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if "id" in data and data["id"] == self.created_recipe_id:
                    self.log_result("Get Single Recipe", True, "Recipe retrieved successfully", 
                                  f"Title: {data.get('title')}")
                else:
                    self.log_result("Get Single Recipe", False, "Recipe ID mismatch in response")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Get Single Recipe", False, f"Get recipe failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Get Single Recipe", False, f"Get recipe error: {str(e)}")
    
    def test_toggle_ingredient(self):
        """Test toggling ingredient checked status"""
        if not self.auth_token or not self.created_recipe_id:
            self.log_result("Toggle Ingredient", False, "Cannot test - no auth token or recipe ID")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            # Toggle first ingredient (index 0)
            response = requests.patch(f"{self.base_url}/recipes/{self.created_recipe_id}/ingredients/0/toggle", 
                                    headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if "checked" in data:
                    self.log_result("Toggle Ingredient", True, f"Ingredient toggled successfully", 
                                  f"Checked status: {data['checked']}")
                else:
                    self.log_result("Toggle Ingredient", False, "Missing checked status in response")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Toggle Ingredient", False, f"Toggle failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Toggle Ingredient", False, f"Toggle error: {str(e)}")
    
    def test_subscription_plans(self):
        """Test getting subscription plans"""
        try:
            response = requests.get(f"{self.base_url}/subscription/plans")
            
            if response.status_code == 200:
                data = response.json()
                if "plans" in data and isinstance(data["plans"], list):
                    plans = data["plans"]
                    plan_names = [p.get("name") for p in plans]
                    self.log_result("Get Subscription Plans", True, f"Retrieved {len(plans)} plans", 
                                  f"Plans: {', '.join(plan_names)}")
                else:
                    self.log_result("Get Subscription Plans", False, "Invalid plans data structure")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Get Subscription Plans", False, f"Get plans failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Get Subscription Plans", False, f"Get plans error: {str(e)}")
    
    def test_subscription_upgrade(self):
        """Test subscription upgrade"""
        if not self.auth_token:
            self.log_result("Subscription Upgrade", False, "Cannot test - no auth token")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            upgrade_data = {"plan": "chef"}
            response = requests.post(f"{self.base_url}/subscription/upgrade", 
                                   json=upgrade_data, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if "subscription_plan" in data and data["subscription_plan"] == "chef":
                    self.log_result("Subscription Upgrade", True, "Successfully upgraded to Chef plan", 
                                  f"Message: {data.get('message')}")
                else:
                    self.log_result("Subscription Upgrade", False, "Upgrade response missing plan confirmation")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Subscription Upgrade", False, f"Upgrade failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Subscription Upgrade", False, f"Upgrade error: {str(e)}")
    
    def test_meal_planning(self):
        """Test meal planning endpoints (Chef plan required)"""
        if not self.auth_token or not self.created_recipe_id:
            self.log_result("Meal Planning", False, "Cannot test - no auth token or recipe ID")
            return
            
        headers = {"Authorization": f"Bearer {self.auth_token}"}
        
        # Test adding to meal plan
        try:
            tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
            params = {
                "recipe_id": self.created_recipe_id,
                "date": tomorrow,
                "meal_type": "dinner"
            }
            response = requests.post(f"{self.base_url}/meal-plan", params=params, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                meal_entry_id = data.get("id")
                self.log_result("Add to Meal Plan", True, "Meal plan entry added successfully", 
                              f"Date: {tomorrow}, Meal: dinner")
                
                # Test getting meal plan
                response = requests.get(f"{self.base_url}/meal-plan", headers=headers)
                if response.status_code == 200:
                    meal_data = response.json()
                    if isinstance(meal_data, list):
                        self.log_result("Get Meal Plan", True, f"Retrieved {len(meal_data)} meal plan entries")
                        
                        # Test removing from meal plan
                        if meal_entry_id:
                            response = requests.delete(f"{self.base_url}/meal-plan/{meal_entry_id}", headers=headers)
                            if response.status_code == 200:
                                self.log_result("Remove from Meal Plan", True, "Meal plan entry removed successfully")
                            else:
                                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                                self.log_result("Remove from Meal Plan", False, f"Remove failed: {response.status_code} - {error_msg}")
                    else:
                        self.log_result("Get Meal Plan", False, "Meal plan response is not a list")
                else:
                    error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                    self.log_result("Get Meal Plan", False, f"Get meal plan failed: {response.status_code} - {error_msg}")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Add to Meal Plan", False, f"Add to meal plan failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Meal Planning", False, f"Meal planning error: {str(e)}")
    
    def test_delete_recipe(self):
        """Test deleting a recipe"""
        if not self.auth_token or not self.created_recipe_id:
            self.log_result("Delete Recipe", False, "Cannot test - no auth token or recipe ID")
            return
            
        try:
            headers = {"Authorization": f"Bearer {self.auth_token}"}
            response = requests.delete(f"{self.base_url}/recipes/{self.created_recipe_id}", headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                if "message" in data:
                    self.log_result("Delete Recipe", True, "Recipe deleted successfully", 
                                  f"Message: {data['message']}")
                else:
                    self.log_result("Delete Recipe", False, "Delete response missing message")
            else:
                error_msg = response.json().get("detail", "Unknown error") if response.content else "No response content"
                self.log_result("Delete Recipe", False, f"Delete failed: {response.status_code} - {error_msg}")
                
        except Exception as e:
            self.log_result("Delete Recipe", False, f"Delete error: {str(e)}")
    
    def run_all_tests(self):
        """Run all backend API tests"""
        print(f"🚀 Starting Clip-to-Cart Backend API Tests")
        print(f"📡 Backend URL: {self.base_url}")
        print("=" * 60)
        
        # Health checks
        self.test_health_check()
        
        # Authentication tests
        self.test_user_registration()
        self.test_user_login()
        self.test_get_current_user()
        
        # Recipe tests
        self.test_recipe_extraction()
        self.test_get_recipes()
        self.test_get_single_recipe()
        self.test_toggle_ingredient()
        
        # Subscription tests
        self.test_subscription_plans()
        self.test_subscription_upgrade()
        
        # Meal planning tests (requires Chef plan)
        self.test_meal_planning()
        
        # Cleanup
        self.test_delete_recipe()
        
        # Summary
        self.print_summary()
    
    def print_summary(self):
        """Print test summary"""
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.test_results if r["success"])
        failed = len(self.test_results) - passed
        
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"📈 Success Rate: {(passed/len(self.test_results)*100):.1f}%")
        
        if failed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.test_results:
                if not result["success"]:
                    print(f"   ❌ {result['test']}: {result['message']}")
        
        print("\n" + "=" * 60)

if __name__ == "__main__":
    tester = ClipToCartTester()
    tester.run_all_tests()
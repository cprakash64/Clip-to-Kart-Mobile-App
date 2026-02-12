#!/usr/bin/env python3
"""
Debug specific failing endpoints
"""

import requests
import json

BACKEND_URL = "https://meal-cart-ai.preview.emergentagent.com/api"

def debug_endpoints():
    # First register a user to get auth token
    test_data = {
        "email": "debuguser@example.com",
        "password": "SecurePassword123!",
        "name": "Debug User"
    }
    
    response = requests.post(f"{BACKEND_URL}/auth/register", json=test_data)
    if response.status_code != 200:
        print("Failed to register user for debugging")
        return
    
    auth_token = response.json()["token"]
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Test get recipes endpoint
    print("=== Testing GET /recipes ===")
    response = requests.get(f"{BACKEND_URL}/recipes", headers=headers)
    print(f"Status Code: {response.status_code}")
    print(f"Headers: {dict(response.headers)}")
    print(f"Raw Content: {response.content}")
    print(f"Text: {response.text}")
    
    # Create a recipe first
    print("\n=== Creating a recipe first ===")
    extract_data = {"video_url": "https://www.youtube.com/watch?v=test"}
    response = requests.post(f"{BACKEND_URL}/recipes/extract", json=extract_data, headers=headers)
    print(f"Extract Status: {response.status_code}")
    if response.status_code == 200:
        recipe_data = response.json()
        recipe_id = recipe_data["id"]
        print(f"Created recipe ID: {recipe_id}")
        
        # Now test get recipes again
        print("\n=== Testing GET /recipes after creating recipe ===")
        response = requests.get(f"{BACKEND_URL}/recipes", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Raw Content: {response.content}")
        print(f"Text: {response.text}")
        
        # Test get single recipe
        print(f"\n=== Testing GET /recipes/{recipe_id} ===")
        response = requests.get(f"{BACKEND_URL}/recipes/{recipe_id}", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Raw Content: {response.content}")
        print(f"Text: {response.text}")
        
        # Test meal plan
        print(f"\n=== Testing GET /meal-plan ===")
        response = requests.get(f"{BACKEND_URL}/meal-plan", headers=headers)
        print(f"Status Code: {response.status_code}")
        print(f"Raw Content: {response.content}")
        print(f"Text: {response.text}")

if __name__ == "__main__":
    debug_endpoints()
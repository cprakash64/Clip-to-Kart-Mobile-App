#!/usr/bin/env python3
"""
Simple debug test
"""

import requests
import json
import time

BACKEND_URL = "https://clip-to-cart.preview.emergentagent.com/api"

def simple_test():
    # Test health first
    response = requests.get(f"{BACKEND_URL}/health")
    print(f"Health: {response.status_code} - {response.text}")
    
    # Test registration with unique email
    test_data = {
        "email": f"debuguser_{int(time.time())}@example.com",
        "password": "SecurePassword123!",
        "name": "Debug User"
    }
    
    response = requests.post(f"{BACKEND_URL}/auth/register", json=test_data)
    print(f"Register: {response.status_code}")
    if response.status_code != 200:
        print(f"Register error: {response.text}")
        return
    
    auth_token = response.json()["token"]
    headers = {"Authorization": f"Bearer {auth_token}"}
    
    # Test get recipes (should be empty)
    response = requests.get(f"{BACKEND_URL}/recipes", headers=headers)
    print(f"Get recipes: {response.status_code} - {response.text}")

if __name__ == "__main__":
    simple_test()
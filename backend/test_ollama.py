#!/usr/bin/env python3
"""
Test Ollama API directly to debug the 400 error
"""

import requests
import json

# Test 1: List available models
print("=" * 60)
print("TEST 1: List Ollama Models")
print("=" * 60)
try:
    response = requests.get("http://localhost:11434/api/tags")
    print(f"Status: {response.status_code}")
    if response.status_code == 200:
        data = response.json()
        print(f"Found {len(data.get('models', []))} models:")
        for model in data.get('models', []):
            print(f"  - {model.get('name')}")
    else:
        print(f"Error: {response.text}")
except Exception as e:
    print(f"Error: {e}")

# Test 2: Try translation with exact model name from list
print("\n" + "=" * 60)
print("TEST 2: Test Translation")
print("=" * 60)

model_name = input("Enter exact model name to test (e.g., qwen2.5:14b): ").strip()
if not model_name:
    model_name = "qwen2.5:14b"

test_data = {
    "model": model_name,
    "prompt": "Translate the following text from English to Russian.\nProvide ONLY the translation, no explanations.\n\nSource text:\nCounter overrun\n\nTranslation:",
    "stream": False
}

print(f"\nTesting with model: {model_name}")
print(f"Request: {json.dumps(test_data, indent=2)}")

try:
    response = requests.post(
        "http://localhost:11434/api/generate",
        json=test_data,
        timeout=60
    )
    print(f"\nStatus: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        translation = result.get("response", "").strip()
        print(f"✅ Success!")
        print(f"Translation: {translation}")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")
        
except Exception as e:
    print(f"❌ Exception: {e}")

# Test 3: Try with simplified request
print("\n" + "=" * 60)
print("TEST 3: Minimal Request")
print("=" * 60)

minimal_data = {
    "model": model_name,
    "prompt": "Hello",
    "stream": False
}

print(f"Request: {json.dumps(minimal_data, indent=2)}")

try:
    response = requests.post(
        "http://localhost:11434/api/generate",
        json=minimal_data,
        timeout=30
    )
    print(f"Status: {response.status_code}")
    
    if response.status_code == 200:
        result = response.json()
        print(f"✅ Success!")
        print(f"Response: {result.get('response', '')[:100]}...")
    else:
        print(f"❌ Error: {response.status_code}")
        print(f"Response: {response.text}")
        
except Exception as e:
    print(f"❌ Exception: {e}")

print("\n" + "=" * 60)
print("DONE - Check results above")
print("=" * 60)
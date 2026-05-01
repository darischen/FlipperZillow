#!/usr/bin/env python
"""Compare image quality from different RapidAPI real estate endpoints."""

import os
import json
import requests
from PIL import Image
from io import BytesIO

api_key = os.environ.get('RAPIDAPI_KEY')
if not api_key:
    print("❌ RAPIDAPI_KEY not set in environment")
    exit(1)

print("=" * 80)
print("TESTING RAPIDAPI REAL ESTATE ENDPOINTS")
print("=" * 80)

# Test parameters - search San Diego
location = "San Diego, CA"
test_params = {
    'location': location,
    'limit': '3',  # Get a few results
}

# ── Endpoint 1: Current (realtor-search) ──────────────────
print("\n1️⃣  CURRENT: realtor-search.p.rapidapi.com")
print("   Testing for photos...\n")

try:
    headers_current = {
        'x-rapidapi-key': api_key,
        'x-rapidapi-host': 'realtor-search.p.rapidapi.com'
    }

    url = 'https://realtor-search.p.rapidapi.com/properties/search-buy'
    response = requests.get(url, headers=headers_current, params=test_params, timeout=10)

    if response.ok:
        data = response.json()
        results = data.get('data', {}).get('home_search', {}).get('results', [])

        if results and 'photos' in results[0]:
            photo_url = results[0]['photos'][0]['href']
            print(f"   URL: {photo_url}")

            # Check dimensions
            resp = requests.get(photo_url, timeout=5)
            if resp.ok:
                img = Image.open(BytesIO(resp.content))
                print(f"   ✓ Dimensions: {img.size}")
        else:
            print(f"   ⚠️  No photos in response")
    else:
        print(f"   ✗ HTTP {response.status_code}")

except Exception as e:
    print(f"   ✗ Error: {str(e)[:80]}")

# ── Endpoint 2: New endpoint (us-real-estate-listings) ────
print("\n2️⃣  NEW: us-real-estate-listings")
print("   Testing for photos...\n")

try:
    headers_new = {
        'x-rapidapi-key': api_key,
        'x-rapidapi-host': 'us-real-estate-listings.p.rapidapi.com'
    }

    # The new API might have different parameter names
    new_params = {
        'location': location,
        'limit': '3',
    }

    # Try the endpoint from the playground
    url = 'https://us-real-estate-listings.p.rapidapi.com/listings'
    response = requests.get(url, headers=headers_new, params=new_params, timeout=10)

    if response.ok:
        data = response.json()
        print(f"   Response structure: {list(data.keys())}")

        # Explore the response to find images
        results = data.get('listings', []) or data.get('results', []) or data.get('data', [])

        if isinstance(results, list) and len(results) > 0:
            result = results[0]
            print(f"   First result keys: {list(result.keys())[:10]}")

            # Look for image fields
            image_urls = []
            for key in ['image', 'images', 'photo', 'photos', 'image_url', 'photo_url', 'picture', 'pictures']:
                if key in result:
                    val = result[key]
                    if isinstance(val, str):
                        image_urls.append(val)
                    elif isinstance(val, list):
                        image_urls.extend(val)

            if image_urls:
                photo_url = image_urls[0] if isinstance(image_urls[0], str) else image_urls[0].get('url', '')
                print(f"\n   URL: {photo_url[:100]}...")

                # Check dimensions
                try:
                    resp = requests.get(photo_url, timeout=5, headers={'User-Agent': 'Mozilla/5.0'})
                    if resp.ok:
                        img = Image.open(BytesIO(resp.content))
                        print(f"   ✓ Dimensions: {img.size}")
                    else:
                        print(f"   ✗ Photo HTTP {resp.status_code}")
                except Exception as e:
                    print(f"   ⚠️  Could not fetch photo: {str(e)[:60]}")
            else:
                print(f"   ⚠️  No image fields found in response")
                print(f"   Available fields: {list(result.keys())}")
        else:
            print(f"   ⚠️  No results in response")
            print(f"   Response keys: {list(data.keys())}")
    else:
        print(f"   ✗ HTTP {response.status_code}")
        print(f"   Response: {response.text[:200]}")

except Exception as e:
    print(f"   ✗ Error: {str(e)[:80]}")

print("\n" + "=" * 80)
print("COMPARISON")
print("=" * 80)

print("""
If the new endpoint returns:
  - ✓ Images at 640×480+ → Use it!
  - ✓ Images at 1920×1440+ → Definitely use it!
  - ✓ More images per listing → Even better

Then we can:
  1. Create a new realtorClient function for this API
  2. Update the web UI to use the new endpoint
  3. Remove upscaling (no longer needed)
  4. Get better room classification automatically

If it has the same 120×80 images:
  1. Upscaling is still our best option
  2. Keep the current endpoint
  3. Plan for Redfin scraper (Phase 2)
""")

#!/usr/bin/env python
"""Test that the URL upgrade to full-resolution works correctly."""

import sys
from pathlib import Path
import json
from PIL import Image
import io
import requests

sys.path.insert(0, str(Path(__file__).parent))
from utils import download_image

print("=" * 80)
print("TESTING REALTOR.COM CDN URL UPGRADE")
print("=" * 80)

# Get a test URL from cache
cache_path = Path(__file__).parent.parent / "flipperzillow" / "src" / "data" / "realtor_cache.json"

if not cache_path.exists():
    print(f"❌ Cache not found: {cache_path}")
    print("   Run a property search first")
    sys.exit(1)

with open(cache_path, 'r') as f:
    cache = json.load(f)

# Find a realtor.com CDN URL
test_urls = []
for key, entry in cache.items():
    data = entry.get('data', {})
    results = data.get('data', {}).get('home_search', {}).get('results', []) or \
              data.get('data', {}).get('results', [])

    for result in results:
        if 'photos' in result:
            for photo in result['photos']:
                url = photo.get('href', '')
                if 'ap.rdcpix.com' in url:
                    test_urls.append(url)
                    if len(test_urls) >= 3:
                        break
    if test_urls:
        break

if not test_urls:
    print("❌ No realtor.com CDN URLs found in cache")
    print("   API returned URLs from different domain")
    sys.exit(1)

print(f"\n✓ Found {len(test_urls)} realtor.com CDN URLs\n")

for i, original_url in enumerate(test_urls):
    print(f"[{i+1}] Testing URL upgrade")
    print(f"    Original: {original_url[:80]}...")

    # Show the transformation
    if original_url.endswith("s.jpg"):
        upgraded = original_url[:-5] + "rd-w1280_h960.webp"
        print(f"    Upgraded: {upgraded[:80]}...")

        try:
            print(f"    Fetching original size...", end="", flush=True)
            resp1 = requests.get(original_url, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0'
            })
            if resp1.ok:
                img1 = Image.open(io.BytesIO(resp1.content))
                print(f" {img1.size}")
            else:
                print(f" HTTP {resp1.status_code}")

            print(f"    Fetching upgraded size...", end="", flush=True)
            resp2 = requests.get(upgraded, timeout=10, headers={
                'User-Agent': 'Mozilla/5.0'
            })
            if resp2.ok:
                img2 = Image.open(io.BytesIO(resp2.content))
                print(f" {img2.size}")

                if img2.size[0] >= 1280 and img2.size[1] >= 960:
                    print(f"    ✅ SUCCESS! Got full-resolution image")
                else:
                    print(f"    ⚠️  Got {img2.size} (expected >= 1280×960)")
            else:
                print(f" HTTP {resp2.status_code}")

        except Exception as e:
            print(f" Error: {str(e)[:60]}")

    else:
        print(f"    ⚠️  URL doesn't end with 's.jpg' (format: {original_url[-20:]})")

print("\n" + "=" * 80)
print("TEST RESULT")
print("=" * 80)

print("""
If you see ✅ SUCCESS above:
  ✓ The URL upgrade works perfectly
  ✓ We can get 1280×960 images (or larger)
  ✓ No need for upscaling anymore
  ✓ DFormer will work much better with full-res images

Next step: Run the pipeline with real property data!
  cd nvidia_local
  python test_upscaling.py
""")

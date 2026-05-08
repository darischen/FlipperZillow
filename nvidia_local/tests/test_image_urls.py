#!/usr/bin/env python
"""Test if realtor.com image URLs support size parameters."""

import sys
import json
from pathlib import Path
from PIL import Image
import io
import requests

cache_path = Path(__file__).parent.parent / "flipperzillow" / "src" / "data" / "realtor_cache.json"

print("=" * 80)
print("TESTING REALTOR.COM IMAGE URL SIZE PARAMETERS")
print("=" * 80)

if not cache_path.exists():
    print(f"❌ Cache not found at {cache_path}")
    sys.exit(1)

with open(cache_path, 'r') as f:
    cache = json.load(f)

# Extract a test URL
test_url = None
for key, entry in cache.items():
    data = entry.get('data', {})
    results = data.get('data', {}).get('home_search', {}).get('results', []) or \
              data.get('data', {}).get('results', [])

    for result in results:
        if 'photos' in result and result['photos']:
            test_url = result['photos'][0].get('href')
            if test_url:
                break
    if test_url:
        break

if not test_url:
    print("❌ No test URL found in cache")
    sys.exit(1)

print(f"\n🔗 Original URL:\n   {test_url}\n")

# Try different size parameters
test_sizes = [
    (1920, 1440),  # Full HD
    (1280, 960),   # Standard HD
    (960, 720),    # Current
    (640, 480),    # VGA
    (480, 360),    # HVGA
    (320, 240),    # QVGA
    (240, 180),    # QQVGA
    (120, 90),     # Thumbnail
]

print("Testing various size parameters:\n")

for w, h in test_sizes:
    # Try common URL parameter patterns
    urls_to_test = [
        test_url.replace(f'w{test_url.split("w")[1].split("_")[0]}', f'w{w}') \
                  .replace(f'h{test_url.split("h")[1].split(".")[0]}', f'h{h}'),
        test_url.replace(f'w{test_url.split("w")[1].split("_")[0]}', f'w{w}'),
        test_url.replace(f'h{test_url.split("h")[1].split(".")[0]}', f'h{h}'),
    ]

    # Get the original dimensions from the URL
    import re
    match = re.search(r'w(\d+)[_-]h(\d+)', test_url)
    if match:
        orig_w, orig_h = match.groups()

        # Try the most likely pattern
        modified = test_url.replace(f'w{orig_w}_h{orig_h}', f'w{w}_h{h}')

        try:
            print(f"[{w}×{h}] Testing...")
            resp = requests.get(modified, timeout=5, headers={
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            })

            if resp.ok:
                img = Image.open(io.BytesIO(resp.content))
                actual_w, actual_h = img.size
                print(f"      ✓ SUCCESS: Got {actual_w}×{actual_h}")
                print(f"      URL: {modified[:80]}...")
            else:
                print(f"      ✗ HTTP {resp.status_code}")

        except Exception as e:
            print(f"      ✗ Failed: {str(e)[:50]}")

print("\n" + "=" * 80)
print("ANALYSIS")
print("=" * 80)

print("""
If you see SUCCESS with larger dimensions, the API supports size parameters.

Key URL patterns to look for:
  1. w<WIDTH>_h<HEIGHT> (most common for realtor.com)
  2. w=<WIDTH>&h=<HEIGHT> (query parameters)
  3. <WIDTH>x<HEIGHT> (fixed dimensions)

If the API supports various sizes:
  ✓ Update the image URL generation to request 1920×1440 or similar
  ✓ This solves the problem without changing the API

If not, you need to:
  1. Implement a Redfin web scraper (Phase 2 of CLAUDE.md)
  2. Use a different listing API with better image quality
  3. Implement image upscaling before DFormer
""")

print("=" * 80)

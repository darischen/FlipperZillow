#!/usr/bin/env python
"""Test different image size parameters to find what the server actually serves."""

import sys
from pathlib import Path
import json
from PIL import Image
import io
import requests
import re

sys.path.insert(0, str(Path(__file__).parent))

print("=" * 80)
print("TESTING IMAGE SIZE PARAMETERS")
print("=" * 80)

# Get a test URL from cache
cache_path = Path(__file__).parent.parent / "flipperzillow" / "src" / "data" / "realtor_cache.json"

if not cache_path.exists():
    print(f"❌ Cache not found")
    sys.exit(1)

with open(cache_path, 'r') as f:
    cache = json.load(f)

# Find a realtor.com CDN URL
test_url = None
for key, entry in cache.items():
    data = entry.get('data', {})
    results = data.get('data', {}).get('home_search', {}).get('results', []) or \
              data.get('data', {}).get('results', [])

    for result in results:
        if 'photos' in result:
            for photo in result['photos']:
                url = photo.get('href', '')
                if 'ap.rdcpix.com' in url:
                    test_url = url
                    break
    if test_url:
        break

if not test_url:
    print("❌ No realtor.com CDN URL found")
    sys.exit(1)

print(f"\nBase URL: {test_url}\n")

# Extract the base part (without size parameters)
# URL format: ...l-m<NUM>rd-w<W>_h<H>.jpg
match = re.search(r'(.*l-m\d+)rd-w\d+_h\d+\.jpg', test_url)
if match:
    base = match.group(1)
    print(f"Base: {base}rd-w<W>_h<H>.jpg\n")
else:
    print("❌ Could not parse URL format")
    sys.exit(1)

# Test different sizes
test_sizes = [
    (120, 90),      # Current (likely)
    (160, 120),     # Small
    (320, 240),     # QVGA
    (480, 360),     # HVGA
    (640, 480),     # VGA
    (800, 600),     # SVGA
    (960, 720),     # Current API size
    (1280, 960),    # HD
    (1920, 1440),   # Full HD
    (2560, 1920),   # 2.5K
]

print("Testing different size parameters:\n")

actual_sizes = {}

for w, h in test_sizes:
    url = f"{base}rd-w{w}_h{h}.jpg"
    try:
        resp = requests.get(url, timeout=5, headers={'User-Agent': 'Mozilla/5.0'})
        if resp.ok:
            img = Image.open(io.BytesIO(resp.content))
            actual_size = img.size
            actual_sizes[f"{w}×{h}"] = actual_size

            if actual_size == (w, h):
                print(f"[{w:4d}×{h:4d}] ✓ Got exact size: {actual_size}")
            elif actual_size[0] >= w and actual_size[1] >= h:
                print(f"[{w:4d}×{h:4d}] ✓ Got close: {actual_size}")
            else:
                print(f"[{w:4d}×{h:4d}] ⚠️  Got smaller: {actual_size}")
        else:
            print(f"[{w:4d}×{h:4d}] ✗ HTTP {resp.status_code}")
    except Exception as e:
        print(f"[{w:4d}×{h:4d}] ✗ Error: {str(e)[:40]}")

print("\n" + "=" * 80)
print("ANALYSIS")
print("=" * 80)

# Determine the pattern
sizes_list = list(actual_sizes.values())
unique_sizes = set(sizes_list)

if len(unique_sizes) == 1:
    size = list(unique_sizes)[0]
    print(f"\n❌ Server ignores size parameters, always returns: {size}")
    print("   The API parameter doesn't control image size on the server")
elif len(unique_sizes) < 3:
    print(f"\n⚠️  Server returns limited sizes:")
    for size in sorted(unique_sizes):
        print(f"    - {size}")
else:
    print(f"\n✅ Server respects size parameters!")
    print("   Different requested sizes return different resolutions")

print("\n" + "=" * 80)

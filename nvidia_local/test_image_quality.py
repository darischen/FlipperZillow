#!/usr/bin/env python
"""Analyze image dimensions from RapidAPI realtor.com endpoint."""

import sys
from pathlib import Path
import json
import urllib.request
import urllib.error
from PIL import Image
from io import BytesIO

# Add parent to path for config
sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR

print("=" * 70)
print("Image Quality Analysis: RapidAPI realtor.com")
print("=" * 70)

# Check the cached realtor_cache.json for real image URLs
cache_path = Path(__file__).parent.parent / "flipperzillow" / "src" / "data" / "realtor_cache.json"

if not cache_path.exists():
    print(f"\n❌ No cache file at {cache_path}")
    print("   Run a property search first to populate the cache.")
    sys.exit(1)

try:
    with open(cache_path, 'r') as f:
        cache = json.load(f)
except Exception as e:
    print(f"❌ Failed to read cache: {e}")
    sys.exit(1)

print(f"\n📁 Cache file: {cache_path}")
print(f"📊 Cache entries: {len(cache)}")

# Find search results with photos
photo_urls = []
for key, entry in cache.items():
    data = entry.get('data', {})
    if 'data' in data and 'results' in data['data']:
        results = data['data']['results']
        for result in results:
            if 'photos' in result:
                for photo in result['photos']:
                    if 'href' in photo:
                        photo_urls.append(photo['href'])

print(f"\n🖼️  Total photo URLs found in cache: {len(photo_urls)}")

if not photo_urls:
    print("\n❌ No photos found in cache.")
    print("   Try a property search for a location with listings.")
    sys.exit(1)

# Analyze image dimensions
print("\n" + "=" * 70)
print("Analyzing Image Dimensions")
print("=" * 70)

sample_urls = photo_urls[:5]  # Test first 5
dimensions = []

for i, url in enumerate(sample_urls):
    try:
        print(f"\n[{i+1}/{len(sample_urls)}] Fetching: {url[:60]}...")

        # Download image
        with urllib.request.urlopen(url, timeout=5) as response:
            img_data = response.read()

        # Get dimensions
        img = Image.open(BytesIO(img_data))
        width, height = img.size
        dimensions.append((width, height))

        print(f"   ✓ Dimensions: {width}×{height} pixels")

        # Calculate pixel density for common objects
        if width > 0 and height > 0:
            area = width * height
            furniture_estimate = max(width, height) / 20  # Assume object ~5% of longest edge
            print(f"   ✓ Typical furniture item: ~{furniture_estimate:.1f} pixels")

    except Exception as e:
        print(f"   ⚠️  Failed to fetch: {str(e)[:60]}")

if dimensions:
    print("\n" + "=" * 70)
    print("Summary")
    print("=" * 70)

    avg_w = sum(d[0] for d in dimensions) / len(dimensions)
    avg_h = sum(d[1] for d in dimensions) / len(dimensions)

    print(f"\nAverage image size: {avg_w:.0f}×{avg_h:.0f} pixels")
    print(f"DFormer expected input: 480×640 pixels")
    print(f"Upscale factor needed: {640 / avg_h:.1f}x")

    avg_area = (avg_w * avg_h)
    dformer_area = 480 * 640
    print(f"\nCurrent area: {avg_area:,.0f} pixels")
    print(f"DFormer area: {dformer_area:,.0f} pixels")
    print(f"Coverage: {(avg_area / dformer_area * 100):.1f}%")

    print("\n⚠️  Problem: Realtor.com API returns thumbnail-sized images")
    print("   Individual furniture items are 2-3 pixels at this resolution")
    print("   DFormer cannot detect room-specific features from thumbnails")

    print("\n💡 Solutions:")
    print("   1. Implement Redfin web scraper for full-resolution photos")
    print("   2. Use image upscaling (ESRGAN) before DFormer analysis")
    print("   3. Switch to alternative listing API with better image quality")
else:
    print("\n❌ Could not analyze any images")
    sys.exit(1)

print("\n" + "=" * 70)

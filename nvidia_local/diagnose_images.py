#!/usr/bin/env python
"""Diagnose the root cause of small image sizes in the DFormer pipeline."""

import sys
from pathlib import Path
import json
from PIL import Image
import urllib.request

sys.path.insert(0, str(Path(__file__).parent))
from config import OUTPUT_DIR

print("=" * 80)
print("IMAGE RESOLUTION DIAGNOSTIC")
print("=" * 80)

# ── Check 1: Downloaded images in OUTPUT_DIR ───────────────────
print("\n1️⃣  Checking downloaded images in pipeline output...")
output_dir = Path(OUTPUT_DIR)

if output_dir.exists():
    images_dir = output_dir.glob("*/images/*.jpg")
    images_list = list(images_dir)

    if images_list:
        print(f"   Found {len(images_list)} downloaded images")
        sample_images = sorted(images_list)[:3]

        for img_path in sample_images:
            try:
                img = Image.open(img_path)
                w, h = img.size
                print(f"   ✓ {img_path.name}: {w}×{h}")
            except Exception as e:
                print(f"   ✗ {img_path.name}: {e}")
    else:
        print("   ⚠️  No downloaded images found")
else:
    print(f"   ⚠️  Output directory doesn't exist: {output_dir}")

# ── Check 2: Cached API responses ────────────────────────────────
print("\n2️⃣  Checking cached RapidAPI responses...")
cache_path = Path(__file__).parent.parent / "flipperzillow" / "src" / "data" / "realtor_cache.json"

if cache_path.exists():
    try:
        with open(cache_path, 'r') as f:
            cache = json.load(f)

        print(f"   Found cache with {len(cache)} entries")

        # Extract all unique photo URLs
        all_urls = set()
        for key, entry in cache.items():
            data = entry.get('data', {})
            # Handle both home_search and results formats
            results = data.get('data', {}).get('home_search', {}).get('results', []) or \
                      data.get('data', {}).get('results', [])

            for result in results:
                if 'photos' in result:
                    for photo in result['photos']:
                        if 'href' in photo:
                            all_urls.add(photo['href'])

        if all_urls:
            print(f"   Found {len(all_urls)} unique photo URLs")
            sample_urls = list(all_urls)[:3]

            print("\n   Sample URLs from cache:")
            for url in sample_urls:
                print(f"   📍 {url}")

                # Extract dimension hints from URL if present
                if 'w' in url and 'h' in url:
                    import re
                    match = re.search(r'w(\d+)[_-]h(\d+)', url)
                    if match:
                        w, h = match.groups()
                        print(f"      → URL suggests: {w}×{h}")

        else:
            print("   ⚠️  No photo URLs found in cache")

    except Exception as e:
        print(f"   ✗ Error reading cache: {e}")
else:
    print(f"   ⚠️  Cache file not found: {cache_path}")

# ── Check 3: Property summary from last pipeline run ─────────────
print("\n3️⃣  Checking property summary from last pipeline run...")
latest_summary = None
if output_dir.exists():
    summaries = list(output_dir.glob("*/property_summary.json"))
    if summaries:
        latest_summary = sorted(summaries, key=lambda p: p.stat().st_mtime, reverse=True)[0]
        print(f"   Latest: {latest_summary}")

        try:
            with open(latest_summary, 'r') as f:
                summary = json.load(f)

            print(f"   ✓ Rooms found: {summary.get('room_count', 0)}")
            room_types = summary.get('room_types', {})
            print(f"   ✓ Room types: {room_types}")

            # Count "other" vs specific rooms
            other_count = room_types.get('other', 0)
            specific = sum(v for k, v in room_types.items() if k != 'other')
            if other_count > 0:
                other_pct = (other_count / (other_count + specific) * 100) if (other_count + specific) > 0 else 0
                print(f"   ⚠️  {other_count} rooms classified as 'other' ({other_pct:.0f}%)")

        except Exception as e:
            print(f"   ✗ Error reading summary: {e}")
    else:
        print("   ⚠️  No property summary found")

# ── Summary and Recommendation ──────────────────────────────────
print("\n" + "=" * 80)
print("SUMMARY & RECOMMENDATION")
print("=" * 80)

print("""
DFormer requires adequate image resolution to detect furniture and room features:
- Input: 480×640 pixels (typical)
- Minimum furniture detail: ~20-30 pixels per object
- Problem threshold: <150×200 (too small for furniture detection)

If images are 120×80:
  → Individual items are only 2-3 pixels (undetectable)
  → Likely cause: RapidAPI returning small thumbnails

If images are 960×720 (from URL parameters):
  → Check if they're being downsampled during download
  → Verify the actual downloaded JPEGs in OUTPUT_DIR

NEXT STEPS:
1. ✓ Verify actual resolution of downloaded images above
2. If small: Check if RapidAPI URL width/height parameters are working
3. If correct size but low accuracy: DFormer may need fine-tuning or better images
4. Consider: Redfin web scraper (Phase 2) for full-resolution listing photos
""")

print("=" * 80)

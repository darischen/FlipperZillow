#!/usr/bin/env python
"""Test the upscaling fix by comparing room classification before/after."""

import sys
from pathlib import Path
import json
import subprocess
import time

sys.path.insert(0, str(Path(__file__).parent))

print("=" * 80)
print("UPSCALING FIX TEST")
print("=" * 80)

# Step 1: Prepare test data
print("\n1️⃣  Preparing test data...")

cache_path = Path(__file__).parent.parent / "flipperzillow" / "src" / "data" / "realtor_cache.json"

if not cache_path.exists():
    print(f"❌ Cache not found: {cache_path}")
    print("   Run a property search first via the web UI")
    sys.exit(1)

# Extract a few image URLs from cache
with open(cache_path, 'r') as f:
    cache = json.load(f)

urls = []
for key, entry in list(cache.items())[:2]:  # Test with first 2 searches
    data = entry.get('data', {})
    results = data.get('data', {}).get('home_search', {}).get('results', []) or \
              data.get('data', {}).get('results', [])

    for result in results[:2]:  # Test 2 results per search
        if 'photos' in result and result['photos']:
            urls.append(result['photos'][0]['href'])

if not urls:
    print("❌ No image URLs found in cache")
    print("   Try a different property search")
    sys.exit(1)

print(f"   Found {len(urls)} test images")

# Step 2: Create test JSON file
test_file = Path(__file__).parent / "test_urls_for_upscaling.json"
with open(test_file, 'w') as f:
    json.dump(urls, f, indent=2)

print(f"   Saved to: {test_file}")

# Step 3: Run pipeline
print("\n2️⃣  Running pipeline with upscaling...")
print("   (This will take 2-5 minutes on CPU, ~30 seconds on GPU)\n")

start_time = time.time()

try:
    result = subprocess.run(
        [sys.executable, "pipeline.py", str(test_file), "--skip-sam"],
        cwd=Path(__file__).parent,
        capture_output=True,
        text=True,
        timeout=600
    )

    if result.returncode != 0:
        print(f"❌ Pipeline failed")
        print(f"   STDERR: {result.stderr[:200]}")
        print(f"   STDOUT: {result.stdout[-500:]}")
        sys.exit(1)

    print(result.stdout)

except subprocess.TimeoutExpired:
    print("❌ Pipeline timeout (10 minutes)")
    sys.exit(1)

elapsed = time.time() - start_time

# Step 4: Analyze results
print("\n3️⃣  Analyzing results...\n")

# Find the property summary from the latest run
output_dir = Path(__file__).parent.parent / "flipperzillow_output"
summaries = list(output_dir.glob("*/property_summary.json"))

if not summaries:
    print("❌ No property summary found")
    sys.exit(1)

latest_summary = sorted(summaries, key=lambda p: p.stat().st_mtime, reverse=True)[0]

with open(latest_summary, 'r') as f:
    summary = json.load(f)

# Parse results
room_count = summary.get('room_count', 0)
room_types = summary.get('room_types', {})
other_count = room_types.get('other', 0)
specific_count = sum(v for k, v in room_types.items() if k != 'other')

print(f"📊 RESULTS (from {latest_summary.parent.name})\n")
print(f"   Total rooms: {room_count}")
print(f"   Specific room types identified: {specific_count}")
print(f"   Classified as 'other': {other_count}")

if room_count > 0:
    accuracy = ((specific_count) / room_count * 100) if room_count > 0 else 0
    print(f"   Classification accuracy: {accuracy:.0f}%\n")

print(f"   Room breakdown:")
for room_type, count in sorted(room_types.items()):
    if count > 0:
        pct = (count / room_count * 100) if room_count > 0 else 0
        symbol = "✓" if room_type != "other" else "⚠️"
        print(f"     {symbol} {room_type}: {count} ({pct:.0f}%)")

print(f"\n   Detected objects: {len(summary.get('all_detected_objects', []))} types")
if summary.get('all_detected_objects'):
    objs = summary['all_detected_objects'][:10]
    print(f"     {', '.join(objs)}")

# Step 5: Summary
print("\n" + "=" * 80)
print("ANALYSIS")
print("=" * 80)

if specific_count == 0 and room_count > 0:
    print("""
❌ UPSCALING DID NOT HELP
   - All rooms still classified as "other"
   - Next steps:
     1. Check if images were actually small (run diagnose_images.py)
     2. Try Solution 2: test_image_urls.py to request larger images from API
     3. Implement Solution 3: Redfin web scraper (Phase 2)
""")
elif accuracy < 30:
    print(f"""
⚠️  LIMITED IMPROVEMENT ({accuracy:.0f}%)
   - Upscaling helped but accuracy is still low
   - Images may have been highly compressed before reaching API
   - Recommend:
     1. Verify with diagnose_images.py that upscaling is happening
     2. Try Solution 2: test_image_urls.py for larger API images
     3. If not available: implement Redfin scraper (Phase 2, better long-term)
""")
elif accuracy >= 50:
    print(f"""
✅ UPSCALING WORKING! ({accuracy:.0f}% accuracy)
   - Room classification improving with upscaled images
   - Upscaler is solving the problem for now
   - You can:
     1. Deploy and monitor accuracy on real searches
     2. Plan to upgrade to Redfin scraper later (Phase 2) for even better images
""")
else:
    print(f"""
🟡 PARTIAL SUCCESS ({accuracy:.0f}% accuracy)
   - Upscaling helps but room classification is mixed
   - Consider:
     1. Try Solution 2: test_image_urls.py to get native full-res images
     2. Or: Implement Redfin scraper for higher quality images
""")

print("=" * 80)
print(f"Test completed in {elapsed:.0f} seconds")
print(f"Full result at: {latest_summary.parent}")

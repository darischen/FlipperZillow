"""
Simple test script for NVIDIA local pipeline.
Usage: python main_simple.py <image_url_1> [<image_url_2> ...]

Example:
  python main_simple.py "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg"
"""
import sys
import json
from pathlib import Path

import config
from utils import download_images, generate_job_id, job_dir, timer

def run_quick_test(image_urls: list[str]):
    """
    Quick test: download images and run depth inference.
    Skips DFormer and SAM to keep runtime short.
    """
    print(f"\n{'='*60}")
    print(f"NVIDIA Local Pipeline Test")
    print(f"{'='*60}\n")

    jid = generate_job_id(image_urls)
    out = job_dir(jid)

    print(f"Job ID: {jid}")
    print(f"Output: {out}\n")

    # ── Step 1: Download images ─────────────────────────────
    print("[Test] Step 1/2: Downloading images...")
    with timer() as t:
        img_results = download_images(image_urls, out / "images")

    ok_images = [r for r in img_results if r["ok"]]
    print(f"[Test] Downloaded {len(ok_images)}/{len(image_urls)} images in {t.elapsed:.1f}s\n")

    if not ok_images:
        print("[Test] ERROR: No images downloaded")
        return

    image_paths = [r["path"] for r in ok_images]

    # ── Step 2: Depth Anything V2 ───────────────────────────
    print("[Test] Step 2/2: Running Depth Anything V2...")
    with timer() as t:
        import depth_inference
        depth_results = depth_inference.process_images(image_paths, out)

    print(f"[Test] Depth inference done in {t.elapsed:.1f}s\n")

    # ── Summary ─────────────────────────────────────────────
    result = {
        "job_id": jid,
        "output_dir": str(out),
        "images": img_results,
        "depth_results": depth_results,
        "timing": {
            "download": round(t.elapsed, 3),
            "depth": round(t.elapsed, 3),
        }
    }

    result_path = out / "test_result.json"
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2)

    print(f"{'='*60}")
    print(f"[Test] SUCCESS!")
    print(f"[Test] Results saved to: {result_path}")
    print(f"[Test] Depth maps: {out}/depth/")
    print(f"{'='*60}\n")

    return result


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        print("\nNo URLs provided. Running with sample image...")
        urls = [
            "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg"
        ]
    else:
        urls = sys.argv[1:]

    run_quick_test(urls)

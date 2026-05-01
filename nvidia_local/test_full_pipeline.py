"""
Test the full NVIDIA local pipeline with sample images.
This demonstrates the efficient model loading strategy:
  Load Depth → Process ALL images → Unload
  Load DFormer → Process ALL images → Unload
  Load SAM → Process ALL images → Unload
"""
import json
import sys
from pathlib import Path

import config
from pipeline import run_pipeline


def test_with_sample_urls():
    """Test pipeline with sample room images."""
    # Free stock room images from Pexels
    sample_urls = [
        "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg",  # Modern living room
        # Add more URLs as needed for testing
    ]

    print(f"\n{'='*70}")
    print("Testing NVIDIA Local Pipeline with sample images")
    print(f"{'='*70}\n")

    print(f"Sample images: {len(sample_urls)}")
    print(f"Model sizes: Depth=vits, DFormer=Small, SAM=ViT-H")
    print(f"VRAM strategy: Load model → Process ALL images → Unload")
    print(f"\nExpected VRAM usage:")
    print(f"  - Depth phase: ~2.5 GB")
    print(f"  - DFormer phase: ~4-6 GB")
    print(f"  - SAM phase: ~6-7 GB")
    print(f"  - Peak: ~7 GB (within RTX 3060 Ti's 8GB limit)")
    print(f"\nExpected time:")
    print(f"  - Depth: ~2-3s per image")
    print(f"  - DFormer: ~3-5s per image")
    print(f"  - SAM: ~8-15s per image")
    print(f"  - Total: ~15-25s per image\n")

    # Run with DFormer and SAM enabled
    result = run_pipeline(
        image_urls=sample_urls,
        skip_dformer=False,
        skip_sam=False,
        create_mesh=False,  # Point clouds only for speed
    )

    # Print summary
    print(f"\n{'='*70}")
    print("Results Summary:")
    print(f"{'='*70}\n")

    if "error" in result:
        print(f"ERROR: {result['error']}")
        return False

    print(f"Job ID: {result['job_id']}")
    print(f"Output directory: {result['output_dir']}")
    print(f"\nTiming breakdown:")
    for step, duration in result.get("timing", {}).items():
        print(f"  {step:12s}: {duration:6.1f}s")

    print(f"\nImages processed:")
    for img in result.get("images", []):
        status = "✓" if img["ok"] else "✗"
        print(f"  {status} {img['filename']}: {img.get('error', 'OK')}")

    if result.get("property_summary"):
        summary = result["property_summary"]
        print(f"\nProperty analysis:")
        print(f"  Room count: {summary.get('room_count', 0)}")
        print(f"  Room types: {summary.get('room_types', {})}")
        print(f"  Has natural light: {summary.get('has_natural_light', False)}")
        print(f"  Objects detected: {len(summary.get('all_detected_objects', []))}")

    if result.get("glb_path"):
        glb_size = Path(result["glb_path"]).stat().st_size / (1024*1024)
        print(f"\n3D Model: {result['glb_path']} ({glb_size:.1f} MB)")

    print(f"\nFull results saved to: {result.get('output_dir')}/pipeline_result.json")

    return True


def test_depth_only():
    """Quick test: Depth Anything V2 only (fastest to validate GPU setup)."""
    print(f"\n{'='*70}")
    print("Quick Test: Depth Anything V2 only")
    print(f"{'='*70}\n")

    sample_urls = [
        "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg",
    ]

    result = run_pipeline(
        image_urls=sample_urls,
        skip_dformer=True,
        skip_sam=True,
    )

    if "error" in result:
        print(f"ERROR: {result['error']}")
        return False

    print(f"\nSUCCESS!")
    print(f"Depth maps saved to: {result['output_dir']}/depth/")
    return True


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--depth-only":
        success = test_depth_only()
    else:
        success = test_with_sample_urls()

    sys.exit(0 if success else 1)

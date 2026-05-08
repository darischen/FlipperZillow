"""
Full pipeline orchestrator for NVIDIA local development.

Memory-efficient pipeline that processes all images with one model before unloading:
  1. Load Depth Anything V2 → process ALL images → unload
  2. Load DFormer → process ALL images → unload
  3. Load SAM 3D → process ALL images → unload
  4. Aggregate and save results

This approach is more efficient than loading/unloading per-image.
"""
import json
import time
from pathlib import Path

import torch

from utils import download_images, generate_job_id, job_dir, timer
import config

# Lazy imports — these modules have heavy dependencies
depth_inference = None
dformer_inference = None
sam3d_inference = None


def _ensure_depth():
    global depth_inference
    if depth_inference is None:
        import depth_inference as _mod
        depth_inference = _mod
    return depth_inference


def _ensure_dformer():
    global dformer_inference
    if dformer_inference is None:
        import dformer_inference as _mod
        dformer_inference = _mod
    return dformer_inference


def _ensure_sam3d():
    global sam3d_inference
    if sam3d_inference is None:
        import sam3d_inference as _mod
        sam3d_inference = _mod
    return sam3d_inference


def parse_url_file(file_path: str | Path) -> list[str]:
    """Parse a file containing image URLs (JSON or plain text)."""
    text = Path(file_path).read_text().strip()

    # Try JSON first
    if text.startswith("[") or text.startswith("{"):
        try:
            data = json.loads(text)
            if isinstance(data, list):
                urls = data
            elif isinstance(data, dict) and "image_urls" in data:
                urls = data["image_urls"]
            elif isinstance(data, dict) and "urls" in data:
                urls = data["urls"]
            else:
                urls = []
            return [u.strip() for u in urls if isinstance(u, str) and u.strip()]
        except json.JSONDecodeError:
            pass

    # Plain text, one URL per line
    return [line.strip() for line in text.splitlines() if line.strip() and line.startswith("http")]


def run_pipeline(
    image_urls: list[str],
    job_id: str | None = None,
    skip_dformer: bool = False,
    skip_sam: bool = False,
    create_mesh: bool = False,
) -> dict:
    """
    Run the full processing pipeline on a list of image URLs.

    Strategy:
      1. Download ALL images first
      2. Load Depth model → process ALL images → unload
      3. Load DFormer model → process ALL images → unload
      4. Load SAM 3D → process ALL images → unload
      5. Aggregate results

    This is more VRAM-efficient than loading/unloading per-image.

    Returns dict with job_id, images, depth, features, glb_path, timing.
    """
    pipeline_start = time.time()
    timings = {}

    # ── Setup ───────────────────────────────────────────────
    out = config.OUTPUT_DIR
    if job_id is None:
        job_id = generate_job_id(image_urls)

    print(f"\n{'='*70}")
    print(f"[pipeline] NVIDIA Local Pipeline")
    print(f"[pipeline] Job: {job_id}")
    print(f"[pipeline] Images: {len(image_urls)}")
    print(f"[pipeline] Output: {out}")
    print(f"[pipeline] VRAM strategy: Load model → Process ALL images → Unload")
    print(f"{'='*70}\n")

    result = {"job_id": job_id, "output_dir": str(out)}

    # ── Step 1: Download ALL images first ──────────────────
    print("[pipeline] Step 1/4: Downloading images...")
    with timer() as t:
        img_results = download_images(image_urls, out / "images")

    ok_images = [r for r in img_results if r["ok"]]
    timings["download"] = round(t.elapsed, 3)
    print(f"[pipeline] Downloaded {len(ok_images)}/{len(image_urls)} in {t.elapsed:.1f}s")
    print(f"[pipeline] GPU VRAM free for model loading\n")

    result["images"] = img_results

    if not ok_images:
        result["error"] = "No images could be downloaded"
        result["timing"] = timings
        return result

    image_paths = [r["path"] for r in ok_images]

    # ── Step 2: Depth Anything V2 on ALL images ────────────
    print("[pipeline] Step 2/4: Depth Anything V2")
    print(f"[pipeline]   Loading model...")
    with timer() as t:
        depth_results = _ensure_depth().process_images(image_paths, out)

    timings["depth"] = round(t.elapsed, 3)
    print(f"[pipeline]   Processed {len(depth_results)} images in {t.elapsed:.1f}s")
    print(f"[pipeline]   GPU freed (model unloaded)\n")

    result["depth"] = depth_results
    pairs = [(d["image"], d["depth_npy"]) for d in depth_results]

    # ── Step 3: DFormer semantic features on ALL images ────
    features = []
    if not skip_dformer:
        print("[pipeline] Step 3/4: DFormer semantic segmentation")
        print(f"[pipeline]   Loading model...")
        try:
            with timer() as t:
                dformer_mod = _ensure_dformer()
                features = dformer_mod.process_images(pairs, out)

            timings["dformer"] = round(t.elapsed, 3)

            # Check if we got fallback results (all "other" rooms)
            if features and all(f.get("room_type") == "other" for f in features):
                print("[pipeline] ⚠ WARNING: DFormer produced only 'other' classifications")
                print("[pipeline]   This usually means the model failed to load properly")
                print("[pipeline]   Check that conda environment 'fz' is activated:")
                print("[pipeline]     conda activate fz")
            else:
                print(f"[pipeline]   Processed {len(features)} images in {t.elapsed:.1f}s")
            print(f"[pipeline]   GPU freed (model unloaded)\n")
        except Exception as e:
            print(f"[pipeline] ✗ DFormer error: {e}")
            print("[pipeline] Falling back to heuristic segmentation")
            import traceback
            traceback.print_exc()
            # Still continue with empty features so pipeline doesn't crash
            features = []
            timings["dformer"] = -1  # Negative to indicate error
    else:
        print("[pipeline] Step 3/4: Skipped (--skip-dformer)\n")
        timings["dformer"] = 0

    result["features"] = features

    # ── Step 4: SAM 3D → .glb reconstruction on ALL images
    glb_path = None
    if not skip_sam:
        print("[pipeline] Step 4/4: SAM 3D → .glb reconstruction")
        print(f"[pipeline]   Loading model...")
        glb_output = out / "model.glb"
        with timer() as t:
            glb_path = _ensure_sam3d().build_glb(
                pairs, glb_output,
                use_sam_masks=True,
                create_mesh=create_mesh,
            )

        timings["sam3d"] = round(t.elapsed, 3)
        print(f"[pipeline]   Exported .glb in {t.elapsed:.1f}s")
        print(f"[pipeline]   GPU freed (model unloaded)\n")
    else:
        print("[pipeline] Step 4/4: Skipped (--skip-sam)\n")
        timings["sam3d"] = 0

    result["glb_path"] = glb_path

    # ── Aggregate and save results ─────────────────────────
    summary = _aggregate_features(features, glb_path)
    summary_path = out / "property_summary.json"
    with open(summary_path, "w") as f:
        json.dump(summary, f, indent=2)

    result["property_summary"] = summary
    result["property_summary_path"] = str(summary_path)

    # ── Done ────────────────────────────────────────────────
    total_time = time.time() - pipeline_start
    timings["total"] = round(total_time, 3)
    result["timing"] = timings

    print(f"{'='*70}")
    print(f"[pipeline] DONE in {total_time:.1f}s")
    print(f"[pipeline] Summary: {summary_path}")
    if glb_path:
        print(f"[pipeline] 3D Model: {glb_path}")
    print(f"{'='*70}\n")

    return result


def _aggregate_features(features: list[dict], glb_path: str | None) -> dict:
    """Merge per-image features into a single property summary."""
    if not features:
        return {
            "room_count": 0,
            "rooms": [],
            "overall_condition": "unknown",
            "has_3d_model": glb_path is not None,
        }

    rooms = []
    all_objects = set()

    for feat in features:
        room = {
            "room_type": feat.get("room_type", "other"),
            "detected_objects": [
                obj["label"] for obj in feat.get("detected_objects", [])
                if obj.get("coverage_pct", 0) > 1.0
            ],
            "layout": feat.get("layout", {}),
        }
        rooms.append(room)

        for obj in feat.get("detected_objects", []):
            all_objects.add(obj["label"])

    # Count room types
    room_types = {}
    for r in rooms:
        rt = r["room_type"]
        room_types[rt] = room_types.get(rt, 0) + 1

    # Determine characteristics
    has_natural_light = any(
        r.get("layout", {}).get("natural_light") == "likely" for r in rooms
    )
    spaciousness_scores = [
        r.get("layout", {}).get("spaciousness", "moderate") for r in rooms
    ]

    return {
        "room_count": len(rooms),
        "room_types": room_types,
        "rooms": rooms,
        "all_detected_objects": sorted(all_objects),
        "has_natural_light": has_natural_light,
        "overall_spaciousness": max(set(spaciousness_scores), key=spaciousness_scores.count)
            if spaciousness_scores else "unknown",
        "has_3d_model": glb_path is not None,
        "glb_path": glb_path,
    }


# ── CLI entry point ─────────────────────────────────────────
if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="NVIDIA Local property image pipeline")
    parser.add_argument("input", help="Path to file with image URLs (JSON or one per line)")
    parser.add_argument("--job-id", help="Custom job ID (default: hash of URLs)")
    parser.add_argument("--skip-dformer", action="store_true", help="Skip DFormer features")
    parser.add_argument("--skip-sam", action="store_true", help="Skip SAM 3D / .glb")
    parser.add_argument("--create-mesh", action="store_true", help="Create mesh instead of point cloud")
    parser.add_argument("--output-dir", help="Override output directory")

    args = parser.parse_args()

    if args.output_dir:
        config.OUTPUT_DIR = Path(args.output_dir)

    urls = parse_url_file(args.input)
    if not urls:
        print(f"ERROR: No valid URLs found in {args.input}")
        exit(1)

    print(f"[cli] Parsed {len(urls)} image URLs\n")

    result = run_pipeline(
        image_urls=urls,
        job_id=args.job_id,
        skip_dformer=args.skip_dformer,
        skip_sam=args.skip_sam,
        create_mesh=args.create_mesh,
    )

    # Save full result
    result_path = Path(result["output_dir"]) / "pipeline_result.json"
    result_path.parent.mkdir(parents=True, exist_ok=True)
    with open(result_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    print(f"[cli] Full result saved to: {result_path}")

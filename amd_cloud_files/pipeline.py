"""
Full pipeline orchestrator.

Input:  a text file with one image URL per line (or a JSON array of URLs)
Output: .glb file + per-image feature JSONs + aggregated property summary

Pipeline:
  1. Download all images
  2. Depth Anything V2  →  depth maps (.npy + .png)
  3. DFormerV2 (RGB + depth)  →  per-image semantic features (.json)
  4. SAM 3D (RGB + depth)  →  point clouds / meshes  →  combined .glb
  5. Aggregate all features into a single property_summary.json
"""
import json
import time
from pathlib import Path

from utils import download_images, generate_job_id, job_dir, timer
import config

# Lazy imports — these modules have heavy dependencies (torch, trimesh, mmseg)
# that may not all be installed. Import only when actually needed.
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
    """
    Parse a file containing image URLs.
    Accepts either:
      - Plain text with one URL per line
      - A JSON array: ["url1", "url2"]
      - A JSON object: {"image_urls": ["url1", "url2"], ...}
    """
    text = Path(file_path).read_text().strip()

    # Try JSON first
    if text.startswith("[") or text.startswith("{"):
        try:
            data = json.loads(text)
            # Handle both array and object formats
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
    skip_sam: bool = False,
    skip_dformer: bool = False,
    create_mesh: bool = True,
) -> dict:
    """
    Run the full processing pipeline on a list of image URLs.

    Returns a dict with:
      - job_id
      - images: download results
      - depth: depth inference results
      - features: per-image DFormerV2 feature dicts
      - glb_path: path to the exported .glb
      - property_summary: aggregated feature summary
      - timing: per-step timing
    """
    pipeline_start = time.time()
    timings = {}

    # ── Setup ───────────────────────────────────────────────
    # Output directly to /root/outputs/ without a job_id subfolder
    out = config.OUTPUT_DIR
    if job_id is None:
        job_id = generate_job_id(image_urls)
    print(f"\n{'='*60}")
    print(f"[pipeline] Job {job_id} — {len(image_urls)} images")
    print(f"[pipeline] Output: {out}")
    print(f"{'='*60}\n")

    result = {"job_id": job_id, "output_dir": str(out)}

    # ── Step 1: Download images ─────────────────────────────
    print("[pipeline] Step 1/4: Downloading images...")
    with timer() as t:
        img_results = download_images(image_urls, out / "images")
    timings["download"] = round(t.elapsed, 3)

    ok_images = [r for r in img_results if r["ok"]]
    print(f"[pipeline] Downloaded {len(ok_images)}/{len(image_urls)} images in {t.elapsed:.1f}s\n")
    result["images"] = img_results

    if not ok_images:
        result["error"] = "No images could be downloaded"
        result["timing"] = timings
        return result

    image_paths = [r["path"] for r in ok_images]

    # ── Step 2: Depth Anything V2 ───────────────────────────
    print("[pipeline] Step 2/4: Running Depth Anything V2...")
    with timer() as t:
        depth_results = _ensure_depth().process_images(image_paths, out)
    timings["depth"] = round(t.elapsed, 3)
    print(f"[pipeline] Depth maps done in {t.elapsed:.1f}s\n")
    result["depth"] = depth_results

    # Build pairs of (rgb_path, depth_npy_path) for downstream steps
    pairs = [(d["image"], d["depth_npy"]) for d in depth_results]

    # ── Step 3: DFormerV2 semantic features ─────────────────
    features = []
    if not skip_dformer:
        print("[pipeline] Step 3/4: Running DFormerV2 semantic segmentation...")
        with timer() as t:
            features = _ensure_dformer().process_images(pairs, out)
        timings["dformer"] = round(t.elapsed, 3)
        print(f"[pipeline] DFormerV2 done in {t.elapsed:.1f}s\n")
    else:
        print("[pipeline] Step 3/4: Skipped (--skip-dformer)\n")
        timings["dformer"] = 0
    result["features"] = features

    # ── Step 4: SAM 3D → .glb ──────────────────────────────
    glb_path = None
    if not skip_sam:
        print("[pipeline] Step 4/4: Running SAM 3D → .glb reconstruction...")
        glb_output = out / "model.glb"
        with timer() as t:
            glb_path = _ensure_sam3d().build_glb(
                pairs, glb_output,
                use_sam_masks=True,
                create_mesh=create_mesh,
            )
        timings["sam3d"] = round(t.elapsed, 3)
        print(f"[pipeline] .glb exported in {t.elapsed:.1f}s\n")
    else:
        print("[pipeline] Step 4/4: Skipped (--skip-sam)\n")
        timings["sam3d"] = 0
    result["glb_path"] = glb_path

    # ── Aggregate property summary ──────────────────────────
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

    print(f"{'='*60}")
    print(f"[pipeline] DONE in {total_time:.1f}s")
    print(f"[pipeline] Summary: {summary_path}")
    if glb_path:
        print(f"[pipeline] 3D Model: {glb_path}")
    print(f"{'='*60}\n")

    return result


def _aggregate_features(features: list[dict], glb_path: str | None) -> dict:
    """
    Merge per-image feature dicts into a single property summary.
    This is the JSON that gets sent to Claude for realtor script generation.
    """
    if not features:
        return {
            "room_count": 0,
            "rooms": [],
            "overall_condition": "unknown",
            "has_3d_model": glb_path is not None,
        }

    rooms = []
    all_objects = set()
    conditions = []

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

    # Determine overall characteristics
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

    parser = argparse.ArgumentParser(description="AMD Cloud property image pipeline")
    parser.add_argument("input", help="Path to file with image URLs (one per line or JSON array)")
    parser.add_argument("--job-id", help="Custom job ID (default: hash of URLs)")
    parser.add_argument("--skip-sam", action="store_true", help="Skip SAM 3D / .glb export")
    parser.add_argument("--skip-dformer", action="store_true", help="Skip DFormerV2 features")
    parser.add_argument("--no-mesh", action="store_true", help="Skip mesh reconstruction (point clouds only)")
    parser.add_argument("--output-dir", help="Override output directory")

    args = parser.parse_args()

    if args.output_dir:
        config.OUTPUT_DIR = Path(args.output_dir)

    urls = parse_url_file(args.input)
    print(f"Parsed {len(urls)} image URLs from {args.input}")

    result = run_pipeline(
        image_urls=urls,
        job_id=args.job_id,
        skip_sam=args.skip_sam,
        skip_dformer=args.skip_dformer,
        create_mesh=not args.no_mesh,
    )

    # Save full result
    result_path = Path(result["output_dir"]) / "pipeline_result.json"
    result_path.parent.mkdir(parents=True, exist_ok=True)
    # Remove non-serializable items
    serializable = {k: v for k, v in result.items()}
    with open(result_path, "w") as f:
        json.dump(serializable, f, indent=2, default=str)

    print(f"\nFull result saved to: {result_path}")

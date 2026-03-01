"""
SAM 3D Objects → .glb reconstruction.

Uses Facebook Research's sam-3d-objects to reconstruct 3D Gaussian splats
from property images + depth maps, then converts to .glb for web viewing.

Actual API (from demo.py in the repo):
    from inference import Inference, load_image
    inference = Inference(config_path, compile=False)
    output = inference(image, mask, seed=42)
    output["gs"].save_ply("splat.ply")
"""
import sys
import numpy as np
from pathlib import Path
from PIL import Image

import config
from utils import load_image_as_numpy, timer

# Add SAM 3D repo + notebook to path
sys.path.insert(0, str(config.SAM3D_REPO))
sys.path.insert(0, str(config.SAM3D_REPO / "notebook"))

_inference = None


def _load_model():
    """Load the SAM 3D Objects inference pipeline."""
    global _inference
    if _inference is not None:
        return _inference

    from inference import Inference

    config_path = config.SAM3D_CFG
    if not config_path.exists():
        # Try alternate locations
        for alt in [
            config.SAM3D_REPO / "checkpoints" / "hf" / "pipeline.yaml",
            config.SAM3D_REPO / "checkpoints" / "pipeline.yaml",
            config.SAM3D_REPO / "configs" / "pipeline.yaml",
        ]:
            if alt.exists():
                config_path = alt
                break

    print(f"[sam3d] Loading model from {config_path}")
    _inference = Inference(str(config_path), compile=False)
    print(f"[sam3d] Model loaded on {config.DEVICE}")
    return _inference


def _create_mask_from_depth(depth_npy_path: str | Path, threshold: float = 0.1) -> np.ndarray:
    """
    Create a binary mask from the depth map.
    Masks out background (very far) pixels, keeps foreground objects.
    Returns a uint8 mask (H, W) with 255 for foreground.
    """
    depth = np.load(depth_npy_path).astype(np.float32)
    d_min, d_max = depth.min(), depth.max()
    if d_max - d_min < 1e-6:
        return np.ones(depth.shape, dtype=np.uint8) * 255

    normalized = (depth - d_min) / (d_max - d_min)
    # Keep everything that's not very far background
    mask = (normalized < (1.0 - threshold)).astype(np.uint8) * 255
    return mask


def _make_rgba(rgb_path: str | Path, mask: np.ndarray) -> np.ndarray:
    """
    Combine RGB image with mask to create RGBA image.
    SAM 3D expects RGBA where alpha channel is the mask.
    """
    rgb = np.array(Image.open(rgb_path).convert("RGB"))
    h, w = rgb.shape[:2]

    # Resize mask to match image
    mask_resized = np.array(
        Image.fromarray(mask).resize((w, h), Image.BILINEAR)
    )

    rgba = np.zeros((h, w, 4), dtype=np.uint8)
    rgba[:, :, :3] = rgb
    rgba[:, :, 3] = mask_resized
    return rgba


def reconstruct_single(
    rgb_path: str | Path,
    depth_npy_path: str | Path,
    output_dir: str | Path,
    seed: int = 42,
) -> dict:
    """
    Reconstruct a single image into a 3D Gaussian splat (.ply).

    Returns dict with ply_path, success, time_s.
    """
    model = _load_model()
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    stem = Path(rgb_path).stem

    # Create RGBA image with depth-based mask
    mask = _create_mask_from_depth(depth_npy_path)
    rgba = _make_rgba(rgb_path, mask)

    # Convert to format expected by the model
    rgba_pil = Image.fromarray(rgba, "RGBA")

    with timer() as t:
        try:
            # The Inference class expects an RGBA image (mask in alpha)
            # and optionally a separate mask
            output = model(rgba_pil, mask, seed=seed)

            ply_path = output_dir / f"{stem}.ply"
            output["gs"].save_ply(str(ply_path))

            return {
                "image": str(rgb_path),
                "ply_path": str(ply_path),
                "success": True,
                "time_s": round(t.elapsed, 3),
            }
        except Exception as e:
            print(f"[sam3d] Failed to reconstruct {stem}: {e}")
            return {
                "image": str(rgb_path),
                "ply_path": None,
                "success": False,
                "error": str(e),
                "time_s": round(t.elapsed, 3),
            }


def _ply_to_glb(ply_path: str | Path, glb_path: str | Path) -> str:
    """Convert a .ply point cloud to .glb using trimesh."""
    import trimesh

    mesh = trimesh.load(str(ply_path))
    glb_data = mesh.export(file_type="glb")
    with open(glb_path, "wb") as f:
        f.write(glb_data)
    return str(glb_path)


def build_glb(
    image_depth_pairs: list[tuple[str, str]],
    output_path: str | Path,
    **kwargs,
) -> str:
    """
    Build a combined .glb from multiple images + depth maps.

    1. Reconstruct each image into a .ply (Gaussian splat)
    2. Load all .ply files
    3. Merge into a single scene
    4. Export as .glb

    Returns path to the saved .glb file.
    """
    import trimesh

    output_path = Path(output_path)
    ply_dir = output_path.parent / "ply"
    ply_dir.mkdir(parents=True, exist_ok=True)

    combined_scene = trimesh.Scene()
    x_offset = 0.0
    ROOM_SPACING = 3.0

    for idx, (rgb_path, depth_npy_path) in enumerate(image_depth_pairs):
        print(f"[sam3d] Reconstructing image {idx + 1}/{len(image_depth_pairs)}: {Path(rgb_path).name}")

        result = reconstruct_single(rgb_path, depth_npy_path, ply_dir)

        if result["success"] and result["ply_path"]:
            try:
                mesh = trimesh.load(result["ply_path"])

                # Offset each reconstruction so they don't overlap
                transform = np.eye(4)
                transform[0, 3] = x_offset

                if isinstance(mesh, trimesh.Scene):
                    for name, geom in mesh.geometry.items():
                        combined_scene.add_geometry(
                            geom,
                            node_name=f"room{idx}_{name}",
                            transform=transform,
                        )
                else:
                    combined_scene.add_geometry(
                        mesh,
                        node_name=f"room{idx}",
                        transform=transform,
                    )

                x_offset += ROOM_SPACING
                print(f"[sam3d]   OK in {result['time_s']:.1f}s")
            except Exception as e:
                print(f"[sam3d]   Failed to load .ply: {e}")
        else:
            print(f"[sam3d]   Skipped (reconstruction failed)")

    # Export combined scene to .glb
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if len(combined_scene.geometry) == 0:
        print("[sam3d] WARNING: No geometries to export, creating empty .glb")
        combined_scene.add_geometry(
            trimesh.PointCloud([[0, 0, 0]]),
            node_name="placeholder",
        )

    glb_data = combined_scene.export(file_type="glb")
    with open(output_path, "wb") as f:
        f.write(glb_data)

    file_size_mb = output_path.stat().st_size / (1024 * 1024)
    print(f"[sam3d] Saved {output_path} ({file_size_mb:.1f} MB, "
          f"{len(combined_scene.geometry)} geometries)")

    return str(output_path)

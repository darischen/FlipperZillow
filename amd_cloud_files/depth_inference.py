"""
Depth Anything V2 inference wrapper.
Produces per-image depth maps from RGB images.
"""
import sys
import torch
import numpy as np
from pathlib import Path
from PIL import Image

import config
from utils import load_image_as_numpy, save_depth_as_png, timer

# Add Depth Anything V2 repo to path so we can import its modules
sys.path.insert(0, str(config.DEPTH_ANYTHING_REPO))

_model = None


def _load_model():
    global _model
    if _model is not None:
        return _model

    from depth_anything_v2.dpt import DepthAnythingV2

    cfg = config.DEPTH_MODEL_CONFIGS[config.DEPTH_ENCODER]
    model = DepthAnythingV2(**cfg)
    model.load_state_dict(
        torch.load(str(config.DEPTH_ANYTHING_CKPT), map_location="cpu")
    )
    model = model.to(config.DEVICE).eval()
    print(f"[depth] Loaded Depth Anything V2 ({config.DEPTH_ENCODER}) on {config.DEVICE}")
    _model = model
    return _model


def infer_depth(image_path: str | Path) -> np.ndarray:
    """
    Run Depth Anything V2 on a single image.
    Returns raw depth as float32 numpy array (H, W).
    Larger values = farther from camera.
    """
    model = _load_model()
    raw_img = load_image_as_numpy(image_path)

    with torch.no_grad():
        depth = model.infer_image(raw_img)  # returns (H, W) numpy float

    return depth.astype(np.float32)


def process_images(image_paths: list[str | Path], output_dir: str | Path) -> list[dict]:
    """
    Run depth inference on a batch of images.
    Saves depth maps as PNGs and raw .npy files.
    Returns list of { image, depth_png, depth_npy, shape, time_s }.
    """
    output_dir = Path(output_dir)
    depth_dir = output_dir / "depth"
    depth_dir.mkdir(parents=True, exist_ok=True)

    results = []
    for img_path in image_paths:
        img_path = Path(img_path)
        stem = img_path.stem

        with timer() as t:
            depth = infer_depth(img_path)

        depth_png = depth_dir / f"{stem}_depth.png"
        depth_npy = depth_dir / f"{stem}_depth.npy"

        save_depth_as_png(depth, depth_png)
        np.save(depth_npy, depth)

        results.append({
            "image": str(img_path),
            "depth_png": str(depth_png),
            "depth_npy": str(depth_npy),
            "shape": list(depth.shape),
            "time_s": round(t.elapsed, 3),
        })
        print(f"[depth] {img_path.name} → {depth.shape} in {t.elapsed:.2f}s")

    return results

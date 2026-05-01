"""
Depth Anything V2 inference wrapper (NVIDIA CUDA optimized).
Produces per-image depth maps from RGB images.

For RTX 3060 Ti (8GB): uses vits model with VRAM cleanup between images.
"""
import sys
import torch
import numpy as np
from pathlib import Path
from PIL import Image

import config
from utils import load_image_as_numpy, save_depth_as_png, timer, log_gpu_stats

# Add Depth Anything V2 repo to path
sys.path.insert(0, str(config.DEPTH_ANYTHING_REPO))

_model = None
_device = None


def _log_vram(stage: str = ""):
    """Log current GPU VRAM usage."""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**2
        reserved = torch.cuda.memory_reserved() / 1024**2
        print(f"[depth] VRAM {stage}: {allocated:.0f}MB allocated, {reserved:.0f}MB reserved")


def _load_model():
    global _model, _device
    if _model is not None:
        return _model

    from depth_anything_v2.dpt import DepthAnythingV2

    print(f"[depth] Loading Depth Anything V2 ({config.DEPTH_ENCODER})...")
    cfg = config.DEPTH_MODEL_CONFIGS[config.DEPTH_ENCODER]
    model = DepthAnythingV2(**cfg)

    # Load checkpoint
    try:
        state = torch.load(str(config.DEPTH_ANYTHING_CKPT), map_location="cpu", weights_only=True)
        model.load_state_dict(state)
        print(f"[depth] Checkpoint loaded: {config.DEPTH_ANYTHING_CKPT}")
    except FileNotFoundError:
        print(f"[depth] WARNING: Checkpoint not found at {config.DEPTH_ANYTHING_CKPT}")
        print(f"[depth] Attempting to use default weights...")

    # Try GPU, fall back to CPU
    target_device = config.DEVICE
    try:
        model = model.to(target_device).eval()
        _log_vram("after model load")
        _device = target_device
        print(f"[depth] Model loaded on {_device}")
    except Exception as e:
        print(f"[depth] GPU failed ({e}), falling back to CPU")
        model = model.cpu().eval()
        _device = "cpu"
        print(f"[depth] Model loaded on CPU (slower)")

    _model = model
    return _model


def infer_depth(image_path: str | Path) -> np.ndarray:
    """
    Run Depth Anything V2 on a single image.
    Returns raw depth as float32 numpy array (H, W).
    """
    model = _load_model()
    raw_img = load_image_as_numpy(image_path)

    with torch.no_grad():
        depth = model.infer_image(raw_img)

    return depth.astype(np.float32)


def process_images(image_paths: list[str | Path], output_dir: str | Path) -> list[dict]:
    """
    Run depth inference on a batch of images.
    For 8GB VRAM, processes one image at a time.
    """
    output_dir = Path(output_dir)
    depth_dir = output_dir / "depth"
    depth_dir.mkdir(parents=True, exist_ok=True)

    results = []
    model = _load_model()

    for idx, img_path in enumerate(image_paths):
        img_path = Path(img_path)
        stem = img_path.stem

        print(f"[depth] [{idx+1}/{len(image_paths)}] Processing {img_path.name}...")

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

        print(f"[depth]   → {depth.shape} in {t.elapsed:.2f}s")
        _log_vram()

    # Clean up to save VRAM for downstream steps
    if config.UNLOAD_AFTER_USE:
        global _model
        if _model is not None:
            del _model
            _model = None
            torch.cuda.empty_cache()
            print("[depth] Model unloaded, VRAM freed for next step")

    return results

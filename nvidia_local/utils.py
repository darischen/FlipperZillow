"""
Shared utilities for NVIDIA local pipeline.
Includes image downloading, VRAM tracking, timing utilities.
"""
import hashlib
import io
import time
from pathlib import Path

import numpy as np
import requests
import torch
from PIL import Image

from config import OUTPUT_DIR


def job_dir(job_id: str) -> Path:
    """Return (and create) the output directory for a job."""
    d = OUTPUT_DIR / job_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def generate_job_id(urls: list[str]) -> str:
    """Deterministic hash from sorted URLs so re-runs hit cache."""
    blob = "\n".join(sorted(urls)).encode()
    return hashlib.sha256(blob).hexdigest()[:16]


def download_image(url: str, timeout: int = 30) -> Image.Image:
    """Download a URL and return a PIL RGB image."""
    resp = requests.get(url, timeout=timeout, headers={
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
    })
    resp.raise_for_status()
    return Image.open(io.BytesIO(resp.content)).convert("RGB")


def download_images(urls: list[str], dest_dir: Path) -> list[dict]:
    """
    Download all images into dest_dir.
    Returns list of { index, filename, path, url, ok, error? }.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    results = []
    for i, url in enumerate(urls):
        fname = f"img_{i:03d}.jpg"
        fpath = dest_dir / fname
        entry = {"index": i, "filename": fname, "path": str(fpath), "url": url, "ok": False}
        try:
            if fpath.exists():
                entry["ok"] = True
                entry["cached"] = True
                print(f"  [{i+1}/{len(urls)}] {fname} (cached)")
            else:
                img = download_image(url)
                img.save(fpath, "JPEG", quality=95)
                entry["ok"] = True
                print(f"  [{i+1}/{len(urls)}] {fname} ✓")
        except Exception as e:
            entry["error"] = str(e)
            print(f"  [{i+1}/{len(urls)}] {fname} ✗ — {e}")
        results.append(entry)
    return results


def load_image_as_numpy(path: str | Path) -> np.ndarray:
    """Load image from disk as RGB numpy uint8 array (H, W, 3)."""
    return np.array(Image.open(path).convert("RGB"))


def save_depth_as_png(depth: np.ndarray, path: str | Path):
    """Save a float depth map as a normalized 16-bit grayscale PNG."""
    d = depth.copy()
    d = (d - d.min()) / (d.max() - d.min() + 1e-8)
    d = (d * 65535).astype(np.uint16)
    Image.fromarray(d, mode="I;16").save(path)


def log_gpu_stats():
    """Print detailed GPU statistics."""
    if not torch.cuda.is_available():
        print("[GPU] CUDA not available")
        return

    print(f"[GPU] Device: {torch.cuda.get_device_name(0)}")
    print(f"[GPU] Total VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB")
    print(f"[GPU] Allocated: {torch.cuda.memory_allocated() / 1024**2:.0f} MB")
    print(f"[GPU] Reserved: {torch.cuda.memory_reserved() / 1024**2:.0f} MB")


def timer():
    """Simple context-manager-style timer."""
    class _T:
        def __init__(self):
            self.start = time.time()
            self.elapsed = 0
        def __enter__(self):
            self.start = time.time()
            return self
        def __exit__(self, *_):
            self.elapsed = time.time() - self.start
    return _T()

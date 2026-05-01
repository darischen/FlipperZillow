"""
Configuration for NVIDIA GPU pipeline (RTX 3060 Ti - 8GB VRAM).
Optimized for sequential processing and memory efficiency.
"""
import os
from pathlib import Path

# ── Base paths ──────────────────────────────────────────────
# Check environment variable, then flipperzillow/models, then home directory
_nvidia_home = os.environ.get("NVIDIA_HOME")
if _nvidia_home:
    HOME = Path(_nvidia_home)
else:
    # Try flipperzillow/models first
    _project_models = Path(__file__).parent.parent / "models"
    if _project_models.exists():
        HOME = _project_models
    else:
        HOME = Path.home()

# Model repos (clone if not present)
DEPTH_ANYTHING_REPO = HOME / "Depth-Anything-V2"
SAM3D_REPO = HOME / "sam-3d-objects"
DFORMER_REPO = HOME / "DFormer"

# ── GPU Configuration ─────────────────────────────────────────
# NVIDIA CUDA device
DEVICE = os.environ.get("DEVICE", "cuda")

# Depth Anything V2 model size: vits | vitb | vitl | vitg
# Using 'vitl' (large, 335.3M params) for better depth quality
DEPTH_ENCODER = os.environ.get("DEPTH_ENCODER", "vitl")

DEPTH_MODEL_CONFIGS = {
    "vits": {"encoder": "vits", "features": 64, "out_channels": [48, 96, 192, 384]},
    "vitb": {"encoder": "vitb", "features": 128, "out_channels": [96, 192, 384, 768]},
    "vitl": {"encoder": "vitl", "features": 256, "out_channels": [256, 512, 1024, 1024]},
    "vitg": {"encoder": "vitg", "features": 384, "out_channels": [1536, 1536, 1536, 1536]},
}

# Depth Anything checkpoint
DEPTH_ANYTHING_CKPT = DEPTH_ANYTHING_REPO / "checkpoints" / f"depth_anything_v2_{DEPTH_ENCODER}.pth"

# DFormer config + checkpoint
# Using DFormerv2-Base with NYUv2_DFormer_Base checkpoint
# Note: There's a 96-channel mismatch in decoder (896 vs 992)
# This is handled by loading compatible parameters only
DFORMER_CFG = DFORMER_REPO / "local_configs" / "NYUDepthv2" / "DFormerv2_B.py"
DFORMER_CKPT = DFORMER_REPO / "checkpoints" / "NYUv2_DFormer_Large.pth"

# SAM 3D Objects config
SAM3D_CFG = SAM3D_REPO / "checkpoints" / "hf" / "pipeline.yaml"

# ── Pipeline settings ──────────────────────────────────────
# VRAM management: unload models after use to avoid OOM
UNLOAD_AFTER_USE = True

# Sequential processing: process images one-by-one instead of batches
BATCH_SIZE = 1

# Skip expensive models if needed
SKIP_DFORMER_BY_DEFAULT = False
SKIP_SAM_BY_DEFAULT = False

# Output directory
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", Path.home() / "flipperzillow_output"))

# Server
HOST = os.environ.get("HOST", "127.0.0.1")  # localhost only for local dev
PORT = int(os.environ.get("PORT", "8001"))

# NYUv2 40-class labels used by DFormer
NYUV2_CLASSES = [
    "wall", "floor", "cabinet", "bed", "chair",
    "sofa", "table", "door", "window", "bookshelf",
    "picture", "counter", "blinds", "desk", "shelves",
    "curtain", "dresser", "pillow", "mirror", "floor_mat",
    "clothes", "ceiling", "books", "fridge", "tv",
    "paper", "towel", "shower_curtain", "box", "whiteboard",
    "person", "night_stand", "toilet", "sink", "lamp",
    "bathtub", "bag", "otherstructure", "otherfurniture", "otherprop",
]

# Approximate camera intrinsics for typical listing photos
DEFAULT_FX = 500.0
DEFAULT_FY = 500.0

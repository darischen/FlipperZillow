"""
Paths and configuration for AMD cloud pipeline.
All model repos are assumed cloned in the home directory.
Adjust paths here if models live elsewhere.
"""
import os
from pathlib import Path

# ── ROCm environment setup (must be set before torch import) ─────
# MI300X is gfx942 — ensure HIP targets the correct architecture
os.environ.setdefault("HSA_OVERRIDE_GFX_VERSION", "9.4.2")
os.environ.setdefault("HIP_VISIBLE_DEVICES", "0")
os.environ.setdefault("PYTORCH_HIP_ALLOC_CONF", "expandable_segments:True")

# ── Base paths ──────────────────────────────────────────────
# Models are already downloaded on AMD cloud in home directory
# If different location, set AMD_HOME environment variable
HOME = Path(os.environ.get("AMD_HOME", Path.home()))

# Cloned repos (all in /root/ on AMD cloud)
DEPTH_ANYTHING_REPO  = HOME / "Depth-Anything-V2"
SAM3D_REPO           = HOME / "sam-3d-objects"

# DFormer: VCIP-RGBD/DFormer repo for RGBD semantic segmentation
# Also have bbynku/DFormerv2 HuggingFace space (GeoPrior demo)
DFORMER_REPO         = HOME / "DFormer"           # VCIP-RGBD/DFormer
DFORMERV2_HF_REPO    = HOME / "DFormerv2"         # bbynku/DFormerv2 (optional)

# Model weights (adjust filenames to match what you downloaded)
DEPTH_ANYTHING_CKPT  = DEPTH_ANYTHING_REPO / "checkpoints" / "depth_anything_v2_vitl.pth"

# DFormer config + checkpoint (mmseg-style)
# Try DFormer_Large first, fall back to Base/Small
DFORMER_CFG          = DFORMER_REPO / "local_configs" / "NYUDepthv2" / "DFormer_Large.py"
DFORMER_CKPT         = DFORMER_REPO / "checkpoints" / "DFormer_Large.pth"

# SAM 3D Objects config
SAM3D_CFG            = SAM3D_REPO / "checkpoints" / "hf" / "pipeline.yaml"

# ── Pipeline settings ──────────────────────────────────────
DEVICE = os.environ.get("DEVICE", "cuda")  # ROCm exposes AMD GPU as cuda via HIP

# Depth Anything V2 model size: vits | vitb | vitl | vitg
DEPTH_ENCODER = os.environ.get("DEPTH_ENCODER", "vitl")

DEPTH_MODEL_CONFIGS = {
    "vits": {"encoder": "vits", "features":  64, "out_channels": [48,  96,  192, 384]},
    "vitb": {"encoder": "vitb", "features": 128, "out_channels": [96,  192, 384, 768]},
    "vitl": {"encoder": "vitl", "features": 256, "out_channels": [256, 512, 1024, 1024]},
    "vitg": {"encoder": "vitg", "features": 384, "out_channels": [1536, 1536, 1536, 1536]},
}


# Output directory for processed results
# Defaults to /root/outputs/ on AMD cloud
OUTPUT_DIR = Path(os.environ.get("OUTPUT_DIR", Path.home() / "outputs"))

# Server
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "8001"))

# NYUv2 40-class labels used by DFormerV2
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

# Approximate camera intrinsics for typical listing photos (can override)
DEFAULT_FX = 500.0
DEFAULT_FY = 500.0

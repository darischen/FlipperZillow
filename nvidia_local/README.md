# NVIDIA Local Development Pipeline

Lightweight, memory-optimized pipeline for developing FlipperZillow on **RTX 3060 Ti (8GB VRAM)**.

This is a parallel implementation to `amd_cloud_files/`, designed for local NVIDIA GPU development before deploying to AMD Cloud.

---

## Quick Start

### 1. Setup (10 minutes)

```bash
cd nvidia_local

# Create venv
python -m venv venv
source venv/Scripts/activate  # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Download model repos (one-time)
bash download_models.sh  # Or follow SETUP_NVIDIA.md manually
```

### 2. Test Depth Inference (2 minutes)

```bash
python main_simple.py "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg"
```

Expected: Depth map saved to `~/flipperzillow_output/`.

### 3. Full Pipeline (Optional, 5-10 minutes)

See `SETUP_NVIDIA.md` for details on running the complete depth + DFormer + SAM 3D pipeline.

---

## Architecture

```
NVIDIA Local Pipeline (RTX 3060 Ti, 8GB VRAM)
└─ Optimizations:
   ├─ Use vits (small) Depth model instead of vitl
   ├─ Use DFormer-Small instead of Large
   ├─ Process images sequentially (one at a time)
   ├─ Unload models after use (free VRAM between steps)
   └─ Fallback to CPU if OOM
```

---

## Files

| File | Purpose |
|------|---------|
| `config.py` | Configuration (model sizes, VRAM settings) |
| `requirements.txt` | Python dependencies (CUDA PyTorch) |
| `utils.py` | Shared utilities (image download, VRAM logging) |
| `depth_inference.py` | Depth Anything V2 inference (VRAM-optimized) |
| `dformer_inference.py` | DFormer semantic segmentation (optional) |
| `sam3d_inference.py` | SAM 3D reconstruction (optional) |
| `main_simple.py` | Quick test script |
| `main.py` | FastAPI server (if needed) |
| `SETUP_NVIDIA.md` | Detailed setup guide |

---

## Configuration

Edit `config.py` to customize behavior:

```python
DEPTH_ENCODER = "vits"       # Model size: vits | vitb | vitl | vitg
UNLOAD_AFTER_USE = True      # Free VRAM after each model step
BATCH_SIZE = 1               # Process one image at a time
DEVICE = "cuda"              # "cuda" or "cpu"
OUTPUT_DIR = Path.home() / "flipperzillow_output"
```

Or set environment variables:

```bash
export DEPTH_ENCODER=vitb
export DEVICE=cpu
export OUTPUT_DIR=/custom/path
export NVIDIA_HOME=/custom/models/path
```

---

## Performance

On RTX 3060 Ti:

- **Depth Anything V2 (vits)**: 2-3s per image, ~2.5GB VRAM
- **DFormer (Small)**: 3-5s per image, ~4-6GB VRAM
- **SAM 3D**: 8-15s per image, ~6-7GB VRAM

**Total for 5 room images**: ~3-5 minutes, never exceeds 7GB peak VRAM (with unloading between steps).

---

## Troubleshooting

### CUDA Out of Memory
```bash
# Option 1: Use smaller model
export DEPTH_ENCODER=vits

# Option 2: Skip expensive models
export SKIP_DFORMER_BY_DEFAULT=True
export SKIP_SAM_BY_DEFAULT=True

# Option 3: Use CPU (slower, no VRAM limit)
export DEVICE=cpu
```

### Model Not Found
Ensure model repos are cloned to `~/models/`:
```bash
ls ~/models/Depth-Anything-V2/
ls ~/models/DFormer/
ls ~/models/sam-3d-objects/
```

See `SETUP_NVIDIA.md` for download instructions.

### Check GPU Status
```bash
nvidia-smi                    # One-time check
watch -n 0.5 nvidia-smi       # Live monitoring
```

---

## Integration with Next.js Frontend

When ready to test with the frontend:

```bash
# Start the FastAPI server
python main.py

# Frontend calls http://localhost:8001/process with image URLs
# See main.py for API endpoints
```

---

## Next: Deploy to AMD Cloud

Once development is complete, switch to `amd_cloud_files/` for production deployment on AMD Instinct GPU (192GB VRAM).

The AMD version uses larger models (vitl, Large variants) for better quality, running all steps in parallel for speed.

---

## System Info

This pipeline was tested on:
- **GPU**: NVIDIA RTX 3060 Ti (8GB GDDR6)
- **CPU**: AMD Ryzen 7 3700X
- **RAM**: 32GB DDR4 3600MHz
- **Storage**: M.2 NVMe
- **CUDA**: 13.2 (driver), 11.8 (toolkit)
- **Python**: 3.14.3
- **PyTorch**: 2.5.1 + CUDA 12.1

---

## License

Part of FlipperZillow. Uses:
- Depth Anything V2 (Apache 2.0)
- SAM (Apache 2.0)
- DFormer (MIT)
- trimesh (MIT)

---

## Questions?

See `SETUP_NVIDIA.md` for detailed setup instructions and troubleshooting.

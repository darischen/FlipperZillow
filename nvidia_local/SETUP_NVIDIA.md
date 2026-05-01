# NVIDIA Local Pipeline Setup (RTX 3060 Ti)

Your system: **RTX 3060 Ti (8GB VRAM)**, CUDA 13.2, Python 3.14.3

This guide sets up a lightweight pipeline optimized for local development on your GPU.

---

## Step 1: Install Python Dependencies

```bash
# Navigate to the nvidia_local directory
cd flipperzillow/nvidia_local

# Create a virtual environment (recommended)
python -m venv venv
source venv/Scripts/activate  # On Windows: venv\Scripts\activate

# Install dependencies (CUDA PyTorch will be auto-installed)
pip install -r requirements.txt

# Verify PyTorch + CUDA
python -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'Device: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_memory / 1024**3:.1f} GB')
"
```

Expected output:
```
PyTorch: 2.5.1+cu121
CUDA available: True
Device: NVIDIA GeForce RTX 3060 Ti
VRAM: 8.0 GB
```

---

## Step 2: Download and Prepare Model Repositories

The pipeline needs three model repos. Clone them to your home directory:

```bash
cd ~
mkdir -p models
cd models

# 1. Depth Anything V2 (1.5 GB + checkpoint 4.3 GB)
git clone https://github.com/DepthAnything/Depth-Anything-V2.git
cd Depth-Anything-V2
mkdir -p checkpoints

# Download small model checkpoint (vits - only 2.5 GB on disk)
wget -O checkpoints/depth_anything_v2_vits.pth \
  https://huggingface.co/spaces/LiheYoung/Depth-Anything/resolve/main/checkpoints/depth_anything_v2_vits.pth

cd ..

# 2. DFormer (for RGBD semantic segmentation)
git clone https://github.com/VCIP-RGBD/DFormer.git
cd DFormer
mkdir -p checkpoints

# For 8GB VRAM, use DFormer-Small (not Large)
# The repo should have the checkpoint, or download manually if needed
cd ..

# 3. SAM 3D Objects (for 3D reconstruction)
git clone https://github.com/facebookresearch/sam-3d-objects.git

cd sam-3d-objects
mkdir -p checkpoints/hf
# Models will be auto-downloaded on first use

cd ~
```

Now set the environment variable:

```bash
# Linux/Mac: add to ~/.bashrc or ~/.zshrc
export NVIDIA_HOME="$HOME/models"

# Windows (PowerShell): Set-Item -Path Env:NVIDIA_HOME -Value "$HOME/models"
# Or add to System Environment Variables permanently
```

Verify:
```bash
python -c "from config import DEPTH_ANYTHING_REPO; print(DEPTH_ANYTHING_REPO)"
```

---

## Step 3: Set Up Output Directory

Create a directory for pipeline outputs:

```bash
mkdir -p ~/flipperzillow_output
```

This can be customized via the `OUTPUT_DIR` environment variable.

---

## Step 4: Test the Individual Pipelines

### Test Depth Anything V2

```bash
cd nvidia_local

# Create a test image
python -c "
from PIL import Image
import numpy as np

# Create a 480x640 test image
img = np.random.randint(0, 255, (480, 640, 3), dtype=np.uint8)
Image.fromarray(img).save('test_image.jpg')
print('Created test_image.jpg')
"

# Run depth inference
python -c "
import torch
from depth_inference import process_images

print('Testing Depth Anything V2...')
results = process_images(['test_image.jpg'], './test_output')
print(f'Success! Depth map shape: {results[0][\"shape\"]}')
"
```

If successful, you'll see GPU memory stats and a depth map saved.

### Test with Real Images (Optional)

Download a sample room image:

```bash
python -c "
import requests
from pathlib import Path

url = 'https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg'
Path('sample_room.jpg').write_bytes(requests.get(url).content)
print('Downloaded sample_room.jpg')
"

# Run the full depth + DFormer + SAM pipeline (if available)
# See pipeline.py for the run_pipeline() function
```

---

## Step 5: Run the FastAPI Server (Optional)

For integrating with the Next.js frontend later:

```bash
# Start the server
python main.py

# In another terminal, test it
curl -X POST http://localhost:8001/health -H "Content-Type: application/json"
```

---

## Configuration

Edit `config.py` to customize:

| Setting | Default | Notes |
|---------|---------|-------|
| `DEPTH_ENCODER` | `vits` | Use `vits` for 8GB VRAM (small), `vitb` for larger VRAM |
| `UNLOAD_AFTER_USE` | `True` | Unload models after inference to save VRAM |
| `BATCH_SIZE` | `1` | Process one image at a time for memory efficiency |
| `OUTPUT_DIR` | `~/flipperzillow_output` | Where to save results |
| `DEVICE` | `cuda` | Use `cpu` if GPU issues arise |

Environment variable overrides (convenient for testing):

```bash
export DEVICE=cpu          # Use CPU instead of GPU
export DEPTH_ENCODER=vitb  # Use larger depth model
export OUTPUT_DIR=/custom/path
export NVIDIA_HOME=/custom/models/path
```

---

## Troubleshooting

### "CUDA out of memory"

1. **Reduce model size**: Set `DEPTH_ENCODER=vits` in config.py (already default)
2. **Skip expensive modules**: Set `SKIP_DFORMER_BY_DEFAULT=True` or `SKIP_SAM_BY_DEFAULT=True` in config.py
3. **Restart**: VRAM isn't freed until the process exits. Kill the Python process and try again.
4. **Check what's using VRAM**: `nvidia-smi` or `watch -n 0.5 nvidia-smi`

### "Model checkpoint not found"

Ensure the checkpoint exists at the path shown in config.py:
```bash
ls -la ~/models/Depth-Anything-V2/checkpoints/
ls -la ~/models/DFormer/checkpoints/
```

If missing, re-run the download step from Step 2.

### "ModuleNotFoundError: No module named 'mmseg'"

This is expected if DFormer's mmseg isn't installed. The code falls back to heuristic segmentation (no neural model, but still works).

To enable full DFormer:
```bash
pip install mmsegmentation mmengine
```

### "ImportError: cannot import name 'DepthAnythingV2'"

Ensure the Depth Anything V2 repo is cloned to `~/models/Depth-Anything-V2`:
```bash
cd ~/models
git clone https://github.com/DepthAnything/Depth-Anything-V2.git
```

---

## Performance Expectations

On RTX 3060 Ti with small models:

| Model | Time per image | VRAM used |
|-------|---|---|
| Depth Anything V2 (vits) | 2-3s | ~2.5 GB |
| DFormer (Small, with depth) | 3-5s | ~4-6 GB |
| SAM 3D | 8-15s | ~6-7 GB |
| **Total for 1 image** | ~15-25s | Peak ~6-7 GB |
| **Total for 5 images** | ~2-3 min | (unloaded between steps) |

Full pipeline (depth + DFormer + SAM) for 5 room images: **~3-5 minutes** on RTX 3060 Ti.

---

## Next Steps

1. **Test locally** using the commands in Step 4
2. **Integrate with Next.js frontend** by running the FastAPI server (Step 5)
3. **Process real listings** by providing image URLs to the pipeline
4. **Deploy to AMD Cloud** (optional) when ready for production — use the `amd_cloud_files` instead

---

## Questions?

Check the inline comments in each Python file for detailed implementation notes.


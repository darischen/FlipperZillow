#!/bin/bash
# ──────────────────────────────────────────────────────────
# FlipperZillow AMD Cloud Pipeline — Startup Script
#
# Usage:
#   ./run.sh                    # Start the FastAPI server
#   ./run.sh process urls.txt   # Run pipeline directly on a URL file
#   ./run.sh test               # Quick smoke test
# ──────────────────────────────────────────────────────────

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Environment ─────────────────────────────────────────
export DEVICE="${DEVICE:-cuda}"
export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8001}"
# OUTPUT_DIR is set in config.py (defaults to /root/outputs/)

# Paths to cloned model repos (adjust if different on your machine)
export AMD_HOME="${AMD_HOME:-$HOME}"

echo "============================================"
echo " FlipperZillow AMD Cloud Pipeline"
echo "============================================"
echo " Device:       $DEVICE"
echo " Depth Repo:   $AMD_HOME/Depth-Anything-V2"
echo " SAM 3D Repo:  $AMD_HOME/sam-3d-objects"
echo " DFormer Repo: $AMD_HOME/DFormer"
echo " Output Dir:   $OUTPUT_DIR"
echo "============================================"

# ── Verify GPU ──────────────────────────────────────────
python3 -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
if torch.cuda.is_available():
    print(f'GPU: {torch.cuda.get_device_name(0)}')
    print(f'VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB')
else:
    print('WARNING: No GPU detected! Pipeline will be very slow on CPU.')
"

# ── Verify model repos exist ───────────────────────────
for repo in "$AMD_HOME/Depth-Anything-V2" "$AMD_HOME/sam-3d-objects" "$AMD_HOME/DFormer"; do
    if [ ! -d "$repo" ]; then
        echo "WARNING: $repo not found"
    else
        echo "OK: $repo"
    fi
done

echo ""

# ── Commands ────────────────────────────────────────────
case "${1:-server}" in
    server)
        echo "Starting FastAPI server on $HOST:$PORT..."
        python3 main.py
        ;;
    watch)
        echo "Starting pipeline watcher (monitors workspace/image_urls.json)..."
        python3 watch.py ${@:2}
        ;;
    process)
        if [ -z "$2" ]; then
            echo "Usage: ./run.sh process <urls_file>"
            exit 1
        fi
        echo "Running pipeline on $2..."
        python3 pipeline.py "$2" "${@:3}"
        ;;
    test)
        echo "Running smoke test..."
        python3 -c "
import config
from pathlib import Path
print('Config loaded OK')
print(f'  Depth ckpt:  {config.DEPTH_ANYTHING_CKPT}  exists={config.DEPTH_ANYTHING_CKPT.exists()}')
print(f'  SAM 3D cfg:  {config.SAM3D_CFG}  exists={config.SAM3D_CFG.exists()}')
print(f'  DFormer cfg: {config.DFORMER_CFG}  exists={config.DFORMER_CFG.exists()}')
print(f'  DFormer ckpt:{config.DFORMER_CKPT}  exists={config.DFORMER_CKPT.exists()}')
print(f'  Output dir:  {config.OUTPUT_DIR}')
print(f'  Workspace:   /workspace/  exists={Path(\"/workspace\").exists()}')
print()

# Test each import individually
for name in ['depth_inference', 'dformer_inference', 'sam3d_inference']:
    try:
        __import__(name)
        print(f'  {name}: OK')
    except ImportError as e:
        print(f'  {name}: FAILED — {e}')
    except Exception as e:
        print(f'  {name}: FAILED — {e}')

print()
print('Smoke test complete.')
"
        ;;
    *)
        echo "Usage: ./run.sh [server|watch|process <urls_file>|test]"
        exit 1
        ;;
esac

# AMD Cloud Setup Guide

## Prerequisites

You'll need access to an AMD Cloud instance with:
- AMD Instinct GPU (MI300X or similar)
- ROCm 6.1+ installed
- At least 128GB VRAM (for DFormerV2 and SAM)
- Ubuntu 22.04+ or similar Linux

## Step 1: Provision AMD Cloud Instance

Use [AMD Cloud Developer Program](https://www.amd.com/en/developer/amd-cloud-developer-program.html):

```bash
# SSH into your instance
ssh -i ~/.ssh/amd_key.pem ubuntu@<instance-ip>
```

## Step 2: Install PyTorch with ROCm

```bash
# Update system
sudo apt-get update && sudo apt-get upgrade -y

# Install Python build tools
sudo apt-get install -y python3.11 python3.11-dev python3.11-venv

# Create virtual environment
python3.11 -m venv ~/venv
source ~/venv/bin/activate

# Install PyTorch with ROCm 6.1
pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.1

# Verify GPU support
python3 -c "
import torch
print(f'PyTorch: {torch.__version__}')
print(f'CUDA available: {torch.cuda.is_available()}')
print(f'Device: {torch.cuda.get_device_name(0)}')
print(f'VRAM: {torch.cuda.get_device_properties(0).total_mem / 1024**3:.1f} GB')
"
```

Expected output:
```
PyTorch: 2.1.0+rocm6.1
CUDA available: True
Device: AMD INSTINCT MI300X 192GB
VRAM: 192.0 GB
```

## Step 3: Clone Model Repositories

```bash
cd ~
mkdir models
cd models

# Depth Anything V2 (1.5 GB)
git clone https://github.com/DepthAnything/Depth-Anything-V2.git
cd Depth-Anything-V2
mkdir -p checkpoints
# Download vitl checkpoint (4.3 GB)
wget https://huggingface.co/spaces/LiheYoung/Depth-Anything/resolve/main/checkpoints/depth_anything_v2_vitl.pth -O checkpoints/depth_anything_v2_vitl.pth
cd ..

# SAM 3D Objects (from Facebook Research)
git clone https://github.com/facebookresearch/sam-3d-objects.git
cd sam-3d-objects
mkdir -p checkpoints
# Download SAM ViT-H checkpoint (2.5 GB)
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth -O checkpoints/sam_vit_h_4b8939.pth
cd ..

# DFormerV2 (from HuggingFace)
git clone https://huggingface.co/bbynku/DFormerv2.git
cd DFormerv2
# Weights are auto-downloaded on first run, but you can pre-download:
pip install huggingface-hub
huggingface-cli download bbynku/DFormerv2 --local-dir ./

cd ../..
```

Update your `~/.bashrc` with the model paths:
```bash
export AMD_HOME="$HOME/models"
```

## Step 4: Deploy FlipperZillow AMD Cloud Pipeline

```bash
# Navigate to a working directory
cd ~/flipperzillow
mkdir -p amd_cloud
cd amd_cloud

# Copy the pipeline files (from this repo) into ~/flipperzillow/amd_cloud/
# You can either:
# 1. Clone the flipperzillow repo
# 2. Or manually copy all the *.py files, *.sh, and requirements.txt

git clone https://github.com/your-repo/flipperzillow.git
cd flipperzillow/amd_cloud

# Install Python dependencies
source ~/venv/bin/activate
pip install -r requirements.txt

# Install additional deps for mesh reconstruction
pip install opencv-python open3d

# Make startup script executable
chmod +x run.sh
```

## Step 5: Test the Pipeline

```bash
source ~/venv/bin/activate
cd ~/flipperzillow/amd_cloud

# Quick health check
./run.sh test

# Optional: run with a small test image set
# First create a test URL file
cat > test_urls.json <<EOF
{
  "urls": [
    "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg"
  ]
}
EOF

# Run pipeline
python3 pipeline.py test_urls.json

# Results will be in outputs/{job_id}/
```

## Step 6: Start the FastAPI Server

```bash
source ~/venv/bin/activate
cd ~/flipperzillow/amd_cloud

# Start server in foreground for testing
./run.sh server

# Or start in background with supervisor/systemd:
nohup ./run.sh server > logs/amd_pipeline.log 2>&1 &
```

Server will listen on `http://0.0.0.0:8001`

## Step 7: Configure Firewall (if needed)

```bash
# Allow port 8001 from your network
sudo ufw allow 8001/tcp
# Or allow only from your frontend IP
sudo ufw allow from <frontend-ip> to any port 8001
```

## Step 8: Set Up SSH for Frontend Upload

Your Next.js frontend needs SSH credentials to upload image URLs. Generate a keypair:

```bash
# On AMD instance
mkdir -p ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/flipperzillow_key -N ""

# Copy public key to authorized_keys
cat ~/.ssh/flipperzillow_key.pub >> ~/.ssh/authorized_keys

# Copy the private key to your frontend repo (NOT in git):
# Save to flipperzillow/.env.local or similar
# Keep it secure!
```

## Step 9: Optionally Use Systemd for Auto-Start

Create `/etc/systemd/system/flipperzillow-pipeline.service`:

```ini
[Unit]
Description=FlipperZillow AMD Cloud Pipeline
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/flipperzillow/amd_cloud
Environment="PATH=/home/ubuntu/venv/bin"
Environment="AMD_HOME=/home/ubuntu/models"
ExecStart=/home/ubuntu/venv/bin/python3 main.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable flipperzillow-pipeline
sudo systemctl start flipperzillow-pipeline
sudo systemctl status flipperzillow-pipeline
```

## Step 10: Set Up Log Rotation

Create `/etc/logrotate.d/flipperzillow`:

```
/home/ubuntu/flipperzillow/amd_cloud/logs/*.log {
  daily
  rotate 7
  compress
  delaycompress
  notifempty
  create 0640 ubuntu ubuntu
  sharedscripts
}
```

## Troubleshooting

### GPU not detected
```bash
rocm-smi
# Should show your AMD GPU
```

### Out of Memory during DFormerV2
```bash
# Use a smaller model
export DEPTH_ENCODER=vitb  # instead of vitl
```

### SAM is very slow
```bash
# Reduce mask generation detail
# Edit sam3d_inference.py, change points_per_side=32 to points_per_side=16
```

### Network timeout downloading models
```bash
# Use wget with retry
wget --tries=3 <model_url>
```

## Performance Tuning

For faster processing:

```bash
# Reduce image download parallelism
# Edit utils.py, reduce concurrent requests

# Use point clouds instead of mesh reconstruction
# Set create_mesh=false in pipeline calls

# Process images in parallel
# The FastAPI server already handles concurrent requests

# Reduce SAM mask count
# In sam3d_inference.py: max_masks=10 instead of 20
```

## Monitoring

```bash
# Watch GPU usage
watch -n 0.5 rocm-smi

# Monitor pipeline execution
tail -f ~/flipperzillow/amd_cloud/logs/pipeline.log

# Check disk usage
df -h ~/flipperzillow/amd_cloud/outputs

# Clean up old job results
rm -rf ~/flipperzillow/amd_cloud/outputs/{job_id}
```

## Backup & Disaster Recovery

Important files to backup:
- `.ssh/flipperzillow_key` (private SSH key for frontend)
- Model checkpoints (or re-download URLs)

```bash
# Backup private key
scp ubuntu@<instance>:.ssh/flipperzillow_key ~/.backup/

# Backup model checkpoints (optional, can re-download)
tar -czf models_backup.tar.gz ~/models/*/checkpoints/
```

## Questions?

Check the main README.md for API usage and troubleshooting.

---

**Deployment checklist:**
- [ ] AMD Cloud instance provisioned
- [ ] PyTorch + ROCm installed and tested
- [ ] Model repos cloned + checkpoints downloaded
- [ ] Pipeline deployed to ~/flipperzillow/amd_cloud
- [ ] Health check passing (`./run.sh test`)
- [ ] FastAPI server running on port 8001
- [ ] SSH key pair generated for frontend
- [ ] Firewall configured
- [ ] Systemd service running (optional)
- [ ] Log rotation configured (optional)

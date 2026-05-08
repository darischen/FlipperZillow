# SAM 3D Objects inference service with conda and all dependencies
FROM nvidia/cuda:12.1.0-devel-ubuntu22.04

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    wget curl git build-essential \
    libssl-dev libffi-dev \
    libgl1-mesa-glx libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Miniconda
RUN wget https://repo.anaconda.com/miniconda/Miniconda3-latest-Linux-x86_64.sh -O /tmp/miniconda.sh && \
    bash /tmp/miniconda.sh -b -p /opt/miniconda && \
    rm /tmp/miniconda.sh

ENV PATH="/opt/miniconda/bin:$PATH"

# Accept conda terms of service and create environment
RUN conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/main && \
    conda tos accept --override-channels --channel https://repo.anaconda.com/pkgs/r && \
    conda config --add channels conda-forge && \
    conda config --add channels pytorch && \
    conda config --add channels nvidia && \
    conda create -n sam3d python=3.10 -y

# Install PyTorch CUDA 12.1 from pytorch channel (must come from pytorch, NOT conda-forge)
RUN conda install -n sam3d -c pytorch -c nvidia \
    "pytorch=2.5.1=py3.10_cuda12.1*" pytorch-cuda=12.1 torchvision torchaudio -y && \
    conda clean --all --yes

# Install pip into the sam3d environment (without this, pip installs go to base env)
RUN conda install -n sam3d pip -y && conda clean --all --yes

# Install conda packages into sam3d environment
RUN conda install -n sam3d -y \
    fastapi uvicorn pydantic requests \
    pillow "numpy<2.0" trimesh \
    omegaconf hydra-core \
    matplotlib seaborn && \
    conda clean --all --yes

# Install research packages — pin numpy<2.0 first (kaolin built against numpy 1.x)
# Install xformers with --no-deps to prevent it from upgrading torch to CPU-only
RUN conda run -n sam3d python -m pip install --no-cache-dir \
    "numpy<2.0" \
    transformers gradio av \
    "utils3d" --no-deps \
    tqdm einops timm opencv-python-headless \
    loguru easydict roma optree
RUN conda run -n sam3d python -m pip install --no-cache-dir --no-deps xformers spconv-cu121

# Install kaolin from NVIDIA wheel server
RUN conda run -n sam3d python -m pip install --no-cache-dir \
    kaolin==0.17.0 \
    --find-links https://nvidia-kaolin.s3.us-east-2.amazonaws.com/torch-2.5.1_cu121.html

# Pin numpy<2.0 again after kaolin (kaolin may pull numpy 2.x)
RUN conda run -n sam3d python -m pip install --no-cache-dir "numpy<2.0"

# Install MoGe depth model (required by pipeline.yaml)
RUN conda run -n sam3d python -m pip install --no-cache-dir \
    "git+https://github.com/microsoft/MoGe.git@a8c37341bc0325ca99b9d57981cc3bb2bd3e255b" --no-deps

# Install pytorch3d from source via pip (NOT conda — conda overwrites CUDA PyTorch with CPU-only)
# This step takes ~10-15 minutes to compile
RUN conda run -n sam3d python -m pip install --no-cache-dir --no-build-isolation \
    "git+https://github.com/facebookresearch/pytorch3d.git@stable"

# Install gsplat from PyPI (prebuilt wheels — git source build fails without GPU at build-time)
RUN conda run -n sam3d python -m pip install --no-cache-dir "gsplat==1.0.0"

# Force reinstall pybind11 via pip (conda installs dist-info only, not the Python module)
RUN conda run -n sam3d python -m pip install pybind11 --force-reinstall

# Re-pin CUDA torch after pip installs (xformers/spconv may have upgraded to CPU-only)
RUN conda install -n sam3d -c pytorch -c nvidia \
    "pytorch=2.5.1=py3.10_cuda12.1*" pytorch-cuda=12.1 torchvision torchaudio -y && \
    conda clean --all --yes

# Ensure pip is back in sam3d (conda re-install can drop it) and reinstall packages
# that may have been lost when conda re-solved the env. Then replace utils3d 0.1.x
# (PyPI version lacks the utils3d.numpy submodule that sam3d_objects imports) with
# the git version 1.7 which has it.
RUN conda install -n sam3d pip -y && conda clean --all --yes
RUN conda run -n sam3d python -m pip install --no-cache-dir \
    "transformers<5" tqdm einops timm "numpy<2.0" moderngl \
    loguru easydict roma optree opencv-python-headless av gradio \
    open3d
# sam3d_objects pipeline dependencies discovered via iterative import testing
RUN conda run -n sam3d python -m pip install --no-cache-dir \
    astor plyfile fvcore point-cloud-utils scikit-image \
    lightning rootutils polyscope pyrender pymeshfix xatlas \
    OpenEXR panda3d-gltf roma einops-exts \
    pccm cumm-cu121 pyvista igraph
RUN conda run -n sam3d python -m pip uninstall -y utils3d || true
RUN conda run -n sam3d python -m pip install --no-cache-dir --no-deps \
    "git+https://github.com/EasternJournalist/utils3d.git"

# Copy project files
COPY models/sam-3d-objects /app/sam-3d-objects
COPY scraper /app/scraper

# Add sam3d-objects + notebook to PYTHONPATH for direct imports
ENV PYTHONPATH="/app/sam-3d-objects:/app/sam-3d-objects/notebook:/app"

WORKDIR /app

EXPOSE 8001

# Verify critical packages are installed
RUN conda run -n sam3d python -c "import fastapi, uvicorn, torch, kaolin, pytorch3d; print('torch cuda:', torch.version.cuda); print('✓ Core packages OK')"

# Enable detailed CUDA error messages and device-side assertions for better debugging
ENV CUDA_LAUNCH_BLOCKING=1
ENV TORCH_USE_CUDA_DSA=1

# Health check
HEALTHCHECK --interval=10s --timeout=5s --start-period=180s --retries=3 \
    CMD conda run -n sam3d python -c "import requests; requests.get('http://localhost:8001/health', timeout=2)" || exit 1

# Run the SLAT service
CMD ["conda", "run", "--no-capture-output", "-n", "sam3d", "python", "-u", "-m", "scraper.slat_fastapi", "--checkpoint-dir", "/app/sam-3d-objects/checkpoints", "--port", "8001", "--host", "0.0.0.0"]

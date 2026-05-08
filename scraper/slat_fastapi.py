"""
FastAPI service for SLAT mesh decoding.
Runs inside WSL2 (or natively on Linux) and exposes HTTP endpoints.

Usage:
  conda activate sam3d
  python -m scraper.slat_fastapi --checkpoint-dir ./models/sam-3d-objects/checkpoints --port 8001
"""

import argparse
import logging
import os
from pathlib import Path
from typing import Optional

# MUST set this before importing sam3d_objects to skip heavy initialization
os.environ["LIDRA_SKIP_INIT"] = "true"

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import uvicorn

# Import the SLAT inference service
from scraper.slat_service import init_models, decode_mesh, batch_decode_meshes

app = FastAPI(title="SLAT Mesh Decoder")
logger = logging.getLogger(__name__)

# Models initialized at startup
MODELS_INITIALIZED = False

# Try to get checkpoint dir from environment, then use defaults
def get_checkpoint_dir():
    """Find checkpoint directory from environment or defaults."""
    # Check environment variable first
    if 'SLAT_CHECKPOINT_DIR' in os.environ:
        return os.environ['SLAT_CHECKPOINT_DIR']

    # Check official sam3d checkpoints location (hf = huggingface)
    candidates = [
        Path.cwd() / "models" / "sam-3d-objects" / "checkpoints" / "hf",
        Path.cwd() / "models" / "sam-3d-objects" / "checkpoints",
        Path.cwd() / "checkpoints",
        Path.home() / "checkpoints",
    ]

    for path in candidates:
        pipeline_yaml = path / "pipeline.yaml"
        if pipeline_yaml.exists():
            logger.info(f"Found checkpoint dir: {path}")
            return str(path)

    # Return first candidate as default
    logger.warning(f"No checkpoints found in candidates. Returning default: {candidates[0]}")
    return str(candidates[0])


class DecodeMeshRequest(BaseModel):
    image_path: str
    output_path: Optional[str] = None
    target_size: int = 512


class BatchDecodeRequest(BaseModel):
    image_paths: list
    output_dir: str


@app.on_event("startup")
async def startup_event():
    """Initialize models on startup."""
    global MODELS_INITIALIZED

    checkpoint_dir = get_checkpoint_dir()
    generator_path = Path(checkpoint_dir) / "slat_generator.ckpt"
    decoder_path = Path(checkpoint_dir) / "slat_decoder_mesh.pt"

    logger.info(f"Looking for checkpoints in: {checkpoint_dir}")
    logger.info(f"  Generator: {generator_path}")
    logger.info(f"  Decoder: {decoder_path}")

    if not generator_path.exists() or not decoder_path.exists():
        logger.error(f"Checkpoints not found in {checkpoint_dir}")
        if not generator_path.exists():
            logger.error(f"  Missing: {generator_path}")
        if not decoder_path.exists():
            logger.error(f"  Missing: {decoder_path}")
        return

    logger.info("Initializing SLAT models...")
    result = init_models(checkpoint_dir)

    if result.get("success"):
        MODELS_INITIALIZED = True
        logger.info("Models initialized successfully")
    else:
        logger.error(f"Model initialization failed: {result.get('error')}")


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "ok",
        "models_initialized": MODELS_INITIALIZED,
    }


@app.post("/decode-mesh")
async def api_decode_mesh(request: DecodeMeshRequest):
    """Decode a single image to a 3D mesh."""
    if not MODELS_INITIALIZED:
        raise HTTPException(status_code=503, detail="Models not initialized")

    # Generate default output path if not provided
    output_path = request.output_path
    if not output_path:
        image_stem = Path(request.image_path).stem
        output_path = str(Path("/app/data/glb_output") / f"{image_stem}.glb")

    result = decode_mesh(
        image_path=request.image_path,
        output_path=output_path,
        target_size=request.target_size,
    )

    if not result.get("success"):
        detail = result.get("error")
        if "suggestion" in result:
            detail = f"{detail} — {result['suggestion']}"
        raise HTTPException(status_code=400, detail=detail)

    return result


@app.post("/batch-decode")
async def api_batch_decode(request: BatchDecodeRequest):
    """Decode multiple images to meshes."""
    if not MODELS_INITIALIZED:
        raise HTTPException(status_code=503, detail="Models not initialized")

    result = batch_decode_meshes(
        image_paths=request.image_paths,
        output_dir=request.output_dir,
    )

    return result


def main():
    """Run the FastAPI server."""
    parser = argparse.ArgumentParser(description="SLAT FastAPI Server")
    parser.add_argument(
        "--checkpoint-dir",
        type=str,
        default=None,
        help="Path to checkpoint directory (auto-detected if not provided)"
    )
    parser.add_argument(
        "--port",
        type=int,
        default=8001,
        help="Port to run on"
    )
    parser.add_argument(
        "--host",
        type=str,
        default="0.0.0.0",
        help="Host to bind to"
    )

    args = parser.parse_args()

    logging.basicConfig(level=logging.INFO)

    # Set environment variable for checkpoint dir
    if args.checkpoint_dir:
        os.environ['SLAT_CHECKPOINT_DIR'] = args.checkpoint_dir
        logger.info(f"Checkpoint dir (from args): {args.checkpoint_dir}")

    logger.info(f"Starting SLAT FastAPI service on {args.host}:{args.port}")

    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()

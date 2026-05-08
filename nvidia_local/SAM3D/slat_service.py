"""
Meta SAM 3D Objects inference service using official repository.
Uses the cloned sam-3d-objects repo from models/ directory.
"""

import torch
import json
import logging
import time
from pathlib import Path
from PIL import Image
import numpy as np
from typing import Optional, Dict, Any
import sys
import os

# Add official sam3d_objects repo to path
SAM3D_REPO = Path(__file__).parent.parent / "models" / "sam-3d-objects"
if SAM3D_REPO.exists():
    sys.path.insert(0, str(SAM3D_REPO))
    sys.path.insert(0, str(SAM3D_REPO / "notebook"))
    logger = logging.getLogger(__name__)
    logger.info(f"Added SAM3D repo to path: {SAM3D_REPO}")

try:
    import trimesh
    HAS_TRIMESH = True
except ImportError:
    HAS_TRIMESH = False

logger = logging.getLogger(__name__)

# Global inference engine
_inference = None
_device = None


def _patch_missing_stubs():
    """Stub missing functions that are imported but never called with our pipeline settings."""
    import sys
    import types

    # utils3d.numpy.depth_edge — only used by layout_post_optimization (disabled via with_layout_postprocess=False)
    utils3d = sys.modules.get("utils3d")
    if utils3d is None:
        import utils3d as utils3d
    numpy_mod = getattr(utils3d, "numpy", None)
    if numpy_mod is not None and not hasattr(numpy_mod, "depth_edge"):
        numpy_mod.depth_edge = lambda *a, **kw: None


class _PipelineWrapper:
    """Wraps InferencePipelinePointMap without the notebook's heavy viz imports."""
    def __init__(self, config_file: str):
        import os
        os.environ["LIDRA_SKIP_INIT"] = "true"  # skip heavy sam3d_objects.init (same as notebook)
        os.environ["CUDA_HOME"] = os.environ.get("CONDA_PREFIX", "/opt/miniconda/envs/sam3d")
        _patch_missing_stubs()
        from omegaconf import OmegaConf
        from hydra.utils import instantiate
        config = OmegaConf.load(config_file)
        config.rendering_engine = "pytorch3d"
        config.compile_model = False
        config.workspace_dir = os.path.dirname(config_file)
        self._pipeline = instantiate(config)

    def __call__(self, image: np.ndarray, mask: Optional[np.ndarray] = None, seed=None, pointmap=None):
        if mask is None:
            mask = np.ones(image.shape[:2], dtype=bool)
        mask_u8 = (mask.astype(np.uint8) * 255)[..., None]
        rgba = np.concatenate([image[..., :3], mask_u8], axis=-1)
        return self._pipeline.run(
            rgba, None, seed,
            stage1_only=False,
            with_mesh_postprocess=False,
            with_texture_baking=False,
            with_layout_postprocess=False,
            use_vertex_color=True,
            stage1_inference_steps=None,
            pointmap=pointmap,
        )


def init_models(checkpoint_dir: str, device: Optional[str] = None) -> Dict[str, Any]:
    """
    Initialize SAM 3D Objects inference pipeline directly (bypasses notebook inference.py).

    Args:
        checkpoint_dir: Path to checkpoints directory
        device: 'cuda', 'cpu', or None (auto-detect)

    Returns:
        Status dict with device info
    """
    global _inference, _device

    start = time.time()

    if device is None:
        device = 'cuda' if torch.cuda.is_available() else 'cpu'
    _device = device

    logger.info(f"Loading SAM 3D Objects on device: {device}")

    try:
        pipeline_config = Path(checkpoint_dir) / "pipeline.yaml"

        if not pipeline_config.exists():
            return {
                "success": False,
                "error": f"pipeline.yaml not found in {checkpoint_dir}"
            }

        logger.info(f"Loading pipeline from: {pipeline_config}")
        _inference = _PipelineWrapper(str(pipeline_config))
        logger.info("SAM 3D Objects pipeline loaded")

        elapsed = time.time() - start
        mem_info = {
            "elapsed_ms": int(elapsed * 1000),
            "device": device,
            "cuda_available": torch.cuda.is_available(),
        }

        if torch.cuda.is_available():
            mem_info["cuda_memory_allocated_mb"] = torch.cuda.memory_allocated() / 1e6
            mem_info["cuda_device_name"] = torch.cuda.get_device_name(0)

        logger.info(f"Models loaded in {elapsed:.2f}s")
        return {"success": True, **mem_info}

    except Exception as e:
        logger.error(f"Failed to load models: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def preprocess_image(image_path: str, target_size: int = 512) -> np.ndarray:
    """Load and preprocess image."""
    img = Image.open(image_path).convert('RGB')
    img = img.resize((target_size, target_size), Image.Resampling.LANCZOS)
    return np.array(img)


def decode_mesh(
    image_path: str,
    output_path: Optional[str] = None,
    target_size: int = 512,
) -> Dict[str, Any]:
    """
    Convert image to 3D mesh via SAM 3D Objects.

    Args:
        image_path: Path to input image
        output_path: Path to save .glb
        target_size: Image resize dimension

    Returns:
        Status dict
    """
    if _inference is None:
        return {"success": False, "error": "Models not initialized"}

    start = time.time()
    logger.info(f"Decoding mesh from {image_path}")

    try:
        img = preprocess_image(image_path, target_size)
        logger.info(f"Preprocessed image: shape={img.shape}")

        logger.info(f"Running inference on image (this may take 10-20 minutes on CPU)")
        inference_start = time.time()
        output = _inference(img)
        inference_elapsed = time.time() - inference_start
        logger.info(f"Inference completed in {inference_elapsed:.2f}s")
        logger.info(f"Inference output keys: {list(output.keys()) if isinstance(output, dict) else type(output)}")

        if HAS_TRIMESH and output_path:
            Path(output_path).parent.mkdir(parents=True, exist_ok=True)
            glb_path = str(output_path).replace('.obj', '.glb')

            logger.info(f"Attempting to export mesh to {glb_path}")

            # The pipeline already builds a trimesh-compatible glb via to_glb()
            # in InferencePipeline.run — just export it.
            if isinstance(output, dict) and output.get('glb') is not None:
                logger.info(f"Found 'glb' key in output")
                output['glb'].export(glb_path)
            elif isinstance(output, dict) and 'mesh' in output:
                logger.info(f"Found 'mesh' key in output")
                # Raw mesh list — pick the first mesh (single-object inference)
                mesh = output['mesh']
                if isinstance(mesh, list):
                    mesh = mesh[0]
                mesh.export(glb_path)
            else:
                logger.warning(f"Unknown output format: {output if isinstance(output, dict) else type(output)}")
                return {"success": False, "error": "Unknown model output format"}

            logger.info(f"Exported mesh to {glb_path}")
        else:
            glb_path = None

        elapsed = time.time() - start
        if torch.cuda.is_available():
            torch.cuda.empty_cache()

        return {
            "success": True,
            "glb_path": glb_path,
            "elapsed_ms": int(elapsed * 1000),
        }

    except Exception as e:
        logger.error(f"Mesh decoding failed: {e}", exc_info=True)
        return {"success": False, "error": str(e)}


def batch_decode_meshes(image_paths: list, output_dir: str) -> Dict[str, Any]:
    """Decode multiple images."""
    results = []
    total_start = time.time()

    for i, image_path in enumerate(image_paths):
        output_path = Path(output_dir) / f"mesh_{i:03d}.glb"
        result = decode_mesh(image_path, str(output_path))
        results.append({"image_path": image_path, **result})
        logger.info(f"[{i+1}/{len(image_paths)}] {result}")

    total_elapsed = time.time() - total_start

    return {
        "total_elapsed_ms": int(total_elapsed * 1000),
        "count": len(results),
        "results": results,
    }


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    ckpt_dir = str(Path(__file__).parent.parent / "models" / "sam-3d-objects" / "checkpoints" / "hf")
    print("Initializing models...")
    init_result = init_models(ckpt_dir)
    print(json.dumps(init_result, indent=2))

    if init_result.get("success"):
        print("\nModels ready. Awaiting API requests...")

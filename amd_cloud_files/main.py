"""
FastAPI server for AMD cloud pipeline.

Endpoints:
  POST /process         Full pipeline: image URLs → depth + features + .glb
  POST /depth           Depth Anything V2 only
  POST /features        DFormerV2 RGBD features only (requires depth maps)
  POST /reconstruct     SAM 3D → .glb only (requires depth maps)
  GET  /jobs/{job_id}   Get results for a completed job
  GET  /jobs/{job_id}/model.glb   Download the .glb file
  GET  /jobs/{job_id}/summary     Get property summary JSON
  GET  /health          Health check
"""
import json
import asyncio
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel

import config
from utils import generate_job_id, job_dir

app = FastAPI(title="FlipperZillow AMD Cloud Pipeline", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Request / Response models ──────────────────────────────

class ProcessRequest(BaseModel):
    image_urls: list[str]
    job_id: Optional[str] = None
    skip_sam: bool = False
    skip_dformer: bool = False
    create_mesh: bool = True


class DepthRequest(BaseModel):
    image_urls: list[str]
    job_id: Optional[str] = None


class FeaturesRequest(BaseModel):
    job_id: str  # must have depth maps already


class ReconstructRequest(BaseModel):
    job_id: str  # must have depth maps already
    create_mesh: bool = True


# ── Endpoints ──────────────────────────────────────────────

@app.get("/health")
async def health():
    import torch
    return {
        "status": "ok",
        "gpu_available": torch.cuda.is_available(),
        "gpu_name": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "device": config.DEVICE,
    }


@app.post("/process")
async def process(req: ProcessRequest):
    """Run the full pipeline: download → depth → features → .glb"""
    from pipeline import run_pipeline

    result = await asyncio.get_event_loop().run_in_executor(
        None,
        lambda: run_pipeline(
            image_urls=req.image_urls,
            job_id=req.job_id,
            skip_sam=req.skip_sam,
            skip_dformer=req.skip_dformer,
            create_mesh=req.create_mesh,
        ),
    )

    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])

    return result


@app.post("/depth")
async def depth_only(req: DepthRequest):
    """Run only Depth Anything V2 on the provided images."""
    from utils import download_images
    import depth_inference

    jid = req.job_id or generate_job_id(req.image_urls)
    out = job_dir(jid)

    def _run():
        img_results = download_images(req.image_urls, out / "images")
        ok_paths = [r["path"] for r in img_results if r["ok"]]
        if not ok_paths:
            return {"error": "No images could be downloaded"}
        depth_results = depth_inference.process_images(ok_paths, out)
        return {"job_id": jid, "depth": depth_results, "image_count": len(ok_paths)}

    result = await asyncio.get_event_loop().run_in_executor(None, _run)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/features")
async def features_only(req: FeaturesRequest):
    """Run DFormerV2 on an existing job's images + depth maps."""
    import dformer_inference

    out = job_dir(req.job_id)
    images_dir = out / "images"
    depth_dir = out / "depth"

    if not images_dir.exists() or not depth_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Job {req.job_id} not found or missing depth maps. Run /depth first.",
        )

    def _run():
        pairs = _get_image_depth_pairs(images_dir, depth_dir)
        if not pairs:
            return {"error": "No image-depth pairs found"}
        features = dformer_inference.process_images(pairs, out)
        return {"job_id": req.job_id, "features": features, "count": len(features)}

    result = await asyncio.get_event_loop().run_in_executor(None, _run)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.post("/reconstruct")
async def reconstruct_only(req: ReconstructRequest):
    """Run SAM 3D → .glb on an existing job's images + depth maps."""
    import sam3d_inference

    out = job_dir(req.job_id)
    images_dir = out / "images"
    depth_dir = out / "depth"

    if not images_dir.exists() or not depth_dir.exists():
        raise HTTPException(
            status_code=404,
            detail=f"Job {req.job_id} not found or missing depth maps. Run /depth first.",
        )

    def _run():
        pairs = _get_image_depth_pairs(images_dir, depth_dir)
        if not pairs:
            return {"error": "No image-depth pairs found"}
        glb_path = sam3d_inference.build_glb(
            pairs, out / "model.glb",
            use_sam_masks=True,
            create_mesh=req.create_mesh,
        )
        return {"job_id": req.job_id, "glb_path": glb_path}

    result = await asyncio.get_event_loop().run_in_executor(None, _run)
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    """Get the pipeline result for a completed job."""
    out = job_dir(job_id)
    result_file = out / "pipeline_result.json"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail=f"Job {job_id} not found")
    return JSONResponse(json.loads(result_file.read_text()))


@app.get("/jobs/{job_id}/model.glb")
async def get_glb(job_id: str):
    """Download the .glb file for a completed job."""
    glb = job_dir(job_id) / "model.glb"
    if not glb.exists():
        raise HTTPException(status_code=404, detail=f"No .glb for job {job_id}")
    return FileResponse(glb, media_type="model/gltf-binary", filename=f"{job_id}.glb")


@app.get("/jobs/{job_id}/summary")
async def get_summary(job_id: str):
    """Get the aggregated property summary JSON for Claude script generation."""
    summary = job_dir(job_id) / "property_summary.json"
    if not summary.exists():
        raise HTTPException(status_code=404, detail=f"No summary for job {job_id}")
    return JSONResponse(json.loads(summary.read_text()))


# ── Helpers ─────────────────────────────────────────────────

def _get_image_depth_pairs(images_dir: Path, depth_dir: Path) -> list[tuple[str, str]]:
    """Match image files to their corresponding depth .npy files."""
    pairs = []
    for img_file in sorted(images_dir.glob("*.jpg")):
        depth_file = depth_dir / f"{img_file.stem}_depth.npy"
        if depth_file.exists():
            pairs.append((str(img_file), str(depth_file)))
    return pairs


# ── Entry point ─────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    print(f"Starting AMD Cloud Pipeline on {config.HOST}:{config.PORT}")
    uvicorn.run(app, host=config.HOST, port=config.PORT)

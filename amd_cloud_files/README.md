# AMD Cloud Pipeline for FlipperZillow

A complete 3D property reconstruction and AI analysis pipeline for AMD Instinct GPUs (ROCm).

## Pipeline Overview

**Input:** List of property listing image URLs from the Next.js frontend
**Output:**
- `.glb` file (3D point cloud/mesh reconstruction)
- `property_summary.json` (semantic features for Claude realtor script generation)
- Per-image feature JSONs (room classification, detected objects, layout analysis)

```
Image URLs
    ↓
[Depth Anything V2]    → depth maps
    ↓
[DFormerV2 RGBD]       → per-image semantic features
    ↓
[SAM 3D Objects]       → 3D point clouds/meshes
    ↓
[Export]               → model.glb + property_summary.json
    ↓
[Claude API]           → realtor tour script
```

## Prerequisites

On the AMD cloud instance:

1. **Python 3.10+** and **PyTorch with ROCm 6.1**:
   ```bash
   pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.1
   ```

2. **Model repositories** (cloned into home directory):
   ```bash
   cd ~
   git clone https://github.com/DepthAnything/Depth-Anything-V2
   git clone https://github.com/facebookresearch/sam-3d-objects
   git clone https://huggingface.co/bbynku/DFormerv2
   ```

3. **Python dependencies**:
   ```bash
   pip install -r requirements.txt
   ```

4. **Optional for mesh reconstruction**: OpenCV and Open3D:
   ```bash
   pip install opencv-python open3d
   ```

## Configuration

Edit `config.py` to set paths if your models are in different locations:

```python
HOME = Path(os.environ.get("AMD_HOME", Path.home()))
DEPTH_ANYTHING_REPO = HOME / "Depth-Anything-V2"
SAM3D_REPO = HOME / "sam-3d-objects"
DFORMER_REPO = HOME / "DFormerv2"
```

Or set via environment:
```bash
export AMD_HOME=/custom/path
export DEVICE=cuda  # or rocm
export OUTPUT_DIR=/path/to/outputs
```

## Usage

### Option 1: FastAPI Server (for Next.js frontend)

Start the server:
```bash
./run.sh server
# Server runs on http://0.0.0.0:8001
```

The Next.js frontend will call:
```bash
POST http://amd-cloud:8001/process
{
  "image_urls": ["https://...", "https://..."],
  "create_mesh": true
}

# Response:
{
  "job_id": "a1b2c3d4e5f6g7h8",
  "output_dir": "/path/to/outputs/a1b2c3d4e5f6g7h8",
  "glb_path": "/path/to/outputs/a1b2c3d4e5f6g7h8/model.glb",
  "property_summary": {...},
  "timing": {"download": 5.2, "depth": 12.1, "dformer": 18.3, "sam3d": 45.7, ...}
}
```

Get results for a job:
```bash
GET http://amd-cloud:8001/jobs/a1b2c3d4e5f6g7h8
GET http://amd-cloud:8001/jobs/a1b2c3d4e5f6g7h8/model.glb
GET http://amd-cloud:8001/jobs/a1b2c3d4e5f6g7h8/summary
```

### Option 2: Watch for SSH-Uploaded URLs

The Next.js frontend can SSH into the AMD instance and write image URLs to `workspace/image_urls.json`. The watcher automatically triggers processing:

```bash
mkdir -p workspace
./run.sh watch

# Or process once and exit:
./run.sh watch --once
```

**Frontend SSH Example:**
```javascript
// In Next.js, after user clicks a property
const sshClient = new SSH2Client();
const imageUrls = listing.photo_urls || [];
const json = JSON.stringify({ urls: imageUrls });
sshClient.putFile(
  Buffer.from(json),
  '/path/to/amd/workspace/image_urls.json'
);
```

### Option 3: Direct CLI

```bash
# Create a file with image URLs (one per line or JSON array)
echo "[\"https://...\", \"https://...\"]" > urls.json

# Run pipeline
./run.sh process urls.json

# With options:
python3 pipeline.py urls.json --skip-sam --skip-dformer --no-mesh
```

## API Endpoints

### POST `/process`
Full pipeline: download → depth → features → .glb

**Request:**
```json
{
  "image_urls": ["https://...", "https://..."],
  "job_id": "optional-custom-id",
  "skip_sam": false,
  "skip_dformer": false,
  "create_mesh": true
}
```

**Response:**
```json
{
  "job_id": "a1b2c3d4e5f6g7h8",
  "output_dir": "...",
  "images": [...],
  "depth": [...],
  "features": [...],
  "glb_path": "...",
  "property_summary": {
    "room_count": 4,
    "room_types": {"living_room": 2, "kitchen": 1, "bathroom": 1},
    "rooms": [...],
    "all_detected_objects": ["sofa", "tv", "table", ...],
    "has_natural_light": true,
    "has_3d_model": true
  },
  "timing": {...}
}
```

### POST `/depth`
Depth Anything V2 only (fast, ~2-3s per image)

### POST `/features`
DFormerV2 semantic segmentation (requires existing depth maps)

### POST `/reconstruct`
SAM 3D → .glb (requires existing depth maps, slowest step)

### GET `/jobs/{job_id}`
Retrieve stored result

### GET `/jobs/{job_id}/model.glb`
Download the .glb file

### GET `/jobs/{job_id}/summary`
Get property summary JSON (input for Claude realtor script)

### GET `/health`
Server status + GPU info

## Output Structure

```
outputs/
├── {job_id}/
│   ├── pipeline_result.json          # Full result object
│   ├── property_summary.json         # For Claude
│   ├── model.glb                     # 3D reconstruction
│   ├── images/
│   │   ├── img_000.jpg
│   │   ├── img_001.jpg
│   │   └── ...
│   ├── depth/
│   │   ├── img_000_depth.npy         # Raw depth (float32)
│   │   ├── img_000_depth.png         # Visualization
│   │   └── ...
│   ├── segmentation/
│   │   ├── img_000_seg.png           # Colored segmentation
│   │   └── ...
│   └── features/
│       ├── img_000_features.json     # Room type, objects, layout
│       └── ...
```

## Feature Extraction (DFormerV2 Output)

Each image produces a feature JSON:

```json
{
  "image": "outputs/a1b2/images/img_000.jpg",
  "room_type": "living_room",
  "detected_objects": [
    {"label": "sofa", "coverage_pct": 15.3, "pixel_count": 45000},
    {"label": "tv", "coverage_pct": 8.2, "pixel_count": 24000},
    {"label": "table", "coverage_pct": 5.1, "pixel_count": 15000},
    ...
  ],
  "layout": {
    "has_window": true,
    "has_door": true,
    "natural_light": "likely",
    "floor_coverage_pct": 25.5,
    "ceiling_coverage_pct": 18.2,
    "wall_coverage_pct": 40.1,
    "spaciousness": "spacious"
  },
  "num_distinct_objects": 12,
  "time_s": 4.2
}
```

## Performance

Typical timing on **MI300X** (192GB VRAM):

| Step | Time (per image) | Time (5 images) |
|------|------------------|-----------------|
| Download | - | 2-5s |
| Depth Anything V2 | 2-3s | 10-15s |
| DFormerV2 | 3-4s | 15-20s |
| SAM 3D | 8-12s | 40-60s |
| Mesh Reconstruction | 5-10s | 25-50s |
| **Total** | - | **2-3 min** |

CPU-only is ~10x slower. Depth Anything is the fastest; SAM 3D is slowest.

## Troubleshooting

**Models not found:**
```bash
./run.sh test
# Check the output paths for missing repos
```

**Out of Memory (OOM):**
- Set `DEPTH_ENCODER=vits` in config.py for lighter Depth model
- Reduce `points_per_side` in `sam3d_inference.py` for faster SAM
- Skip mesh reconstruction: `create_mesh=false`

**SSH upload failing:**
- Ensure `workspace/` directory exists on AMD instance
- Check file permissions on SSH credentials
- Verify JSON format: `{"urls": ["https://...", ...]}`

**Poor 3D quality:**
- Check source images (bright, in-focus indoor photos work best)
- Increase `points_per_side` in SAM for more detail
- Use `create_mesh=true` for solid surfaces vs. point clouds

## Integration with Next.js Frontend

The frontend should:

1. Collect image URLs from the API (Realtor.com, Redfin, etc.)
2. SSH into AMD cloud and write `workspace/image_urls.json`
3. Poll `/jobs/{job_id}/summary` until complete
4. Download `model.glb` for 3D viewer
5. Use `property_summary.json` to prompt Claude for realtor script

Example frontend call:
```typescript
const response = await fetch('http://amd-cloud:8001/process', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    image_urls: listing.photo_urls,
    create_mesh: true,
  }),
});
const result = await response.json();
const jobId = result.job_id;

// Poll for completion
let attempts = 0;
while (attempts < 30) {
  const summary = await fetch(`http://amd-cloud:8001/jobs/${jobId}/summary`);
  if (summary.ok) {
    const features = await summary.json();
    // Pass to Claude for script generation
    break;
  }
  await new Promise(r => setTimeout(r, 5000)); // wait 5s
  attempts++;
}
```

## License

Part of the FlipperZillow project. Uses open-source models:
- Depth Anything V2 (Apache 2.0)
- Segment Anything (Apache 2.0)
- DFormerV2 (MIT)

---

**Questions?** Check the inline comments in each `*_inference.py` file for detailed usage.

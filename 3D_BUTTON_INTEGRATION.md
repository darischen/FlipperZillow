# 3D Button Integration Guide

## Overview
The 3D button integration adds lazy-loaded Docker support to the property image gallery. When you click the "3D" button on any room image, it will:
1. Start the SLAT Docker container (if not running)
2. Generate a 3D mesh for that room
3. Display the result in a fullscreen Three.js viewer
4. Stop the Docker container after completion

## Architecture

### API Endpoints
- **`GET /api/sam3d/status`** - Check if Docker container is healthy
- **`POST /api/sam3d/start`** - Start Docker and poll health endpoint (~7 min initialization)
- **`POST /api/sam3d/stop`** - Stop Docker container
- **`POST /api/sam3d/upload-image`** - Convert base64 data URL to temporary file

### Client Libraries
- **`lib/sam3d/client.ts`** - TypeScript client for Docker lifecycle and inference
  - `checkStatus()` - Check container health
  - `start()` - Start container with health polling
  - `stop()` - Stop container
  - `generateMesh(imagePath)` - Run inference on single image
  - `inferenceWithCleanup(imagePath, onProgress)` - Full orchestration with cleanup

### Components
- **`ImageGallery.tsx`** - Updated with 3D button and status displays
- **`SAM3DViewer.tsx`** - Fullscreen Three.js viewer for GLB models

## Testing Instructions

### 1. Prerequisites
```bash
# Make sure you have the test image
ls flipperzillow/src/data/room_image.jpg

# Docker should be running (with NVIDIA Docker support)
docker --version
docker ps
```

### 2. Start the Development Server
```bash
cd flipperzillow
npm run dev
# Server runs at http://localhost:3000
```

### 3. Test the 3D Button (without dispatch-images)

You can manually test the 3D button using the test image:

**Option A: Update ImageGallery props in a test page**
```typescript
// Create a test page or modify an existing one
<ImageGallery 
  address="test" 
  initialPhotos={[
    'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEA...' // base64 encoded test image
  ]} 
/>
```

**Option B: Call the dispatch-images endpoint first**
```bash
# If you have a Redfin listing address, call dispatch-images
curl -X POST http://localhost:3000/api/tour/dispatch-images \
  -H "Content-Type: application/json" \
  -d '{
    "image_urls": ["https://example.com/image1.jpg"],
    "address": "123 Main St"
  }'
```

### 4. Test the Full Flow
1. Open http://localhost:3000 in your browser
2. Enter an address and trigger the image scraping/dispatch
3. Once images load in the gallery (top-right corner), click the **"3D"** button
4. You should see:
   - "Starting Docker container..." message
   - Progress updates as Docker initializes (takes ~7 minutes)
   - "Generating 3D mesh..." message during inference
   - "✓ 3D Model Ready" when complete
5. Click the "Close" button or the success notification to open the 3D viewer
6. The fullscreen viewer should display the rotated 3D mesh
7. Docker automatically stops when inference completes or on error

### 5. Monitor Progress
Watch the browser console for logs:
```
[ImageGallery] Displaying images: 3
[SAM3D] Service not running, starting...
[SAM3DViewer] Loading: 0.00%
[SAM3DViewer] Loading: 100.00%
```

### 6. Troubleshooting

**"Docker not installed" error**
- Make sure Docker Desktop is running
- Test with: `docker ps`

**"Health check timeout" error**
- Docker is starting but taking longer than expected
- Check Docker Desktop resource allocation (Settings → Resources)
- Increase timeout in `api/sam3d/start/route.ts` if needed

**"Failed to load 3D model" in viewer**
- GLB file generation failed in Docker
- Check NVIDIA Docker logs: `docker logs slat-service`
- Verify NVIDIA GPU is available: `nvidia-smi`

**"Cannot find nvidia_local/docker-compose.yml"**
- Make sure you're running from the project root (`flipperzillow/`)
- Verify `nvidia_local/docker-compose.yml` exists

**3D button is grayed out**
- Select an image first (click a thumbnail)
- Or wait for dispatch-images to complete if just loaded

## Performance Notes

| Stage | Duration | Notes |
|-------|----------|-------|
| Docker startup | ~7 min | First time, VRAM/DRAM intensive |
| SLAT inference | ~5-15 min | Depends on image size & GPU (RTX 3060 Ti used ~10 min) |
| GLB loading in viewer | <1 sec | Once file is ready |
| Docker shutdown | <30 sec | Automatic cleanup |

**Total time: ~12-25 minutes** (mostly Docker initialization + inference)

## File Structure
```
flipperzillow/
├── src/
│   ├── app/
│   │   ├── api/sam3d/
│   │   │   ├── status/route.ts
│   │   │   ├── start/route.ts
│   │   │   ├── stop/route.ts
│   │   │   └── upload-image/route.ts
│   │   ├── components/
│   │   │   ├── ImageGallery.tsx (updated)
│   │   │   └── SAM3DViewer.tsx (new)
│   │   └── api/tour/generate-3d/route.ts (existing)
│   ├── lib/sam3d/
│   │   └── client.ts (new)
│   └── data/temp/ (created on first upload)
└── nvidia_local/
    ├── docker-compose.yml (existing)
    └── Dockerfile (existing)
```

## Future Improvements

1. **Caching**: Skip re-generation if GLB already exists for the image
2. **Progress WebSocket**: Real-time Docker/inference logs streamed to frontend
3. **Batch processing**: Generate 3D for all rooms at once
4. **Cloud compute**: Move Docker to AMD Cloud (same image, just change service URL)
5. **Model persistence**: Keep Docker running between clicks (with configurable idle timeout)

## Next Steps

Once you verify this works:
1. Test with real Redfin listings via dispatch-images
2. Compare generated GLB quality with the SAM 3D Objects README examples
3. Integrate room annotations or labels on the 3D model
4. Add model download/export functionality

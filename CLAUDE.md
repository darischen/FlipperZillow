# CLAUDE.md — AI-Powered House Tour (Hackathon Project)

## Project Overview

An end-to-end AI house tour experience that takes an address, scrapes real listing photos from Redfin, builds a 3D spatial environment for Apple Vision Pro, and generates an AI realtor narration with voice. The system has two parallel pipelines that merge into a unified front-end experience.

---

## High-Level Architecture

```
User Input (Address)
        │
        ▼
  Redfin Scraper
  (indoor photos)
        │
        ├─────────────────────────────────┐
        │                                 │
        ▼                                 ▼
  [PIPELINE A: 3D]               [PIPELINE B: AI NARRATION]
  SAM Segmentation               Depth Anything V2
        │                                 │
        ▼                                 ▼
  3D Reconstruction              Depth Map + Images
        │                                 │
        ▼                                 ▼
  .glb File Export               HuggingFace VLM
        │                         (Qwen2-VL-7B on AMD ROCm)
        ▼                         room classifier + pros/cons JSON
  WebSpatial Renderer                     │
  (Apple Vision Pro)                      ▼
        │                         Realtor Script Gen
        │                                 │
        └──────────────┬──────────────────┘
                       ▼
             Next.js Frontend
             (address input, tour UI,
              Google Maps embed,
              semantic search via Claude)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React / Next.js (App Router) |
| 3D Rendering | WebSpatial (Apple Vision Pro), Three.js for web fallback |
| 3D Pipeline | Segment Anything Model (SAM), Depth Anything V2, Open3D or similar for .glb export |
| AI Vision (Pipeline B) | Qwen2-VL-7B via HuggingFace `transformers`, served on AMD Instinct GPU (ROCm) |
| AI Text (Pipeline B + Search) | Claude claude-sonnet-4-6 (script generation + semantic search — text only, no vision) |
| GPU Cloud | AMD Cloud Developer Program (MI300X or equivalent, ROCm 6.x) |
| TTS | ElevenLabs API |
| Maps | Google Maps JavaScript API (Street View + geocoding) |
| Scraper | Redfin scraper (Playwright or Puppeteer) |
| Backend | Next.js API Routes or FastAPI sidecar (Python for depth/SAM pipelines) |

---

## Development Phases

Develop and fully test each phase before moving to the next. Each phase has a clear success criteria.

---

### PHASE 1 — Project Scaffold & Address Input UI
**Goal:** Working Next.js app with address input, Google Maps display, and routing.

**Tasks:**
- Scaffold Next.js 14 app with App Router and Tailwind CSS
- Build `AddressSearchBar` component with autocomplete using Google Places API
- Display Google Maps embed (Street View) for the entered address
- Create `/api/tour/start` route that accepts `{ address: string }` and returns geocoded lat/lng

**Test Criteria:**
- User types an address → map updates to that location
- API route returns valid lat/lng JSON
- No console errors on load

**Files to create:**
- `app/page.tsx` — landing page with search bar
- `app/components/AddressSearchBar.tsx`
- `app/components/MapEmbed.tsx`
- `app/api/tour/start/route.ts`
- `.env.local` with `GOOGLE_MAPS_API_KEY`

---

### PHASE 2 — Redfin Scraper
**Goal:** Given an address, return a list of indoor image URLs from the Redfin listing.

**Tasks:**
- Build a Playwright-based scraper (`scraper/redfin.py`) that:
  1. Searches Redfin for the address
  2. Navigates to the listing page
  3. Extracts all interior photo URLs (filter out exterior/street photos if possible)
- Expose scraper as a FastAPI endpoint: `POST /scrape { address }` → `{ images: string[] }`
- Add a Next.js API route `/api/tour/scrape` that proxies to the Python service

**Test Criteria:**
- Given a known Redfin listing address, scraper returns ≥ 5 image URLs
- Images are accessible (valid HTTP 200 responses)
- Scraper handles "listing not found" gracefully with a clear error

**Files to create:**
- `scraper/redfin.py`
- `scraper/main.py` (FastAPI app)
- `scraper/requirements.txt`
- `app/api/tour/scrape/route.ts`

**Notes:**
- Use stealth Playwright settings to avoid bot detection
- Cache scrape results by address hash to avoid re-scraping during dev

---

### PHASE 3 — Depth Mapping (Depth Anything V2)
**Goal:** For each scraped image, generate a corresponding depth map.

**Tasks:**
- Integrate Depth Anything V2 model into the Python backend
- Accept a list of image URLs, download them, run depth inference
- Return depth maps as base64-encoded PNGs or save to disk with matching filenames
- Expose as `POST /depth { image_urls: string[] }` → `{ depth_maps: string[] }`

**Test Criteria:**
- Given 3 test images, returns 3 depth maps of equal dimensions
- Depth maps are visually correct (closer objects brighter/darker depending on convention)
- Runs in under 30 seconds for 5 images on CPU (GPU preferred)

**Files to create:**
- `scraper/depth.py`
- Update `scraper/main.py` with `/depth` route
- `scraper/test_depth.py` with 3 test image URLs

**Notes:**
- Use `torch` + Depth Anything V2 HuggingFace weights
- Store images and depth maps in `scraper/outputs/{address_hash}/` folder

---

### PHASE 4 — VLM Room Analysis on AMD Cloud (Qwen2-VL-7B)
**Goal:** Run a locally-hosted HuggingFace vision-language model on AMD GPU cloud to analyze each room image + depth map and return structured JSON. This replaces a cloud vision API with a self-hosted VLM, qualifying the project for AMD hackathon prizes.

#### 4a — AMD Cloud Setup & Model Deployment

**Tasks:**
- Provision an AMD Cloud Dev instance with an AMD Instinct GPU (MI300X preferred)
- Install PyTorch with ROCm 6.x:
  ```bash
  pip install torch torchvision --index-url https://download.pytorch.org/whl/rocm6.1
  ```
- Download and verify Qwen2-VL-7B-Instruct weights from HuggingFace:
  ```python
  from transformers import Qwen2VLForConditionalGeneration, AutoProcessor
  model = Qwen2VLForConditionalGeneration.from_pretrained(
      "Qwen/Qwen2-VL-7B-Instruct",
      torch_dtype="auto",
      device_map="auto"   # ROCm will map to AMD GPU
  )
  ```
- Confirm model loads on AMD GPU via `torch.cuda.get_device_name(0)` (ROCm exposes AMD GPU as CUDA-compatible)
- Expose the model as a FastAPI service on the AMD instance: `POST /analyze-room`

**Test Criteria:**
- `torch.cuda.is_available()` returns `True` on the AMD instance
- Model loads without OOM errors (Qwen2-VL-7B requires ~16GB VRAM; MI300X has 192GB)
- Single image inference completes in under 5 seconds

**Files to create:**
- `scraper/vision.py` — Qwen2-VL model loader and inference logic
- `scraper/amd_setup.sh` — ROCm install + environment setup script
- Update `scraper/requirements.txt` with ROCm-specific torch index URL

---

#### 4b — Room Analysis Inference & JSON Output

**Tasks:**
- Build `scraper/vision.py` with an `analyze_room()` function that:
  - Accepts a room image path + depth map path
  - Constructs a structured prompt instructing the model to act as a professional real estate analyst and return **only valid JSON**
  - Runs Qwen2-VL-7B inference with the image and prompt
  - Parses and validates the JSON output

- The model must return JSON matching this schema:
```json
{
  "room_type": "kitchen | bedroom | bathroom | living_room | dining_room | other",
  "description": "string",
  "highlights": ["string"],
  "drawbacks": ["string"],
  "estimated_sq_ft": number | null,
  "natural_light": "low | medium | high",
  "condition": "poor | fair | good | excellent"
}
```

- Use constrained generation or JSON repair (`json-repair` library) to handle malformed outputs
- Expose as `POST /analyze-room { image_path, depth_map_path }` → room JSON
- Build `scraper/aggregate.py` to merge all room JSONs into a single property summary
- Add a Next.js proxy at `/api/tour/analyze` that calls the AMD cloud endpoint

**Prompt template to use:**
```
You are a professional real estate analyst. Analyze this room image and its depth map.
Return ONLY a valid JSON object with these exact keys: room_type, description, highlights (array),
drawbacks (array), estimated_sq_ft (number or null), natural_light (low/medium/high),
condition (poor/fair/good/excellent). No explanation, no markdown, only JSON.
```

**Test Criteria:**
- Given 3 diverse room images, returns valid JSON matching schema for each
- `room_type` classification is correct for kitchen, bedroom, bathroom
- JSON parses without errors (validate with Pydantic in Python; Zod in TypeScript)
- Batch of 10 images processes in under 60 seconds on AMD GPU
- Handles model output errors with json-repair fallback before raising exception

**Files to create:**
- `scraper/vision.py` (Qwen2-VL inference + prompt logic)
- `scraper/aggregate.py` (room JSONs → property summary)
- Update `scraper/main.py` with `/analyze-room` and `/aggregate` routes
- `lib/schemas/roomAnalysis.ts` (Zod schema for frontend validation)
- `app/api/tour/analyze/route.ts` (Next.js proxy to AMD cloud)

**Env vars needed:** `AMD_VLM_URL` (public URL of AMD cloud FastAPI instance)

**Fallback:** If the AMD instance is unavailable during development, mock `vision.py` to return fixture JSON from `scraper/fixtures/sample_room.json`. Never block other phases on GPU availability.

---

### PHASE 5 — Realtor Script Generation & ElevenLabs TTS
**Goal:** Convert the aggregated property JSON into a spoken realtor tour narration.

**Tasks:**
- Build `lib/claude/generateScript.ts` that:
  - Takes aggregated property summary JSON
  - Sends to Claude with a prompt to write a warm, professional realtor tour script (2-3 minutes spoken)
  - Script should reference specific rooms in order and highlight pros naturally
- Build `lib/elevenlabs/generateVoice.ts` that:
  - Sends the script text to ElevenLabs API
  - Uses a professional, warm voice (configure voice ID in env)
  - Returns audio as a buffer or URL
- Expose as `POST /api/tour/narrate` → returns audio file URL or streams audio

**Test Criteria:**
- Script is between 300-600 words, sounds natural when read aloud
- ElevenLabs returns valid MP3 audio
- Audio plays correctly in browser via `<audio>` element
- Script references at least 3 different room types from the analysis

**Files to create:**
- `lib/claude/generateScript.ts`
- `lib/elevenlabs/generateVoice.ts`
- `app/api/tour/narrate/route.ts`
- `app/components/AudioPlayer.tsx`

**Env vars needed:** `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID`

---

### PHASE 6 — 3D Pipeline: SAM Segmentation → .glb Export
**Goal:** Convert indoor photos into a 3D .glb file for WebSpatial rendering.

**Tasks:**
- Use SAM (Segment Anything Model) to segment key surfaces in each image
- Use Depth Anything V2 depth maps to reconstruct point clouds per image
- Merge point clouds and export as `.glb` using Open3D or trimesh
- Store `.glb` output at `public/models/{address_hash}.glb`
- Expose as `POST /generate-3d { address_hash }` → `{ glb_url: string }`

**Test Criteria:**
- Given 5 images + depth maps, outputs a valid `.glb` file
- `.glb` loads without errors in Three.js `GLTFLoader`
- 3D model visually resembles the source photos (rough approximation is acceptable for hackathon)

**Files to create:**
- `scraper/reconstruct.py` (SAM + point cloud → glb)
- Update `scraper/main.py` with `/generate-3d` route

**Notes:**
- For hackathon scope: a textured point cloud `.glb` is sufficient — full mesh reconstruction is a stretch goal
- Use SAM2 if available for better segmentation quality

---

### PHASE 7 — WebSpatial Integration (Apple Vision Pro)
**Goal:** Render the `.glb` model in WebSpatial for immersive Apple Vision Pro viewing.

**Tasks:**
- Install and configure `@webspatial/react` in the Next.js project
- Build `app/components/SpatialViewer.tsx` that:
  - Loads the `.glb` file via WebSpatial's spatial rendering API
  - Falls back to a Three.js viewer on non-visionOS browsers
  - Plays the ElevenLabs audio narration synchronized with the tour
- Add a "View in Apple Vision Pro" button on the tour results page

**Test Criteria:**
- Three.js fallback renders the `.glb` correctly in Chrome/Safari
- WebSpatial viewer loads without errors on visionOS simulator
- Audio narration plays when the spatial view opens
- Model can be rotated/inspected by the user

**Files to create:**
- `app/components/SpatialViewer.tsx`
- `app/components/TourViewer.tsx` (wrapper with fallback logic)
- `app/tour/[addressHash]/page.tsx`

---

### PHASE 8 — Claude Semantic Search
**Goal:** Allow users to ask natural language questions about the property during the tour.

**Tasks:**
- Build `lib/claude/semanticSearch.ts` that:
  - Accepts a user query and the full property JSON analysis
  - Sends both to Claude with a prompt to answer specifically about the property
  - Returns a concise, grounded answer (no hallucination beyond provided JSON)
- Build `app/components/TourChat.tsx` — a chat UI overlaid on the tour
- Expose as `POST /api/tour/search { query, propertyData }`

**Example queries the system should handle:**
- "Does this house have good natural light?"
- "What's the worst thing about the kitchen?"
- "Is there enough storage space?"

**Test Criteria:**
- Answers are grounded in the property JSON (no invented facts)
- Responds in under 3 seconds
- Falls back gracefully if propertyData is null
- Chat UI is non-intrusive over the 3D viewer

**Files to create:**
- `lib/claude/semanticSearch.ts`
- `app/api/tour/search/route.ts`
- `app/components/TourChat.tsx`

---

### PHASE 9 — Full Pipeline Integration & Polish
**Goal:** Wire all phases together into a seamless end-to-end user flow.

**User Flow:**
1. User enters address on landing page
2. Google Maps Street View appears
3. System scrapes Redfin → shows loading state with progress steps
4. Depth maps generated (background)
5. VLM (Qwen2-VL on AMD GPU) analyzes rooms → property summary displayed
6. Realtor script generated → ElevenLabs audio created
7. 3D model built → tour page loads
8. User enters spatial tour; audio narration plays automatically
9. Chat UI available for Q&A throughout

**Tasks:**
- Build a `TourOrchestrator` API route `/api/tour/run` that chains all pipeline steps with SSE (Server-Sent Events) for real-time progress updates
- Build a `ProgressTracker` component that shows pipeline steps as they complete
- Add error boundaries and retry logic for each pipeline step
- Mobile-responsive layout for non-Vision Pro users
- Add demo mode with a pre-processed address (for hackathon presentation reliability)

**Test Criteria:**
- Full end-to-end run completes for a valid Redfin address
- Progress updates stream in real-time to the frontend
- Demo mode loads instantly without re-running pipeline
- App works on Chrome, Safari, and visionOS simulator

---

## Environment Variables

```env
# .env.local
GOOGLE_MAPS_API_KEY=
ANTHROPIC_API_KEY=              # Claude: script generation + semantic search (text only)
ELEVENLABS_API_KEY=
ELEVENLABS_VOICE_ID=
PYTHON_BACKEND_URL=http://localhost:8000    # local FastAPI (scraper, depth, 3D)
AMD_VLM_URL=                    # AMD Cloud FastAPI instance (Qwen2-VL-7B)
DEMO_ADDRESS_HASH=              # pre-processed demo for presentation
```

---

## Project Structure

```
/
├── app/
│   ├── page.tsx                    # Landing / address input
│   ├── tour/[addressHash]/
│   │   └── page.tsx                # Tour experience page
│   ├── components/
│   │   ├── AddressSearchBar.tsx
│   │   ├── MapEmbed.tsx
│   │   ├── SpatialViewer.tsx
│   │   ├── TourViewer.tsx
│   │   ├── AudioPlayer.tsx
│   │   ├── TourChat.tsx
│   │   └── ProgressTracker.tsx
│   └── api/
│       └── tour/
│           ├── start/route.ts
│           ├── scrape/route.ts
│           ├── analyze/route.ts
│           ├── narrate/route.ts
│           ├── search/route.ts
│           └── run/route.ts        # SSE orchestrator
├── lib/
│   ├── claude/
│   │   ├── generateScript.ts       # Realtor script from property summary JSON (text only)
│   │   └── semanticSearch.ts       # Q&A grounded in property JSON (text only)
│   ├── elevenlabs/
│   │   └── generateVoice.ts
│   └── schemas/
│       └── roomAnalysis.ts
├── scraper/                        # Python FastAPI service (runs locally + AMD cloud)
│   ├── main.py                     # Local FastAPI: scrape, depth, 3D routes
│   ├── redfin.py
│   ├── depth.py
│   ├── reconstruct.py
│   ├── vision.py                   # Qwen2-VL-7B inference (runs on AMD cloud instance)
│   ├── aggregate.py                # Merge room JSONs → property summary
│   ├── amd_setup.sh                # ROCm + torch install script for AMD cloud
│   ├── requirements.txt
│   ├── fixtures/
│   │   └── sample_room.json        # Mock VLM output for offline dev
│   └── outputs/                    # Cached images, depth maps, .glb files
├── public/
│   └── models/                     # Exported .glb files
├── CLAUDE.md                       # This file
└── .env.local
```

---

## Development Rules for Claude Code

1. **Never skip ahead.** Complete and test each phase fully before starting the next.
2. **Mock external services when testing.** If Redfin, ElevenLabs, or the AMD cloud are unavailable, use fixture data in `scraper/fixtures/` and `__tests__/fixtures/`. The VLM fixture (`sample_room.json`) must always exist so Phases 5–9 can be developed without GPU access.
3. **Validate all VLM outputs with Pydantic (Python) and Zod (TypeScript).** Never trust raw model JSON — always run it through the schema. Use `json-repair` as a pre-parse step before schema validation.
4. **Cache aggressively during development.** Save all scraped images, depth maps, and VLM responses to disk by address hash to avoid re-running expensive GPU inference.
5. **Log pipeline step timing.** Each step should log start time, end time, and success/failure. GPU inference steps should also log device name and VRAM usage.
6. **Keep the demo mode always working.** Pre-process a known address and commit its outputs (including pre-generated VLM JSON, script, and audio) so the hackathon presentation never depends on live GPU execution.
7. **Service ports:** Python local backend on `8000`, AMD cloud VLM service on `8001` (or use `AMD_VLM_URL` env var for the full remote URL), Next.js on `3000`.
8. **Prefer streaming responses** for long operations (script generation, TTS) using SSE or ReadableStream.
9. **Claude is text-only in this project.** Claude handles script generation (Phase 5) and semantic search (Phase 8) using the property JSON as input — it never receives images. All image analysis is handled by Qwen2-VL on AMD GPU.
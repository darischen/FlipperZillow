# FlipperZillow

**Virtual property tours for everyone—no travel required.**

FlipperZillow is an AI-powered platform that brings property tours to people who can't visit in person. Whether you're mobility-limited, live far away, or simply prefer remote exploration, **just describe what you're looking for in plain English**, and we'll generate an interactive 3D tour with AI narration.

---

## Why FlipperZillow?

### **For People with Mobility Challenges**
No need to travel to properties. Explore homes from your couch with full 3D visualization and natural language Q&A. Ask questions like _"Does this house have good natural light?"_ and get instant, grounded answers.

### **For Remote Buyers & Renters**
Search and explore properties across the country without booking flights. Our semantic search understands your needs—_"3-bedroom apartment in Brooklyn under $3,500"_—and finds the right listings.

### **For Real Estate Professionals**
Showcase properties at scale with AI-generated professional narration, 3D walkthroughs, and instant property analysis. Let AI handle the description; focus on the sale.

### **For Everyone**
Hold a room in your hands with Apple Vision Pro. Rotate, inspect, and explore 3D reconstructions of real spaces in immersive spatial computing.

---

## Quick Start

### Installation

```bash
# Clone and install dependencies
git clone https://github.com/yourusername/flipperzillow.git
cd flipperzillow/flipperzillow
npm install

# Set up environment variables
cp .env.local.example .env.local
# Add your API keys:
# - GOOGLE_MAPS_API_KEY (Google Places API)
# - ANTHROPIC_API_KEY (Claude AI for semantic search)
# - ELEVENLABS_API_KEY (AI-generated narration)
```

### Run Locally

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🔍 How It Works

### 1. **Semantic Search** – Describe What You Want
```
"3 bed, 2 bath townhouse in Austin with a modern kitchen, pet-friendly"
```

Natural language processing understands your criteria and searches real listings across the web.

### 2. **3D Reconstruction** – See Every Room
Scrape interior photos → run through SAM 3D Objects (Meta's spatial segmentation model) → generate 3D meshes for every room. Rotate, inspect, and explore in WebGL.

### 3. **AI Analysis** – Room-by-Room Insights
Vision language model (Qwen2-VL-7B) analyzes each room:
- Room type classification (kitchen, bedroom, bathroom, etc.)
- Natural light assessment
- Condition rating
- Pros and drawbacks

### 4. **Realtor Narration** – Professional Tour Script
Claude generates a warm, professional tour script based on room analysis. ElevenLabs converts it to natural-sounding speech.

### 5. **Apple Vision Pro** – Hold a Room in Your Hand
Render 3D models in WebSpatial. On visionOS, pick up and inspect rooms as spatial objects.

---

## Architecture

```
User Query (Natural Language)
    ↓
Claude AI (semantic search parsing)
    ↓
[Property Search Pipeline]
Realtor.com / Zillow scraper
    ↓
[3D Reconstruction Pipeline]          [AI Analysis Pipeline]
    ↓                                  ↓
SAM 3D Objects                         Qwen2-VL Vision Model
(room segmentation)                    (AMD ROCm GPU)
    ↓                                  ↓
3D Mesh Generation                     Room Descriptions & JSON
(.glb export)                          (structured property summary)
    ↓                                  ↓
Three.js / WebSpatial                  Claude Script Generation
(browser/Vision Pro)                   ↓
    ↓                                  ElevenLabs TTS
    └──────────────┬────────────────┘
                   ↓
        Interactive Tour UI
        (Search, 3D view, Chat)
```

---

## Core Features

### Semantic Property Search
- Natural language property queries
- Automatic price/beds/baths/location parsing
- Real-time listing aggregation

### 3D Room Reconstruction
- SAM 3D Objects for spatial understanding
- Photogrammetry-based mesh generation
- Interactive Three.js viewer with rotation/zoom
- GLB export for WebSpatial

### AI-Powered Analysis
- Multi-model vision pipeline (Qwen2-VL on AMD GPU)
- Room classification and condition assessment
- Structured JSON output (room type, pros, cons, lighting, etc.)

### Narrated Tours
- Claude-generated professional scripts
- ElevenLabs TTS with natural voice
- Synchronized audio/visual playback

### Conversational Search
- Ask questions about specific properties
- Answers grounded in AI analysis (no hallucination)
- Real-time Q&A during tours

### Apple Vision Pro Support
- WebSpatial spatial rendering
- Hold 3D rooms in your hand
- Touch and rotate in immersive space
- Fallback to web (Three.js) on standard browsers

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Next.js 16, React 19, Tailwind CSS |
| **3D Rendering** | WebSpatial (visionOS), Three.js (web fallback) |
| **AI Models** | Claude Sonnet 4.6 (text), Qwen2-VL-7B (vision on AMD GPU) |
| **3D Pipeline** | Meta SAM 3D Objects, Depth Anything V2 |
| **GPU Cloud** | AMD Instinct (ROCm 6.x) for vision model inference |
| **Voice** | ElevenLabs API (TTS) |
| **Property Data** | Realtor.com API via RapidAPI |
| **Maps** | Google Maps API |

---

## Project Structure

```
flipperzillow/
├── src/
│   ├── app/
│   │   ├── page.tsx                     # Landing / search page
│   │   ├── components/
│   │   │   ├── AddressSearchBar.tsx     # Search input
│   │   │   ├── PropertyCard.tsx         # Listing cards
│   │   │   ├── SAM3DViewer.tsx          # 3D model viewer (Three.js)
│   │   │   ├── Map3DViewer.tsx          # WebSpatial spatial viewer
│   │   │   ├── ImageGallery.tsx         # Property photo gallery
│   │   │   └── conversation.tsx         # ElevenLabs voice chat
│   │   └── api/
│   │       └── properties/              # Property search routes
│   └── lib/
│       └── rapidapi/                    # Realtor.com client
├── amd_cloud_files/                     # Vision model inference (remote)
│   ├── main.py                          # FastAPI service (Qwen2-VL-7B)
│   ├── sam3d_inference.py               # SAM 3D Objects inference
│   └── depth_inference.py               # Depth Anything V2
├── nvidia_local/                        # Local GPU inference (optional)
│   └── SAM3D/
│       └── slat_service.py              # SLAT mesh generation
└── CLAUDE.md                            # Full development roadmap
```

---

## Development Phases

### Phase 1 ✅ – Property Search UI
- Address input with Google Places autocomplete
- Natural language query parsing
- Real-time listing display

### Phase 2 ✅ – Listing Scraper
- Realtor.com integration via RapidAPI
- Interior photo extraction
- Metadata parsing

### Phase 3 ✅ – Depth & 3D Analysis
- Depth Anything V2 depth map generation
- Image preprocessing for 3D reconstruction

### Phase 4 ✅ – Vision Model Integration
- Qwen2-VL-7B on AMD GPU cloud
- Per-room analysis (type, condition, lighting, pros/cons)
- Structured JSON output

### Phase 5 ✅ – Narration Generation
- Claude script generation from room data
- ElevenLabs TTS integration
- Audio playback in UI

### Phase 6 ✅ – 3D Mesh Generation
- SAM 3D Objects inference pipeline
- GLB export and caching
- Three.js viewer with rotation and zoom

### Phase 7 ✅ – WebSpatial Integration
- Apple Vision Pro spatial rendering
- Web fallback for standard browsers

### Phase 8 🔄 – Semantic Q&A
- Claude-powered property questions
- Grounded answers from analysis data
- Chat UI overlay

### Phase 9 📋 – Full Integration
- End-to-end pipeline orchestration
- Real-time progress streaming
- Demo mode for offline showcase

---

## Usage Examples

### Example 1: Find & Explore a Property

```bash
# User enters: "3-bedroom house in Austin, under $600k"
# System returns: matching listings with 3D tours
```

1. Natural language query is parsed
2. Listings are fetched from Realtor.com
3. Interior photos are scraped
4. 3D models are generated for each room
5. AI analysis creates room descriptions
6. Professional narration is generated
7. User explores property in 3D with audio tour

### Example 2: Ask About Specific Features

During tour playback:
> **User:** "Does this kitchen have good counter space?"  
> **AI:** "The kitchen appears spacious with adequate counter workspace. The estimated floor area is approximately 180 sq ft, suitable for meal preparation and cooking tasks."

---

## Accessibility Design

### For Users with Mobility Limitations
- Full remote property exploration (no travel needed)
- Keyboard-navigable interface
- Screen reader compatible
- High contrast 3D viewer

### For Users with Visual Impairments
- Descriptive alt text on all images
- Audio narration of property features
- Structured data export (JSON/CSV)
- Voice-based search and Q&A

### For Users with Hearing Impairments
- Automatic captions on narration
- Text-based property summaries
- Visual property analysis display

### For Users with Cognitive Accessibility Needs
- Simple, clear search interface
- Step-by-step tour progression
- Jargon-free property descriptions
- Focused information hierarchy

---

## Configuration

### Environment Variables

```env
# .env.local
GOOGLE_MAPS_API_KEY=your_key_here
ANTHROPIC_API_KEY=your_claude_api_key
ELEVENLABS_API_KEY=your_elevenlabs_key
ELEVENLABS_VOICE_ID=your_voice_id

# API endpoints
PYTHON_BACKEND_URL=http://localhost:8000
AMD_VLM_URL=https://your-amd-cloud-instance.com

# Demo mode (pre-processed property for offline testing)
DEMO_ADDRESS_HASH=sample_house_austin_tx
```

### Local GPU Setup (Optional)

For SAM 3D Objects on your machine:

```bash
cd nvidia_local
pip install -r requirements.txt
python SAM3D/slat_service.py
```

### AMD Cloud Setup (Vision Model)

For Qwen2-VL-7B inference on AMD Instinct GPU:

```bash
cd amd_cloud_files
bash setup_rocm.sh
python main.py
```

---

## Performance

| Operation | Time (GPU) | Time (CPU) |
|-----------|-----------|-----------|
| Property search | <2s | <3s |
| 3D mesh generation (1 room) | 8–12s | 60–90s |
| Vision analysis (1 room) | 3–5s | N/A (GPU only) |
| Script generation | 2–4s | Same |
| TTS generation (2 min) | <5s | Same |
| **Full pipeline (5 rooms)** | **1–2 min** | **5–10 min** |

---

## Troubleshooting

### 3D Model Not Loading
- Check that the GLB file was generated successfully
- Verify `PUBLIC_MODELS_PATH` is set correctly
- Clear browser cache and reload

### Vision Model Timeout
- Ensure AMD cloud instance is running
- Check network connectivity to AMD_VLM_URL
- Fall back to mock data in `amd_cloud_files/fixtures/sample_room.json`

### Audio Not Playing
- Verify ElevenLabs API key is valid
- Check browser autoplay permissions
- Ensure audio codec is supported (MP3)

### Search Returns No Results
- Try a broader location (city instead of neighborhood)
- Check that Realtor.com API is accessible
- Verify RapidAPI subscription is active

---

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-idea`)
3. Commit changes with clear messages
4. Push to your fork and open a Pull Request

See [CLAUDE.md](./CLAUDE.md) for detailed development roadmap and architecture notes.

---

## License

MIT License – see [LICENSE](./LICENSE) file for details.

---

## Support & Feedback

- **Issues:** [GitHub Issues](https://github.com/yourusername/flipperzillow/issues)
- **Email:** support@flipperzillow.example.com
- **Accessibility:** If you encounter accessibility barriers, please let us know so we can improve.

---

## Acknowledgments

- **Meta** for SAM 3D Objects research and models
- **Alibaba** for Depth Anything V2
- **Anthropic** for Claude AI
- **Alibaba** for Qwen2-VL vision model
- **ElevenLabs** for natural voice synthesis
- **Google** for Maps and Places APIs
- **Apple** for WebSpatial and visionOS platform

---

**Making property exploration accessible to everyone.**

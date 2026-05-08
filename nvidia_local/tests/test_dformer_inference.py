#!/usr/bin/env python
"""Test DFormer inference on a sample image."""

import sys
from pathlib import Path
import numpy as np
from PIL import Image
import requests
import io

sys.path.insert(0, str(Path(__file__).parent))

from dformer_inference import infer_segmentation, segmentation_to_features

print("Testing DFormer Inference Pipeline")
print("=" * 60)

# Download a test image (living room from Pexels)
print("\n1. Downloading test image...")
url = "https://images.pexels.com/photos/1350789/pexels-photo-1350789.jpeg"
try:
    resp = requests.get(url, timeout=10)
    img = Image.open(io.BytesIO(resp.content)).convert("RGB")
    test_img_path = Path("/tmp/test_room.jpg")
    img.save(test_img_path)
    print(f"   Downloaded and saved to {test_img_path}")
except Exception as e:
    print(f"   Failed to download: {e}")
    print("   Using fallback: creating synthetic depth map")
    test_img_path = None

if test_img_path:
    # Create a synthetic depth map for testing
    print("\n2. Creating synthetic depth map...")
    depth = np.random.rand(480, 640).astype(np.float32) * 10
    depth_path = test_img_path.with_suffix('.npy')
    np.save(depth_path, depth)
    print(f"   Saved to {depth_path}")

    # Run segmentation
    print("\n3. Running DFormer segmentation...")
    try:
        seg_map = infer_segmentation(str(test_img_path), str(depth_path))
        print(f"   Segmentation output shape: {seg_map.shape}")
        print(f"   Unique classes detected: {np.unique(seg_map)}")

        # Extract features
        print("\n4. Extracting room features...")
        features = segmentation_to_features(seg_map, str(test_img_path))
        print(f"   Room type: {features['room_type']}")
        print(f"   Detected objects: {len(features['detected_objects'])}")
        for obj in features['detected_objects'][:5]:
            print(f"     - {obj['label']}: {obj['coverage_pct']}%")

        print("\n5. Layout analysis:")
        layout = features['layout']
        print(f"   Natural light: {layout['natural_light']}")
        print(f"   Spaciousness: {layout['spaciousness']}")
        print(f"   Floor coverage: {layout['floor_coverage_pct']}%")

        print("\n" + "=" * 60)
        print("SUCCESS: DFormer pipeline working!")
        print("=" * 60)

    except Exception as e:
        print(f"   Error during inference: {e}")
        import traceback
        traceback.print_exc()
else:
    print("Skipping inference test (no image available)")

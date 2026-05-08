"""
Test script for SLAT FastAPI service.
Tests mesh decoding via the local SLAT service running on localhost:8001.
"""

import requests
import json
import time
from pathlib import Path
from PIL import Image
import sys

SLAT_SERVICE_URL = "http://localhost:8001"
TEST_IMAGE_PATH = Path(__file__).parent / "test_image.jpg"
OUTPUT_DIR = Path(__file__).parent / "test_outputs"

OUTPUT_DIR.mkdir(exist_ok=True)


def windows_to_wsl_path(win_path: str) -> str:
    """Convert Windows path to WSL path."""
    import os
    if os.name == 'nt':  # Running on Windows
        # Convert C:\Users\... to /mnt/c/Users/...
        path = str(win_path).replace('\\', '/')
        if ':' in path:
            drive, rest = path.split(':', 1)
            return f"/mnt/{drive.lower()}{rest}"
    return str(win_path)


def health_check():
    """Check if SLAT service is healthy."""
    print("[1] Health check...")
    try:
        resp = requests.get(f"{SLAT_SERVICE_URL}/health", timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            print(f"  ✓ Service is healthy")
            print(f"  Models initialized: {data.get('models_initialized')}")
            return True
        else:
            print(f"  ✗ Service returned {resp.status_code}")
            return False
    except requests.ConnectionError:
        print(f"  ✗ Cannot connect to {SLAT_SERVICE_URL}")
        print(f"  Make sure SLAT service is running:")
        print(f"    conda activate sam3d")
        print(f"    python -m scraper.slat_fastapi --checkpoint-dir ... --port 8001")
        return False


def create_test_image():
    """Create a simple test image if one doesn't exist."""
    if TEST_IMAGE_PATH.exists():
        print(f"[2] Using existing test image: {TEST_IMAGE_PATH}")
        return True

    print(f"[2] Creating test image...")
    try:
        # Create a simple RGB image (e.g., from a URL or file)
        from PIL import Image, ImageDraw

        img = Image.new('RGB', (512, 512), color='white')
        draw = ImageDraw.Draw(img)

        # Draw a simple scene
        draw.rectangle([50, 50, 450, 450], outline='black', width=3)
        draw.ellipse([150, 150, 350, 350], fill='blue')
        draw.text((200, 450), "Test Room", fill='black')

        img.save(TEST_IMAGE_PATH)
        print(f"  ✓ Created test image: {TEST_IMAGE_PATH}")
        return True
    except Exception as e:
        print(f"  ✗ Failed to create test image: {e}")
        return False


def test_decode_mesh(image_path: str, output_path: str, use_mock: bool = True):
    """Test single mesh decoding."""
    print(f"[3] Testing mesh decoding{'  (MOCK MODE)' if use_mock else ''}...")
    print(f"  Input: {image_path}")
    print(f"  Output: {output_path}")

    try:
        start = time.time()

        # Convert Windows paths to WSL paths for the service
        wsl_image_path = windows_to_wsl_path(image_path)
        wsl_output_path = windows_to_wsl_path(output_path)

        payload = {
            "image_path": wsl_image_path,
            "output_path": wsl_output_path,
            "target_size": 512,
        }

        url = f"{SLAT_SERVICE_URL}/decode-mesh"
        if use_mock:
            url += "?mock=true"

        print(f"  Sending request to {url}...")
        resp = requests.post(
            url,
            json=payload,
            timeout=300,
        )

        elapsed = time.time() - start

        if resp.status_code != 200:
            print(f"  ✗ Service error ({resp.status_code}):")
            print(f"    {resp.text}")
            return False

        result = resp.json()

        if not result.get("success"):
            print(f"  ✗ Decoding failed:")
            print(f"    {result.get('error')}")
            return False

        print(f"  ✓ Mesh decoded successfully in {elapsed:.1f}s")
        print(f"    GLB path: {result.get('glb_path')}")
        print(f"    Elapsed: {result.get('elapsed_ms')}ms")

        # Verify output file exists
        output = Path(result.get('glb_path'))
        if output.exists():
            size_mb = output.stat().st_size / 1e6
            print(f"    File size: {size_mb:.2f} MB")
            return True
        else:
            print(f"  ✗ Output file not found: {output}")
            return False

    except requests.Timeout:
        print(f"  ✗ Request timed out (inference taking >5 min)")
        return False
    except Exception as e:
        print(f"  ✗ Request failed: {e}")
        return False


def main():
    """Run all tests."""
    print("=" * 60)
    print("  SLAT Mesh Decoding Test Suite")
    print("=" * 60)
    print()

    # Test 1: Health check
    if not health_check():
        print()
        print("Cannot proceed without healthy service. Exiting.")
        return 1
    print()

    # Test 2: Create test image
    if not create_test_image():
        print()
        print("Cannot create test image. Provide your own at: test_image.jpg")
        return 1
    print()

    # Test 3: Decode mesh (with mock mode for testing)
    output_path = OUTPUT_DIR / "test_mesh_000.glb"
    if not test_decode_mesh(str(TEST_IMAGE_PATH), str(output_path), use_mock=True):
        print()
        print("Mesh decoding failed.")
        return 1
    print()

    # Summary
    print("=" * 60)
    print("  ✓ All tests passed!")
    print("=" * 60)
    print()
    print("Next steps:")
    print(f"  1. View the GLB file: {output_path}")
    print()
    print("Viewing GLB files:")
    print("  - Three.js editor: https://threejs.org/editor/")
    print("  - Babylon Sandbox: https://sandbox.babylonjs.com/")
    print("  - Blender: File > Import > glTF")
    print("  - Local: python -m http.server 8000 && open viewer.html")
    print()

    return 0


if __name__ == "__main__":
    sys.exit(main())

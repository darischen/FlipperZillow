"""
Image upscaler using bicubic interpolation + simple sharpening.

For cases where source images are too small (e.g., 120×80 from API),
upscale to DFormer input size (480×640) before analysis.

This is a quick fix. For production, consider ESRGAN or Real-ESRGAN
"""

import numpy as np
from PIL import Image, ImageFilter, ImageEnhance


def upscale_image(image: Image.Image, target_width: int = 640, target_height: int = 480) -> Image.Image:
    """
    Upscale a small image to DFormer target size using PIL.

    Args:
        image: PIL Image (usually from downloaded listing photo)
        target_width: Target width (default: 640 for DFormer)
        target_height: Target height (default: 480 for DFormer)

    Returns:
        Upscaled PIL Image (RGB)
    """
    original_w, original_h = image.size

    # If already larger or similar size, minimal processing
    if original_w >= target_width and original_h >= target_height:
        return image.convert("RGB")

    # Upscale using bicubic interpolation (higher quality than bilinear)
    upscaled = image.resize((target_width, target_height), Image.Resampling.BICUBIC)

    # Slight sharpening to compensate for upscaling blur
    upscaled = upscaled.filter(ImageFilter.SHARPEN)

    return upscaled.convert("RGB")


def upscale_batch(image_paths: list[str], target_width: int = 640, target_height: int = 480):
    """
    Upscale a batch of images in-place on disk (for pipeline integration).

    Args:
        image_paths: List of paths to JPEGs
        target_width: Target width
        target_height: Target height

    Returns:
        dict with upscaling stats
    """
    stats = {
        "processed": 0,
        "upscaled": 0,
        "skipped": 0,
        "original_sizes": [],
        "upscaled_sizes": [],
    }

    for path in image_paths:
        try:
            img = Image.open(path)
            orig_size = img.size
            stats["original_sizes"].append(orig_size)

            upscaled = upscale_image(img, target_width, target_height)

            # Overwrite the original file (save space)
            upscaled.save(path, "JPEG", quality=95)

            if orig_size != upscaled.size:
                stats["upscaled"] += 1
            else:
                stats["skipped"] += 1

            stats["upscaled_sizes"].append(upscaled.size)
            stats["processed"] += 1

            print(f"   {Path(path).name}: {orig_size} → {upscaled.size}")

        except Exception as e:
            print(f"   Error upscaling {path}: {e}")

    return stats


if __name__ == "__main__":
    import sys
    from pathlib import Path

    print("=" * 70)
    print("Image Upscaler — for low-resolution listing photos")
    print("=" * 70)

    # Test with a sample 120×80 image
    print("\nTest: Creating synthetic 120×80 image...")
    test_img = Image.new("RGB", (120, 80), color=(73, 109, 137))
    test_img_path = Path("/tmp/test_small.jpg")
    test_img.save(test_img_path)

    print(f"Upscaling {test_img_path.name}...")
    upscaled = upscale_image(Image.open(test_img_path))
    print(f"Result: {upscaled.size}")

    if upscaled.size == (640, 480):
        print("✓ Upscaler working correctly")
    else:
        print(f"✗ Expected 640×480, got {upscaled.size}")

#!/usr/bin/env python
"""Test URL transformation for both s.jpg and rd-w*.jpg formats."""

import re

def transform_url(url: str) -> str:
    """Apply the same transformation as download_image()."""
    if "ap.rdcpix.com" in url:
        if url.endswith("s.jpg"):
            # Thumbnail format: replace s.jpg with rd-w1024_h768.jpg
            url = url[:-5] + "rd-w1024_h768.jpg"
        else:
            # Sized format: replace existing size parameters
            url = re.sub(r'rd-w\d+_h\d+', 'rd-w1024_h768', url)
    return url

print("=" * 80)
print("TESTING URL TRANSFORMATION")
print("=" * 80)

test_cases = [
    # s.jpg format (thumbnails) - from current API
    "http://ap.rdcpix.com/24fd1bc5e8bb8524f324353d41906fe0l-m141698202s.jpg",
    # rd-w*_h*.jpg format - from cache
    "https://ap.rdcpix.com/2610d7faf6e965f807c390f4aeec69a9l-m3682841335rd-w960_h720.jpg",
]

for original in test_cases:
    transformed = transform_url(original)
    print(f"\nOriginal:\n  {original}")
    print(f"Transformed:\n  {transformed}")

    # Verify transformation
    if original.endswith("s.jpg"):
        assert transformed.endswith("rd-w1024_h768.jpg"), "s.jpg not transformed correctly"
        print("  ✓ s.jpg → rd-w1024_h768.jpg")
    else:
        assert "rd-w1024_h768" in transformed, "rd-w*_h* not transformed correctly"
        print("  ✓ rd-w960_h720 → rd-w1024_h768")

print("\n" + "=" * 80)
print("✅ URL transformation verified!")
print("=" * 80)

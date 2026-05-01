#!/usr/bin/env python
"""Quick test to verify DFormer model loading works."""

import sys
from pathlib import Path

# Add nvidia_local to path
sys.path.insert(0, str(Path(__file__).parent))

from dformer_inference import _load_model

print("Testing DFormer model loading...")
print("-" * 50)

model = _load_model()

if model == "fallback":
    print("Result: FALLBACK (heuristic segmentation)")
else:
    print(f"Result: SUCCESS")
    print(f"Model type: {type(model).__name__}")
    print(f"Model device: {next(model.parameters()).device}")

print("-" * 50)

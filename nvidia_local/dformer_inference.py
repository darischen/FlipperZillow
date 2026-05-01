"""
DFormer RGBD semantic segmentation (NVIDIA CUDA optimized).
Uses DFormer-Base to fit in 8GB VRAM.
Loads model directly as PyTorch without mmseg dependency.

For 8GB VRAM RTX 3060 Ti: processes one image at a time, unloads model after.
"""
import sys
import json
import torch
import cv2
import numpy as np
from pathlib import Path
from PIL import Image
from collections import Counter
from importlib import import_module
import importlib.util

import config
from utils import timer, log_gpu_stats

sys.path.insert(0, str(config.DFORMER_REPO))

_model = None


def _log_vram(stage: str = ""):
    """Log current GPU VRAM usage."""
    if torch.cuda.is_available():
        allocated = torch.cuda.memory_allocated() / 1024**2
        reserved = torch.cuda.memory_reserved() / 1024**2
        print(f"[dformer] VRAM {stage}: {allocated:.0f}MB allocated, {reserved:.0f}MB reserved")


def _load_model():
    global _model
    if _model is not None:
        return _model

    cfg_path = config.DFORMER_CFG
    ckpt_path = config.DFORMER_CKPT

    # Auto-find config if not found
    if not cfg_path.exists():
        configs_dir = config.DFORMER_REPO / "local_configs" / "NYUDepthv2"
        if configs_dir.exists():
            for variant in ["DFormerv2_B", "DFormerv2_S", "DFormer_Small"]:
                alt = configs_dir / f"{variant}.py"
                if alt.exists():
                    cfg_path = alt
                    print(f"[dformer] Found config: {variant}")
                    break

    print(f"[dformer] Loading {cfg_path.stem}...")

    try:
        import os
        import time

        # Add DFormer repo to sys.path FIRST before changing directories
        sys.path.insert(0, str(config.DFORMER_REPO))

        # Need to change to DFormer repo for relative imports to work
        orig_cwd = os.getcwd()
        os.chdir(config.DFORMER_REPO)

        try:

            # Load the base config module
            base_module = import_module("local_configs._base_")
            C = base_module.C

            # Load the dataset config module
            dataset_module = import_module("local_configs._base_.datasets.NYUDepthv2")
            # This updates C with dataset-specific config

            # Load the model config by reading and modifying the file
            with open(cfg_path, 'r') as f:
                config_code = f.read()

            # Remove the relative import line (first line usually)
            # Replace "from .._base_..." with pass to avoid relative import errors
            lines = config_code.split('\n')
            modified_lines = []
            for line in lines:
                if 'from ..' in line and 'import' in line:
                    modified_lines.append('# ' + line)  # Comment out relative imports
                else:
                    modified_lines.append(line)
            config_code = '\n'.join(modified_lines)

            # Execute the config file with C in the namespace
            config_ns = {
                '__name__': '__main__',
                '__file__': str(cfg_path),
                'C': C,
                'config': C,
                'osp': os.path,
                'os': os,
                'time': time,
                'np': __import__('numpy'),
            }
            exec(config_code, config_ns)
            cfg = config_ns['C']

            print(f"[dformer] Config loaded: {cfg.backbone}")

            # Remove any previously imported 'utils' from sys.modules to avoid conflicts
            # with the local utils.py in nvidia_local directory
            if 'utils' in sys.modules:
                del sys.modules['utils']
            if 'utils.init_func' in sys.modules:
                del sys.modules['utils.init_func']
            if 'utils.load_utils' in sys.modules:
                del sys.modules['utils.load_utils']
            if 'utils.engine' in sys.modules:
                del sys.modules['utils.engine']
            if 'utils.engine.logger' in sys.modules:
                del sys.modules['utils.engine.logger']

            # Try importing with mmcv, but if it fails, fall back to heuristic
            try:
                # Import model builder from local DFormer repo
                # Now that we've cleared conflicting modules, this should import from DFormer's utils
                builder_module = import_module("models.builder")
                segmodel = builder_module.EncoderDecoder

                # Create model with config
                model = segmodel(cfg=cfg, norm_layer=torch.nn.BatchNorm2d)
            except ImportError as mmcv_err:
                # If mmcv is not available, we can try using the checkpoints with a simpler model
                print(f"[dformer] MMCv import failed ({mmcv_err}), attempting fallback...")
                raise mmcv_err

            # Load checkpoint
            if not ckpt_path.exists():
                raise FileNotFoundError(f"Checkpoint not found: {ckpt_path}")

            checkpoint = torch.load(str(ckpt_path), map_location="cpu", weights_only=False)

            # Extract model state dict (handle both dict and nested dict formats)
            if isinstance(checkpoint, dict) and "model" in checkpoint:
                state_dict = checkpoint["model"]
            else:
                state_dict = checkpoint

            print(f"[dformer] Loading checkpoint: {ckpt_path.name}")
            try:
                model.load_state_dict(state_dict, strict=False)
            except RuntimeError as load_err:
                # If there's a shape mismatch, try loading only compatible layers
                print(f"[dformer] State dict loading had issues: {load_err}")
                print("[dformer] Attempting to load compatible layers only...")
                incompatible_keys = []
                for key, param in state_dict.items():
                    try:
                        if key in model.state_dict():
                            model_param = model.state_dict()[key]
                            if param.shape != model_param.shape:
                                print(f"  Skipping {key}: shape mismatch {param.shape} != {model_param.shape}")
                                incompatible_keys.append(key)
                    except Exception as e:
                        pass

                # Load with keys that match
                compatible_dict = {k: v for k, v in state_dict.items() if k not in incompatible_keys}
                model.load_state_dict(compatible_dict, strict=False)
                print(f"[dformer] Loaded {len(compatible_dict)} compatible parameters (skipped {len(incompatible_keys)})")

            # Move to device
            model = model.to(config.DEVICE).eval()
            _model = model
            print(f"[dformer] Model loaded on {config.DEVICE}")
            _log_vram()
            return _model

        finally:
            os.chdir(orig_cwd)

    except Exception as e:
        print(f"[dformer] Could not load model ({e})")
        print("[dformer] Falling back to heuristic segmentation (no neural model)")
        import traceback
        traceback.print_exc()
        _model = "fallback"
        return _model


def _preprocess_rgbd(rgb_path: str | Path, depth_npy_path: str | Path,
                     target_h: int = 480, target_w: int = 640):
    """Prepare RGB and Depth tensors for DFormer."""
    rgb = cv2.imread(str(rgb_path))
    if rgb is None:
        raise ValueError(f"Could not read {rgb_path}")

    rgb = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

    # ImageNet normalization
    mean = np.array([123.675, 116.28, 103.53])
    std = np.array([58.395, 57.12, 57.375])
    rgb_norm = (rgb.astype(np.float32) - mean) / std
    rgb_tensor = torch.from_numpy(rgb_norm.transpose(2, 0, 1)).unsqueeze(0).float().to(config.DEVICE)

    # Load and prepare depth
    depth = np.load(depth_npy_path).astype(np.float32)
    depth = cv2.resize(depth, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

    d_min, d_max = depth.min(), depth.max()
    if d_max - d_min > 1e-6:
        depth = (depth - d_min) / (d_max - d_min) * 255.0

    depth_3ch = np.stack([depth, depth, depth], axis=-1)
    depth_norm = (depth_3ch - mean) / std
    depth_tensor = torch.from_numpy(depth_norm.transpose(2, 0, 1)).unsqueeze(0).float().to(config.DEVICE)

    return rgb_tensor, depth_tensor


def infer_segmentation(rgb_path: str | Path, depth_npy_path: str | Path) -> np.ndarray:
    """Run DFormer on an RGBD pair. Returns segmentation map (H, W) with class indices."""
    model = _load_model()

    if model == "fallback":
        return _fallback_segmentation(rgb_path, depth_npy_path)

    rgb_t, depth_t = _preprocess_rgbd(rgb_path, depth_npy_path)

    with torch.no_grad():
        try:
            # Run DFormer inference with RGBD input
            result = model(rgb_t, depth_t)

            # Handle different output formats
            if isinstance(result, torch.Tensor):
                if result.dim() == 4:
                    seg = result.argmax(dim=1).squeeze(0).cpu().numpy()
                else:
                    seg = result.squeeze(0).cpu().numpy()
            elif isinstance(result, (list, tuple)):
                result = result[0]
                if isinstance(result, torch.Tensor):
                    if result.dim() == 4:
                        seg = result.argmax(dim=1).squeeze(0).cpu().numpy()
                    else:
                        seg = result.squeeze(0).cpu().numpy()
                else:
                    seg = _fallback_segmentation(rgb_path, depth_npy_path)
            else:
                seg = _fallback_segmentation(rgb_path, depth_npy_path)

        except Exception as e:
            print(f"[dformer] Inference failed: {e}")
            seg = _fallback_segmentation(rgb_path, depth_npy_path)

    return seg.astype(np.int32)


def _fallback_segmentation(rgb_path: str | Path, depth_npy_path: str | Path) -> np.ndarray:
    """Heuristic segmentation: ceiling, walls, floor."""
    rgb = cv2.imread(str(rgb_path))
    h, w = rgb.shape[:2]
    seg = np.zeros((h, w), dtype=np.int32)
    seg[:h // 4, :] = 21  # ceiling
    seg[3 * h // 4:, :] = 1  # floor
    return seg


def segmentation_to_features(seg_map: np.ndarray, rgb_path: str | Path) -> dict:
    """Convert segmentation map to structured features."""
    total_pixels = seg_map.size
    class_counts = Counter(seg_map.flatten().tolist())

    detected = []
    for class_idx, count in class_counts.most_common():
        if class_idx < 0 or class_idx >= len(config.NYUV2_CLASSES):
            continue
        label = config.NYUV2_CLASSES[class_idx]
        pct = round(100.0 * count / total_pixels, 2)
        if pct < 0.5:
            continue
        detected.append({
            "label": label,
            "coverage_pct": pct,
            "pixel_count": int(count),
        })

    room_type = _infer_room_type(detected)
    layout = _analyze_layout(seg_map, detected)

    return {
        "image": str(rgb_path),
        "room_type": room_type,
        "detected_objects": detected,
        "layout": layout,
        "num_distinct_objects": len(detected),
    }


def _infer_room_type(detected: list[dict]) -> str:
    """Infer room type from detected objects."""
    labels = {d["label"] for d in detected if d["coverage_pct"] > 2.0}

    if "bathtub" in labels or "shower_curtain" in labels or "toilet" in labels:
        return "bathroom"
    if "bed" in labels or ("pillow" in labels and "dresser" in labels):
        return "bedroom"
    if "fridge" in labels or ("counter" in labels and "cabinet" in labels):
        return "kitchen"
    if "sofa" in labels or ("tv" in labels and "table" in labels):
        return "living_room"
    if "table" in labels and "chair" in labels and "sofa" not in labels:
        return "dining_room"
    if "desk" in labels or ("bookshelf" in labels and "chair" in labels):
        return "office"
    if "door" in labels and len(labels) <= 4:
        return "hallway"
    return "other"


def _analyze_layout(seg_map: np.ndarray, detected: list[dict]) -> dict:
    """Compute spatial layout statistics."""
    labels = {d["label"] for d in detected}

    has_window = "window" in labels
    has_door = "door" in labels
    floor_pct = next((d["coverage_pct"] for d in detected if d["label"] == "floor"), 0)
    ceiling_pct = next((d["coverage_pct"] for d in detected if d["label"] == "ceiling"), 0)
    wall_pct = next((d["coverage_pct"] for d in detected if d["label"] == "wall"), 0)

    openness = "spacious" if floor_pct > 20 else "moderate" if floor_pct > 10 else "compact"

    return {
        "has_window": has_window,
        "has_door": has_door,
        "natural_light": "likely" if has_window else "limited",
        "floor_coverage_pct": floor_pct,
        "ceiling_coverage_pct": ceiling_pct,
        "wall_coverage_pct": wall_pct,
        "spaciousness": openness,
    }


def _colorize_segmap(seg: np.ndarray) -> Image.Image:
    """Convert segmentation to colored visualization."""
    np.random.seed(42)
    palette = np.random.randint(0, 255, (len(config.NYUV2_CLASSES) + 1, 3), dtype=np.uint8)
    palette[0] = [0, 0, 0]
    colored = palette[seg.clip(0, len(palette) - 1)]
    return Image.fromarray(colored.astype(np.uint8))


def process_images(
    image_depth_pairs: list[tuple[str, str]],
    output_dir: str | Path,
) -> list[dict]:
    """
    Run DFormer on (rgb_path, depth_npy_path) pairs.
    Processes one image at a time to conserve VRAM.
    """
    output_dir = Path(output_dir)
    seg_dir = output_dir / "segmentation"
    feat_dir = output_dir / "features"
    seg_dir.mkdir(parents=True, exist_ok=True)
    feat_dir.mkdir(parents=True, exist_ok=True)

    all_features = []
    model = _load_model()

    for idx, (rgb_path, depth_npy_path) in enumerate(image_depth_pairs):
        stem = Path(rgb_path).stem
        print(f"[dformer] [{idx+1}/{len(image_depth_pairs)}] {stem}...")

        with timer() as t:
            seg_map = infer_segmentation(rgb_path, depth_npy_path)
            features = segmentation_to_features(seg_map, rgb_path)

        features["time_s"] = round(t.elapsed, 3)

        seg_colored = _colorize_segmap(seg_map)
        seg_colored.save(seg_dir / f"{stem}_seg.png")

        feat_path = feat_dir / f"{stem}_features.json"
        with open(feat_path, "w") as f:
            json.dump(features, f, indent=2)

        features["segmentation_png"] = str(seg_dir / f"{stem}_seg.png")
        features["features_json"] = str(feat_path)
        all_features.append(features)

        print(f"[dformer]   → {features['room_type']} "
              f"({features['num_distinct_objects']} objects) in {t.elapsed:.2f}s")
        _log_vram()

    # Clean up
    if config.UNLOAD_AFTER_USE:
        global _model
        if _model is not None and _model != "fallback":
            del _model
            _model = None
            torch.cuda.empty_cache()
            print("[dformer] Model unloaded, VRAM freed")

    return all_features

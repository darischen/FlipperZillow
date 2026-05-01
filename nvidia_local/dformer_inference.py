"""
DFormer RGBD semantic segmentation (NVIDIA CUDA optimized).
Uses DFormer-Small to fit in 8GB VRAM.

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

    # Auto-find smallest available variant
    if not cfg_path.exists():
        configs_dir = config.DFORMER_REPO / "local_configs" / "NYUDepthv2"
        if configs_dir.exists():
            for variant in ["DFormer_Tiny", "DFormer_Small", "DFormer_Base", "DFormer_Large"]:
                alt = configs_dir / f"{variant}.py"
                if alt.exists():
                    cfg_path = alt
                    ckpt_path = config.DFORMER_REPO / "checkpoints" / f"{variant}.pth"
                    print(f"[dformer] Found config: {variant}")
                    break

    print(f"[dformer] Loading {cfg_path.stem}...")

    try:
        from mmseg.apis import init_model

        model = init_model(str(cfg_path), str(ckpt_path), device=config.DEVICE)
        _model = model
        print(f"[dformer] Model loaded on {config.DEVICE}")
        _log_vram()
        return _model
    except (ImportError, FileNotFoundError) as e:
        print(f"[dformer] Could not load via mmseg ({e})")

    # Fallback: use builtin analysis
    print("[dformer] Falling back to heuristic segmentation (no neural model)")
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
            from mmseg.apis import inference_model
            result = inference_model(model, str(rgb_path))
            if hasattr(result, 'pred_sem_seg'):
                seg = result.pred_sem_seg.data.squeeze(0).cpu().numpy()
            else:
                seg = result.squeeze(0).cpu().numpy()
        except (ImportError, TypeError, AttributeError):
            # Direct model call
            try:
                result = model(rgb_t, depth_t)
            except TypeError:
                result = model({"img": rgb_t, "depth": depth_t})

            if isinstance(result, (list, tuple)):
                result = result[0]
            if isinstance(result, dict):
                result = result.get("pred_sem_seg", result.get("seg_logit", next(iter(result.values()))))
            if isinstance(result, torch.Tensor):
                if result.dim() == 4:
                    seg = result.argmax(dim=1).squeeze(0).cpu().numpy()
                else:
                    seg = result.squeeze(0).cpu().numpy()
            else:
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

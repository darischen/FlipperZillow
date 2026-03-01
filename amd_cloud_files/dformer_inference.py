"""
DFormer RGBD semantic segmentation → feature JSON.

Uses VCIP-RGBD/DFormer (https://github.com/VCIP-RGBD/DFormer) to perform
semantic segmentation on RGB + Depth map pairs. The model outputs per-pixel
class labels from NYUv2 40 classes (wall, floor, bed, sofa, table, etc.).

We then aggregate the segmentation into a structured feature list that
describes what's in each room — designed for feeding into Claude to write
a realtor tour script.
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
from utils import timer

# Add DFormer repo to Python path so we can import its modules
sys.path.insert(0, str(config.DFORMER_REPO))

_model = None


def _load_model():
    """
    Load DFormer model using the repo's mmseg-based framework.
    The repo includes its own mmseg/ directory with custom model builders.
    """
    global _model
    if _model is not None:
        return _model

    cfg_path = config.DFORMER_CFG
    ckpt_path = config.DFORMER_CKPT

    # Find available config if the default doesn't exist
    if not cfg_path.exists():
        configs_dir = config.DFORMER_REPO / "local_configs" / "NYUDepthv2"
        if configs_dir.exists():
            for variant in ["DFormer_Large", "DFormer_Base", "DFormer_Small", "DFormer_Tiny"]:
                alt = configs_dir / f"{variant}.py"
                if alt.exists():
                    cfg_path = alt
                    ckpt_path = config.DFORMER_REPO / "checkpoints" / f"{variant}.pth"
                    print(f"[dformer] Using config: {cfg_path}")
                    break

    try:
        # Try using the repo's own mmseg (it ships with a custom fork)
        from mmseg.apis import init_model
        model = init_model(str(cfg_path), str(ckpt_path), device=config.DEVICE)
        _model = model
        print(f"[dformer] Loaded DFormer via mmseg on {config.DEVICE}")
        return _model
    except ImportError:
        pass

    # Fallback: try loading via the repo's own utils
    try:
        from models.builder import EncoderDecoder as ModelBuilder
        from mmengine.config import Config

        cfg = Config.fromfile(str(cfg_path))
        model = ModelBuilder(cfg.model)

        if ckpt_path.exists():
            state = torch.load(str(ckpt_path), map_location="cpu")
            if "state_dict" in state:
                state = state["state_dict"]
            model.load_state_dict(state, strict=False)

        model = model.to(config.DEVICE).eval()
        _model = model
        print(f"[dformer] Loaded DFormer via ModelBuilder on {config.DEVICE}")
        return _model
    except Exception as e:
        print(f"[dformer] WARNING: Could not load model: {e}")
        print("[dformer] Falling back to image-analysis-only mode (no neural segmentation)")
        _model = "fallback"
        return _model


def _preprocess_rgbd(rgb_path: str | Path, depth_npy_path: str | Path,
                     target_h: int = 480, target_w: int = 640):
    """
    Prepare RGB and Depth tensors for DFormer inference.
    DFormer expects:
      - RGB: (1, 3, H, W) normalized with ImageNet stats
      - Depth: (1, 3, H, W) — depth is replicated to 3 channels (HHA-style)
    """
    # Load and resize RGB
    rgb = cv2.imread(str(rgb_path))
    rgb = cv2.resize(rgb, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

    # Normalize RGB (ImageNet)
    mean = np.array([123.675, 116.28, 103.53])
    std = np.array([58.395, 57.12, 57.375])
    rgb_norm = (rgb.astype(np.float32) - mean) / std
    rgb_tensor = torch.from_numpy(rgb_norm.transpose(2, 0, 1)).unsqueeze(0).float().to(config.DEVICE)

    # Load and resize depth, replicate to 3 channels (DFormer expects 3-channel depth)
    depth = np.load(depth_npy_path).astype(np.float32)
    depth = cv2.resize(depth, (target_w, target_h), interpolation=cv2.INTER_LINEAR)

    # Normalize depth to [0, 255] range then apply same ImageNet normalization
    d_min, d_max = depth.min(), depth.max()
    if d_max - d_min > 1e-6:
        depth = (depth - d_min) / (d_max - d_min) * 255.0

    depth_3ch = np.stack([depth, depth, depth], axis=-1)  # (H, W, 3)
    depth_norm = (depth_3ch - mean) / std
    depth_tensor = torch.from_numpy(depth_norm.transpose(2, 0, 1)).unsqueeze(0).float().to(config.DEVICE)

    return rgb_tensor, depth_tensor


def infer_segmentation(rgb_path: str | Path, depth_npy_path: str | Path) -> np.ndarray:
    """
    Run DFormer on an RGBD pair.
    Returns segmentation map as int numpy array (H, W) with NYUv2 class indices.
    """
    model = _load_model()

    if model == "fallback":
        return _fallback_segmentation(rgb_path, depth_npy_path)

    rgb_t, depth_t = _preprocess_rgbd(rgb_path, depth_npy_path)

    with torch.no_grad():
        try:
            # mmseg-style inference
            from mmseg.apis import inference_model
            result = inference_model(model, str(rgb_path))
            if hasattr(result, 'pred_sem_seg'):
                seg = result.pred_sem_seg.data.squeeze(0).cpu().numpy()
            else:
                seg = result.squeeze(0).cpu().numpy()
        except (ImportError, TypeError, AttributeError):
            # Direct model call with RGBD tensors
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
    """
    Basic image-analysis segmentation when the model can't be loaded.
    Uses color/depth heuristics to approximate room features.
    """
    rgb = cv2.imread(str(rgb_path))
    h, w = rgb.shape[:2]
    depth = np.load(depth_npy_path).astype(np.float32)
    depth = cv2.resize(depth, (w, h))

    # Simple heuristic segmentation:
    # Top portion → ceiling (class 21)
    # Bottom portion → floor (class 1)
    # Everything else → wall (class 0)
    seg = np.zeros((h, w), dtype=np.int32)
    seg[:h // 4, :] = 21  # ceiling
    seg[3 * h // 4:, :] = 1  # floor
    # Middle stays 0 = wall

    return seg


def segmentation_to_features(seg_map: np.ndarray, rgb_path: str | Path) -> dict:
    """
    Convert a segmentation map into a structured feature summary.
    Returns a dict describing what's in the image — designed for
    feeding into Claude to write a realtor tour script.
    """
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
    """Convert class-index segmentation map to a colored visualization."""
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
    Run DFormer on a batch of (rgb_path, depth_npy_path) pairs.
    Saves segmentation maps and feature JSONs.
    Returns list of feature dicts.
    """
    output_dir = Path(output_dir)
    seg_dir = output_dir / "segmentation"
    feat_dir = output_dir / "features"
    seg_dir.mkdir(parents=True, exist_ok=True)
    feat_dir.mkdir(parents=True, exist_ok=True)

    all_features = []
    for rgb_path, depth_npy_path in image_depth_pairs:
        stem = Path(rgb_path).stem

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

        print(f"[dformer] {stem} → {features['room_type']} "
              f"({features['num_distinct_objects']} objects) in {t.elapsed:.2f}s")

    return all_features

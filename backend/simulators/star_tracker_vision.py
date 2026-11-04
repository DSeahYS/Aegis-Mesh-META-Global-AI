"""
========================================================================================
AEGIS-MESH: Autonomous Spacecraft Edge Vision & Star Tracker 6DoF Pose Estimation
========================================================================================
Module: backend.simulators.star_tracker_vision
Description:
    Implements the onboard Edge Vision & Sensor Data pipeline designed to ingest
    optical star tracker imagery and perform sub-millisecond resident space object (RSO)
    detection and 6DoF (6 Degrees of Freedom) pose estimation.

    Specifically engineered to interface with the SPARK 2022 Dataset
    ("Spacecraft Detection and Trajectory Estimation" - CVI² University of Luxembourg / ESA):
      - Stream 1: Spacecraft Detection (2D Bounding Boxes & Multi-Class Classification)
      - Stream 2: Trajectory Estimation (3D Translation vector [tx, ty, tz] and
                  Unit Attitude Quaternion [qw, qx, qy, qz]).

Architecture:
    1. SPARK2022Dataset:
       PyTorch Dataset adhering to the SPARK 2022 schema (CSV/JSON annotations,
       RGB/Grayscale imagery, CLAHE stray-light mitigation, coordinate transforms).
    2. Edge6DoFPoseResNet:
       Hardware-optimized lightweight Residual Neural Network (simplified ResNet)
       with decoupled multi-task heads for Bounding Box regression, Class Logits,
       3D Translation (m), and Antipodal-Invariant Unit Quaternion orientation.
    3. EdgeLatencyBenchmark:
       High-resolution execution profiler timing inference latencies to validate
       compliance with the AEGIS-MESH <= 16 ms (60+ FPS) edge hardware SLA.

Author: AI Vision & Star Tracker Engineering Team (AEGIS-MESH)
========================================================================================
"""

from __future__ import annotations

import argparse
import csv
import json
import logging
import os
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

# Core Scientific & ML Libraries
import numpy as np

try:
    import torch
    import torch.nn as nn
    import torch.nn.functional as F
    from torch.utils.data import DataLoader, Dataset
    import torchvision.transforms as transforms
except ImportError as err:  # pragma: no cover
    raise ImportError(
        "PyTorch and Torchvision are required for backend.simulators.star_tracker_vision. "
        "Install via: pip install torch torchvision"
    ) from err

try:
    import cv2
except ImportError as err:  # pragma: no cover
    raise ImportError(
        "OpenCV (cv2) is required for optical preprocessing and star tracker simulations. "
        "Install via: pip install opencv-python"
    ) from err

# --------------------------------------------------------------------------------------
# Logging & Diagnostic Setup
# --------------------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [%(levelname)s] [StarTrackerVision] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("StarTrackerVision")

# --------------------------------------------------------------------------------------
# SPARK 2022 Dataset Specification & Constants
# --------------------------------------------------------------------------------------
# 11 Standard Target Classes in the SPARK 2022 Benchmark (ESA spacecraft & space debris)
SPARK_CLASSES: List[str] = [
    "AcrimSat",
    "Aquarius",
    "Aura",
    "Calipso",
    "Cloudsat",
    "Debris",
    "Jason-1",
    "Jason-2",
    "Terra",
    "TRMM",
    "Unknown_Spacecraft",
]

SPARK_CLASS_TO_IDX: Dict[str, int] = {name: i for i, name in enumerate(SPARK_CLASSES)}
SPARK_IDX_TO_CLASS: Dict[int, str] = {i: name for i, name in enumerate(SPARK_CLASSES)}

# AEGIS-MESH Hardware Edge SLA Target
EDGE_LATENCY_BUDGET_MS: float = 16.0  # 60 FPS real-time threshold for LEO edge FPGA/ASIC


@dataclass
class StarTrackerConfig:
    """Configuration parameters for the optical star tracker vision pipeline."""
    img_size: Tuple[int, int] = (224, 224)
    num_classes: int = len(SPARK_CLASSES)
    apply_clahe: bool = True
    clahe_clip_limit: float = 2.0
    clahe_tile_grid_size: Tuple[int, int] = (8, 8)
    device: str = "cuda" if torch.cuda.is_available() else "cpu"
    batch_size: int = 1  # 1 for edge streaming, >1 for batched training/evaluation
    num_workers: int = 0
    pin_memory: bool = False


@dataclass
class Pose6DoFPrediction:
    """Container for single-frame 6DoF pose inference output."""
    class_name: str
    class_id: int
    confidence: float
    bbox: np.ndarray  # [xmin, ymin, xmax, ymax] in pixel coordinates
    translation: np.ndarray  # [tx, ty, tz] in meters relative to camera frame
    quaternion: np.ndarray  # [qw, qx, qy, qz] unit quaternion attitude
    rotation_matrix: np.ndarray  # 3x3 SO(3) rotation matrix
    latency_ms: float


# ======================================================================================
# 1. SPARK 2022 DATASET LOADER
# ======================================================================================
class SPARK2022Dataset(Dataset):
    """
    Robust PyTorch Dataset loader specifically tailored for the SPARK 2022 Dataset
    (Spacecraft Detection & Trajectory Estimation).

    Handles both:
      - CSV annotation manifests (e.g. `train.csv`, `test.csv`, `annotations.csv`)
      - JSON annotation manifests (COCO-style or SPEED-style formats)

    Data Columns & Expected Keys:
      - Image file path: 'filename', 'image_id', 'file_name', or 'img_path'
      - Bounding Box: 'bbox_xmin', 'bbox_ymin', 'bbox_xmax', 'bbox_ymax' OR 'bbox': [x, y, w, h]
      - 3D Translation (meters): 'tx', 'ty', 'tz' OR 'translation': [x, y, z]
      - 4D Unit Quaternion: 'qw', 'qx', 'qy', 'qz' (or [qx, qy, qz, qw])
      - Class identifier: 'class_name', 'class_id', 'label', 'category_id'
    """

    def __init__(
        self,
        root_dir: Union[str, Path],
        split: str = "train",
        transform: Optional[transforms.Compose] = None,
        config: Optional[StarTrackerConfig] = None,
        annotation_file: Optional[str] = None,
    ) -> None:
        super().__init__()
        self.root_dir = Path(root_dir)
        self.split = split
        self.config = config or StarTrackerConfig()
        self.transform = transform or self._default_transforms()
        self.annotations: List[Dict[str, Any]] = []

        # CLAHE (Contrast Limited Adaptive Histogram Equalization) for stray-light removal
        if self.config.apply_clahe:
            self.clahe = cv2.createCLAHE(
                clipLimit=self.config.clahe_clip_limit,
                tileGridSize=self.config.clahe_tile_grid_size,
            )
        else:
            self.clahe = None

        self._load_dataset(annotation_file)

    def _default_transforms(self) -> transforms.Compose:
        """Standard ImageNet-compatible transforms with star tracker normalization."""
        return transforms.Compose([
            transforms.ToPILImage(),
            transforms.Resize(self.config.img_size),
            transforms.ToTensor(),
            # Normalization parameters suited for orbital optical space sensors
            transforms.Normalize(
                mean=[0.485, 0.456, 0.406],
                std=[0.229, 0.224, 0.225],
            ),
        ])

    def _find_image_directory(self) -> Path:
        """Locates the image folder under various SPARK directory topologies."""
        candidate_dirs = [
            self.root_dir / self.split / "images",
            self.root_dir / "images" / self.split,
            self.root_dir / self.split,
            self.root_dir / "images",
            self.root_dir / "rgb",
            self.root_dir,
        ]
        for candidate in candidate_dirs:
            if candidate.is_dir():
                return candidate
        return self.root_dir

    def _load_dataset(self, annotation_file: Optional[str] = None) -> None:
        """Parses CSV or JSON manifests to populate the annotation index."""
        if not self.root_dir.exists():
            logger.warning(
                f"Dataset root directory does not exist: {self.root_dir}. "
                "Dataset initialized empty (ready for path assignment)."
            )
            return

        self.img_dir = self._find_image_directory()

        # Determine annotation file path
        anno_path = None
        if annotation_file:
            candidate = self.root_dir / annotation_file
            if candidate.exists():
                anno_path = candidate
            elif Path(annotation_file).exists():
                anno_path = Path(annotation_file)

        if anno_path is None:
            # Automatic discovery
            candidates = [
                self.root_dir / f"{self.split}.csv",
                self.root_dir / "annotations" / f"{self.split}.csv",
                self.root_dir / "annotations.csv",
                self.root_dir / f"{self.split}.json",
                self.root_dir / "annotations" / f"{self.split}.json",
                self.root_dir / "annotations.json",
            ]
            for c in candidates:
                if c.exists():
                    anno_path = c
                    break

        if anno_path is None:
            logger.warning(
                f"No explicit annotation file found in {self.root_dir} for split '{self.split}'. "
                "Scanning directory for raw images directly."
            )
            self._load_unannotated_images()
            return

        logger.info(f"Loading SPARK 2022 annotations from: {anno_path}")
        if anno_path.suffix.lower() == ".csv":
            self._parse_csv_manifest(anno_path)
        elif anno_path.suffix.lower() == ".json":
            self._parse_json_manifest(anno_path)
        else:
            raise ValueError(f"Unsupported annotation file extension: {anno_path.suffix}")

        logger.info(f"Loaded {len(self.annotations)} valid SPARK samples from {anno_path}")

    def _parse_csv_manifest(self, csv_path: Path) -> None:
        """Parses SPARK 2022 CSV format containing bounding boxes and 6DoF poses."""
        with open(csv_path, mode="r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                fname = (
                    row.get("filename")
                    or row.get("image_id")
                    or row.get("file_name")
                    or row.get("img_path")
                )
                if not fname:
                    continue

                # Class resolution
                raw_class = row.get("class_name") or row.get("class") or row.get("category")
                if raw_class in SPARK_CLASS_TO_IDX:
                    class_id = SPARK_CLASS_TO_IDX[raw_class]
                elif "class_id" in row:
                    class_id = int(float(row["class_id"]))
                else:
                    class_id = SPARK_CLASS_TO_IDX["Unknown_Spacecraft"]

                # Bounding box: [xmin, ymin, xmax, ymax]
                if "bbox_xmin" in row:
                    bbox = [
                        float(row.get("bbox_xmin", 0.0)),
                        float(row.get("bbox_ymin", 0.0)),
                        float(row.get("bbox_xmax", 0.0)),
                        float(row.get("bbox_ymax", 0.0)),
                    ]
                elif "x" in row and "w" in row:
                    # x, y, w, h format
                    x, y = float(row["x"]), float(row["y"])
                    w, h = float(row["w"]), float(row["h"])
                    bbox = [x, y, x + w, y + h]
                else:
                    bbox = [0.0, 0.0, float(self.config.img_size[0]), float(self.config.img_size[1])]

                # 3D Translation (meters): [tx, ty, tz]
                tx = float(row.get("tx", row.get("x_m", 0.0)))
                ty = float(row.get("ty", row.get("y_m", 0.0)))
                tz = float(row.get("tz", row.get("z_m", 5.0)))  # default 5m distance if missing
                translation = [tx, ty, tz]

                # 4D Quaternion: [qw, qx, qy, qz]
                # Default identity quaternion if missing [1.0, 0.0, 0.0, 0.0]
                qw = float(row.get("qw", row.get("q0", row.get("q_w", 1.0))))
                qx = float(row.get("qx", row.get("q1", row.get("q_x", 0.0))))
                qy = float(row.get("qy", row.get("q2", row.get("q_y", 0.0))))
                qz = float(row.get("qz", row.get("q3", row.get("q_z", 0.0))))
                quaternion = [qw, qx, qy, qz]

                self.annotations.append({
                    "filename": fname,
                    "class_id": class_id,
                    "bbox": np.array(bbox, dtype=np.float32),
                    "translation": np.array(translation, dtype=np.float32),
                    "quaternion": np.array(quaternion, dtype=np.float32),
                })

    def _parse_json_manifest(self, json_path: Path) -> None:
        """Parses SPARK JSON format (list of records or COCO-style dictionary)."""
        with open(json_path, mode="r", encoding="utf-8") as f:
            data = json.load(f)

        records = data if isinstance(data, list) else data.get("images", data.get("annotations", []))

        for item in records:
            fname = item.get("filename") or item.get("file_name") or item.get("img_name")
            if not fname:
                continue

            # Class
            raw_cls = item.get("class_name") or item.get("category_name") or item.get("label")
            class_id = (
                SPARK_CLASS_TO_IDX.get(raw_cls, SPARK_CLASS_TO_IDX["Unknown_Spacecraft"])
                if raw_cls
                else item.get("class_id", 0)
            )

            # Bounding box
            raw_box = item.get("bbox", [0.0, 0.0, self.config.img_size[0], self.config.img_size[1]])
            if len(raw_box) == 4:
                # If COCO format [x, y, w, h]
                if "category_id" in item and len(raw_box) == 4:
                    bbox = [raw_box[0], raw_box[1], raw_box[0] + raw_box[2], raw_box[1] + raw_box[3]]
                else:
                    bbox = raw_box
            else:
                bbox = [0.0, 0.0, float(self.config.img_size[0]), float(self.config.img_size[1])]

            # 3D Translation
            raw_trans = item.get("translation") or item.get("r") or item.get("t") or [0.0, 0.0, 5.0]
            # 4D Quaternion
            raw_quat = item.get("quaternion") or item.get("q") or [1.0, 0.0, 0.0, 0.0]

            self.annotations.append({
                "filename": fname,
                "class_id": int(class_id),
                "bbox": np.array(bbox, dtype=np.float32),
                "translation": np.array(raw_trans, dtype=np.float32),
                "quaternion": np.array(raw_quat, dtype=np.float32),
            })

    def _load_unannotated_images(self) -> None:
        """Fallback: lists raw image files in the directory for mock inference."""
        valid_exts = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff"}
        for img_path in self.img_dir.rglob("*"):
            if img_path.suffix.lower() in valid_exts:
                self.annotations.append({
                    "filename": str(img_path.relative_to(self.img_dir)),
                    "class_id": SPARK_CLASS_TO_IDX["Unknown_Spacecraft"],
                    "bbox": np.array([0.0, 0.0, 224.0, 224.0], dtype=np.float32),
                    "translation": np.array([0.0, 0.0, 5.0], dtype=np.float32),
                    "quaternion": np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32),
                })

    def __len__(self) -> int:
        return len(self.annotations)

    def __getitem__(self, idx: int) -> Dict[str, Any]:
        """
        Retrieves a single sample with image tensor, bounding box, 3D translation,
        unit quaternion, and class label.
        """
        record = self.annotations[idx]
        img_rel_path = record["filename"]
        img_full_path = self.img_dir / img_rel_path

        # Resolve path robustness
        if not img_full_path.exists():
            candidate = self.root_dir / img_rel_path
            if candidate.exists():
                img_full_path = candidate

        # Optical image ingestion via OpenCV
        if img_full_path.exists():
            img_bgr = cv2.imread(str(img_full_path), cv2.IMREAD_COLOR)
            if img_bgr is None:
                # Corrupted or unreadable image -> fallback to synthetic blank optical canvas
                img_bgr = np.zeros((*self.config.img_size, 3), dtype=np.uint8)
        else:
            img_bgr = np.zeros((*self.config.img_size, 3), dtype=np.uint8)

        orig_h, orig_w = img_bgr.shape[:2]

        # Optical star tracker preprocessing: Stray-light reduction & contrast enhancement
        if self.clahe is not None:
            # Convert to LAB color space to equalize only luminance channel
            lab = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2LAB)
            lab_planes = list(cv2.split(lab))
            lab_planes[0] = self.clahe.apply(lab_planes[0])
            lab = cv2.merge(lab_planes)
            img_rgb = cv2.cvtColor(lab, cv2.COLOR_LAB2RGB)
        else:
            img_rgb = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2RGB)

        # Scale bounding box relative to resized model input dimensions
        scale_x = self.config.img_size[0] / max(orig_w, 1)
        scale_y = self.config.img_size[1] / max(orig_h, 1)
        raw_bbox = record["bbox"]
        scaled_bbox = np.array([
            raw_bbox[0] * scale_x,
            raw_bbox[1] * scale_y,
            raw_bbox[2] * scale_x,
            raw_bbox[3] * scale_y,
        ], dtype=np.float32)

        # PyTorch Image Transformation
        img_tensor = self.transform(img_rgb)

        # Ensure unit norm quaternion [qw, qx, qy, qz]
        quat = record["quaternion"]
        quat_norm = np.linalg.norm(quat)
        if quat_norm > 1e-6:
            unit_quat = (quat / quat_norm).astype(np.float32)
        else:
            unit_quat = np.array([1.0, 0.0, 0.0, 0.0], dtype=np.float32)

        return {
            "image": img_tensor,  # Shape: (3, H, W)
            "bbox": torch.from_numpy(scaled_bbox),  # Shape: (4,)
            "quaternion": torch.from_numpy(unit_quat),  # Shape: (4,) [qw, qx, qy, qz]
            "translation": torch.from_numpy(record["translation"].astype(np.float32)),  # Shape: (3,) [tx, ty, tz]
            "class_id": torch.tensor(record["class_id"], dtype=torch.long),
            "filename": img_rel_path,
            "original_shape": (orig_h, orig_w),
        }


def spark_collate_fn(batch: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Custom collate function for batching SPARK 2022 samples."""
    images = torch.stack([b["image"] for b in batch], dim=0)
    bboxes = torch.stack([b["bbox"] for b in batch], dim=0)
    quaternions = torch.stack([b["quaternion"] for b in batch], dim=0)
    translations = torch.stack([b["translation"] for b in batch], dim=0)
    class_ids = torch.stack([b["class_id"] for b in batch], dim=0)
    filenames = [b["filename"] for b in batch]
    original_shapes = [b["original_shape"] for b in batch]

    return {
        "images": images,
        "bboxes": bboxes,
        "quaternions": quaternions,
        "translations": translations,
        "class_ids": class_ids,
        "filenames": filenames,
        "original_shapes": original_shapes,
    }


def create_spark_dataloader(
    root_dir: Union[str, Path],
    split: str = "train",
    config: Optional[StarTrackerConfig] = None,
    shuffle: bool = True,
) -> DataLoader:
    """Builds a production-ready DataLoader for the SPARK 2022 dataset."""
    cfg = config or StarTrackerConfig()
    dataset = SPARK2022Dataset(root_dir=root_dir, split=split, config=cfg)
    return DataLoader(
        dataset=dataset,
        batch_size=cfg.batch_size,
        shuffle=shuffle,
        num_workers=cfg.num_workers,
        pin_memory=cfg.pin_memory,
        collate_fn=spark_collate_fn,
    )


# ======================================================================================
# 2. EDGE 6DoF POSE ESTIMATION MODEL (SIMPLIFIED RESNET BACKBONE)
# ======================================================================================
class ResidualBlock(nn.Module):
    """
    Lightweight Residual Convolutional Block optimized for edge accelerators.
    Features: 3x3 Conv -> BatchNorm -> LeakyReLU -> 3x3 Conv -> BatchNorm + Skip.
    """

    def __init__(self, in_channels: int, out_channels: int, stride: int = 1) -> None:
        super().__init__()
        self.conv1 = nn.Conv2d(
            in_channels, out_channels, kernel_size=3, stride=stride, padding=1, bias=False
        )
        self.bn1 = nn.BatchNorm2d(out_channels)
        self.act = nn.LeakyReLU(negative_slope=0.1, inplace=True)

        self.conv2 = nn.Conv2d(
            out_channels, out_channels, kernel_size=3, stride=1, padding=1, bias=False
        )
        self.bn2 = nn.BatchNorm2d(out_channels)

        self.shortcut = nn.Sequential()
        if stride != 1 or in_channels != out_channels:
            self.shortcut = nn.Sequential(
                nn.Conv2d(in_channels, out_channels, kernel_size=1, stride=stride, bias=False),
                nn.BatchNorm2d(out_channels),
            )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        residual = self.shortcut(x)
        out = self.conv1(x)
        out = self.bn1(out)
        out = self.act(out)
        out = self.conv2(out)
        out = self.bn2(out)
        out = out + residual
        return self.act(out)


class QuaternionNormalize(nn.Module):
    """
    Differentiable unit quaternion normalization layer.
    Ensures that predicted quaternions strictly lie on the unit 3-sphere S^3:
      q_unit = q / (||q||_2 + eps)
    """

    def __init__(self, eps: float = 1e-8) -> None:
        super().__init__()
        self.eps = eps

    def forward(self, q: torch.Tensor) -> torch.Tensor:
        norm = torch.norm(q, p=2, dim=-1, keepdim=True)
        return q / (norm + self.eps)


class Edge6DoFPoseResNet(nn.Module):
    """
    Hardware-optimized 6DoF Spacecraft Pose Estimation Network.

    Architecture Overview:
      - Stem: 3x3 Stride-2 Conv + MaxPool for rapid spatial downsampling.
      - 4 Residual Stages: [64 -> 128 -> 256 -> 512 channels]
      - Global Average Pooling (1x1 bottleneck representation, 512-dim).
      - Decoupled Multi-Task Heads:
          1. Bounding Box Head (4 outputs): [xmin, ymin, xmax, ymax]
          2. Classification Head (11 outputs): Target spacecraft category logits
          3. Translation Head (3 outputs): Relative 3D position [tx, ty, tz] (meters)
          4. Rotation Head (4 outputs): Unit quaternion [qw, qx, qy, qz] on S^3
    """

    def __init__(self, num_classes: int = len(SPARK_CLASSES), feature_dim: int = 512) -> None:
        super().__init__()
        self.num_classes = num_classes
        self.feature_dim = feature_dim

        # Initial Stem Layer (Fast downsampling for edge throughput)
        self.stem = nn.Sequential(
            nn.Conv2d(3, 64, kernel_size=5, stride=2, padding=2, bias=False),
            nn.BatchNorm2d(64),
            nn.LeakyReLU(0.1, inplace=True),
            nn.MaxPool2d(kernel_size=2, stride=2),
        )

        # Residual Feature Extractor Backbone (Simplified ResNet)
        self.stage1 = ResidualBlock(64, 64, stride=1)
        self.stage2 = ResidualBlock(64, 128, stride=2)
        self.stage3 = ResidualBlock(128, 256, stride=2)
        self.stage4 = ResidualBlock(256, feature_dim, stride=2)

        # Global Receptive Field Aggregation
        self.global_pool = nn.AdaptiveAvgPool2d((1, 1))

        # --- Decoupled Output Heads ---
        # 1. Bounding Box Regressor (4 coordinates)
        self.bbox_head = nn.Sequential(
            nn.Linear(feature_dim, 128),
            nn.LeakyReLU(0.1),
            nn.Linear(128, 4),
        )

        # 2. Multi-Class Classifier (11 SPARK classes)
        self.cls_head = nn.Sequential(
            nn.Linear(feature_dim, 128),
            nn.LeakyReLU(0.1),
            nn.Linear(128, num_classes),
        )

        # 3. 3D Translation Vector Regressor [tx, ty, tz] (meters)
        self.trans_head = nn.Sequential(
            nn.Linear(feature_dim, 128),
            nn.LeakyReLU(0.1),
            nn.Linear(128, 3),
        )

        # 4. 4D Rotation Unit Quaternion Regressor [qw, qx, qy, qz]
        self.rot_head = nn.Sequential(
            nn.Linear(feature_dim, 128),
            nn.LeakyReLU(0.1),
            nn.Linear(128, 4),
            QuaternionNormalize(),
        )

        self._init_weights()

    def _init_weights(self) -> None:
        """Kaiming normal initialization for conv layers; bias zeroed."""
        for m in self.modules():
            if isinstance(m, nn.Conv2d):
                nn.init.kaiming_normal_(m.weight, mode="fan_out", nonlinearity="relu")
            elif isinstance(m, nn.BatchNorm2d):
                nn.init.constant_(m.weight, 1.0)
                nn.init.constant_(m.bias, 0.0)
            elif isinstance(m, nn.Linear):
                nn.init.normal_(m.weight, 0.0, 0.01)
                if m.bias is not None:
                    nn.init.constant_(m.bias, 0.0)

    def forward(self, x: torch.Tensor) -> Dict[str, torch.Tensor]:
        """
        Forward inference pass.
        Args:
            x: Input optical image tensor of shape (B, 3, H, W)
        Returns:
            Dictionary with predicted 'bbox', 'class_logits', 'translation', and 'quaternion'.
        """
        # Feature Extraction
        h = self.stem(x)
        h = self.stage1(h)
        h = self.stage2(h)
        h = self.stage3(h)
        h = self.stage4(h)

        # Global Pool & Flatten
        h = self.global_pool(h)
        features = torch.flatten(h, 1)

        # Multi-task predictions
        pred_bbox = self.bbox_head(features)
        pred_cls = self.cls_head(features)
        pred_trans = self.trans_head(features)
        pred_quat = self.rot_head(features)

        return {
            "bbox": pred_bbox,
            "class_logits": pred_cls,
            "translation": pred_trans,
            "quaternion": pred_quat,
        }

    @staticmethod
    def quaternion_to_rotation_matrix(q: torch.Tensor) -> torch.Tensor:
        """
        Converts unit quaternions [qw, qx, qy, qz] to 3x3 rotation matrices SO(3).
        Args:
            q: Tensor of shape (..., 4) where q[..., 0] is scalar real part qw.
        Returns:
            Tensor of shape (..., 3, 3)
        """
        qw, qx, qy, qz = q[..., 0], q[..., 1], q[..., 2], q[..., 3]

        r00 = 1.0 - 2.0 * (qy**2 + qz**2)
        r01 = 2.0 * (qx * qy - qz * qw)
        r02 = 2.0 * (qx * qz + qy * qw)

        r10 = 2.0 * (qx * qy + qz * qw)
        r11 = 1.0 - 2.0 * (qx**2 + qz**2)
        r12 = 2.0 * (qy * qz - qx * qw)

        r20 = 2.0 * (qx * qz - qy * qw)
        r21 = 2.0 * (qy * qz + qx * qw)
        r22 = 1.0 - 2.0 * (qx**2 + qy**2)

        rot_mat = torch.stack([
            torch.stack([r00, r01, r02], dim=-1),
            torch.stack([r10, r11, r12], dim=-1),
            torch.stack([r20, r21, r22], dim=-1),
        ], dim=-2)
        return rot_mat

    def predict_pose(self, image_tensor: torch.Tensor) -> List[Pose6DoFPrediction]:
        """
        High-level inference helper converting raw tensor outputs to structured predictions.
        """
        self.eval()
        t0 = time.perf_counter()
        with torch.no_grad():
            outputs = self.forward(image_tensor)
            rot_matrices = self.quaternion_to_rotation_matrix(outputs["quaternion"])
            probs = F.softmax(outputs["class_logits"], dim=-1)
            confidences, pred_classes = torch.max(probs, dim=-1)

        t_elapsed = (time.perf_counter() - t0) * 1000.0
        batch_size = image_tensor.size(0)
        per_frame_latency = t_elapsed / max(batch_size, 1)

        predictions: List[Pose6DoFPrediction] = []
        for i in range(batch_size):
            cid = int(pred_classes[i].item())
            cname = SPARK_IDX_TO_CLASS.get(cid, "Unknown_Spacecraft")
            predictions.append(
                Pose6DoFPrediction(
                    class_name=cname,
                    class_id=cid,
                    confidence=float(confidences[i].item()),
                    bbox=outputs["bbox"][i].cpu().numpy(),
                    translation=outputs["translation"][i].cpu().numpy(),
                    quaternion=outputs["quaternion"][i].cpu().numpy(),
                    rotation_matrix=rot_matrices[i].cpu().numpy(),
                    latency_ms=per_frame_latency,
                )
            )
        return predictions


# ======================================================================================
# 3. MULTI-TASK LOSS OBJECTIVE (FOR SPARK 2022 SUPERVISED FINE-TUNING)
# ======================================================================================
class PoseEstimationLoss(nn.Module):
    """
    Supervised Multi-Task Loss for 6DoF Spacecraft Pose Estimation:
      L = w_cls * L_cls + w_bbox * L_bbox + w_trans * L_trans + w_rot * L_rot

    Where L_rot is the antipodal-invariant quaternion angular distance loss:
      L_rot = 1 - |<q_pred, q_gt>|
      (Ensures q and -q representing identical orientations are penalized identically).
    """

    def __init__(
        self,
        weight_cls: float = 1.0,
        weight_bbox: float = 0.5,
        weight_trans: float = 2.0,
        weight_rot: float = 5.0,
    ) -> None:
        super().__init__()
        self.w_cls = weight_cls
        self.w_bbox = weight_bbox
        self.w_trans = weight_trans
        self.w_rot = weight_rot

        self.cls_criterion = nn.CrossEntropyLoss()
        self.bbox_criterion = nn.SmoothL1Loss(beta=1.0)
        self.trans_criterion = nn.SmoothL1Loss(beta=1.0)

    def forward(
        self,
        predictions: Dict[str, torch.Tensor],
        targets: Dict[str, torch.Tensor],
    ) -> Dict[str, torch.Tensor]:
        # 1. Classification Loss
        l_cls = self.cls_criterion(predictions["class_logits"], targets["class_ids"])

        # 2. Bounding Box Regression Loss
        l_bbox = self.bbox_criterion(predictions["bbox"], targets["bboxes"])

        # 3. 3D Translation Loss
        l_trans = self.trans_criterion(predictions["translation"], targets["translations"])

        # 4. Rotation Antipodal Quaternion Loss
        # Inner product |<q_pred, q_gt>|
        q_pred = predictions["quaternion"]
        q_gt = targets["quaternions"]
        dot_product = torch.sum(q_pred * q_gt, dim=-1, keepdim=True)
        abs_dot = torch.clamp(torch.abs(dot_product), max=1.0)
        l_rot = torch.mean(1.0 - abs_dot)

        total_loss = (
            self.w_cls * l_cls
            + self.w_bbox * l_bbox
            + self.w_trans * l_trans
            + self.w_rot * l_rot
        )

        return {
            "total_loss": total_loss,
            "loss_cls": l_cls,
            "loss_bbox": l_bbox,
            "loss_trans": l_trans,
            "loss_rot": l_rot,
        }


# ======================================================================================
# 4. EDGE LATENCY BENCHMARK & PROFILER
# ======================================================================================
@dataclass
class BenchmarkReport:
    """Statistical summary of edge hardware inference latency."""
    device: str
    batch_size: int
    num_iterations: int
    mean_latency_ms: float
    median_latency_ms: float
    std_latency_ms: float
    p95_latency_ms: float
    p99_latency_ms: float
    throughput_fps: float
    total_parameters: int
    trainable_parameters: int
    model_size_mb: float
    sla_compliant: bool  # True if mean_latency_ms <= EDGE_LATENCY_BUDGET_MS (16 ms)


def profile_edge_latency(
    model: nn.Module,
    input_shape: Tuple[int, int, int, int] = (1, 3, 224, 224),
    device: str = "cpu",
    num_warmup: int = 20,
    num_runs: int = 100,
) -> BenchmarkReport:
    """
    Executes a high-precision latency profiling loop on edge hardware.
    Uses monotonic performance counters and CUDA event synchronization when available.
    """
    model.eval()
    model.to(device)

    # Calculate model size and parameter count
    total_params = sum(p.numel() for p in model.parameters())
    trainable_params = sum(p.numel() for p in model.parameters() if p.requires_grad)
    model_size_mb = (total_params * 4) / (1024 * 1024)  # 32-bit float footprint

    dummy_input = torch.randn(*input_shape, device=device)

    # 1. Warmup Loop (stabilize CPU cache / GPU clocks)
    with torch.no_grad():
        for _ in range(num_warmup):
            _ = model(dummy_input)

    if device.startswith("cuda"):
        torch.cuda.synchronize()

    # 2. Precision Monotonic Timing Loop
    latencies: List[float] = []

    with torch.no_grad():
        for _ in range(num_runs):
            if device.startswith("cuda"):
                torch.cuda.synchronize()
            t_start = time.perf_counter()

            _ = model(dummy_input)

            if device.startswith("cuda"):
                torch.cuda.synchronize()
            t_end = time.perf_counter()

            latencies.append((t_end - t_start) * 1000.0)  # ms

    latencies_arr = np.array(latencies)
    mean_lat = float(np.mean(latencies_arr))
    median_lat = float(np.median(latencies_arr))
    std_lat = float(np.std(latencies_arr))
    p95_lat = float(np.percentile(latencies_arr, 95))
    p99_lat = float(np.percentile(latencies_arr, 99))
    fps = 1000.0 / mean_lat if mean_lat > 0 else 0.0
    sla_pass = mean_lat <= EDGE_LATENCY_BUDGET_MS

    return BenchmarkReport(
        device=device,
        batch_size=input_shape[0],
        num_iterations=num_runs,
        mean_latency_ms=round(mean_lat, 3),
        median_latency_ms=round(median_lat, 3),
        std_latency_ms=round(std_lat, 3),
        p95_latency_ms=round(p95_lat, 3),
        p99_latency_ms=round(p99_lat, 3),
        throughput_fps=round(fps, 1),
        total_parameters=total_params,
        trainable_parameters=trainable_params,
        model_size_mb=round(model_size_mb, 2),
        sla_compliant=sla_pass,
    )


# ======================================================================================
# 5. SYNTHETIC MOCK GENERATOR (FOR IMMEDIATE LOCAL VALIDATION WITHOUT 100GB DATASET)
# ======================================================================================
def create_synthetic_spark_mock_dir(target_dir: Union[str, Path], num_samples: int = 5) -> Path:
    """
    Creates a miniature mock directory conforming to the SPARK 2022 dataset format.
    Allows instant validation of the DataLoader and training loops without downloading
    the full 100GB archive.
    """
    base = Path(target_dir)
    images_dir = base / "train" / "images"
    images_dir.mkdir(parents=True, exist_ok=True)

    csv_path = base / "train.csv"
    rows = []

    for i in range(num_samples):
        fname = f"spark_sample_{i:04d}.png"
        fpath = images_dir / fname

        # Generate a synthetic star tracker image with optical noise and a mock target blob
        img = np.random.randint(0, 15, (224, 224, 3), dtype=np.uint8)  # Deep space background noise
        # Add a few star pinpoints
        for _ in range(20):
            sx, sy = np.random.randint(0, 224, size=2)
            cv2.circle(img, (sx, sy), 1, (200, 200, 200), -1)

        # Draw a synthetic resident space object (RSO) polygon
        target_center = (np.random.randint(60, 160), np.random.randint(60, 160))
        cv2.rectangle(
            img,
            (target_center[0] - 25, target_center[1] - 20),
            (target_center[0] + 25, target_center[1] + 20),
            (240, 230, 210),
            -1,
        )
        cv2.imwrite(str(fpath), img)

        # Associated ground truth metadata
        cname = SPARK_CLASSES[i % len(SPARK_CLASSES)]
        rows.append({
            "filename": f"images/{fname}",
            "class_name": cname,
            "bbox_xmin": target_center[0] - 25,
            "bbox_ymin": target_center[1] - 20,
            "bbox_xmax": target_center[0] + 25,
            "bbox_ymax": target_center[1] + 20,
            "tx": np.random.uniform(-2.0, 2.0),
            "ty": np.random.uniform(-2.0, 2.0),
            "tz": np.random.uniform(3.0, 15.0),
            "qw": 0.9238,
            "qx": 0.3826,
            "qy": 0.0,
            "qz": 0.0,
        })

    with open(csv_path, mode="w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)

    logger.info(f"Generated synthetic SPARK 2022 mock structure at: {base}")
    return base


def export_model_to_onnx(
    model: nn.Module,
    export_path: Union[str, Path],
    input_shape: Tuple[int, int, int, int] = (1, 3, 224, 224),
) -> Path:
    """
    Exports the PyTorch 6DoF Pose Estimation model to ONNX format.
    Enables edge deployment via TensorRT, OpenVINO, or Microchip VectorBlox FPGA compiler.
    """
    out_file = Path(export_path)
    out_file.parent.mkdir(parents=True, exist_ok=True)
    model.eval()
    dummy_input = torch.randn(*input_shape, device="cpu")

    torch.onnx.export(
        model.cpu(),
        dummy_input,
        str(out_file),
        export_params=True,
        opset_version=14,
        do_constant_folding=True,
        input_names=["optical_feed"],
        output_names=["bbox", "class_logits", "translation", "quaternion"],
        dynamic_axes={
            "optical_feed": {0: "batch_size"},
            "bbox": {0: "batch_size"},
            "class_logits": {0: "batch_size"},
            "translation": {0: "batch_size"},
            "quaternion": {0: "batch_size"},
        },
    )
    logger.info(f"Model successfully exported to ONNX format at: {out_file}")
    return out_file


# ======================================================================================
# 6. MAIN EXECUTION & INFERENCE BENCHMARK
# ======================================================================================
def run_star_tracker_pipeline(
    data_dir: Optional[str] = None,
    device: str = "auto",
    batch_size: int = 1,
    benchmark_runs: int = 100,
    export_onnx: Optional[str] = None,
) -> None:
    """
    Executes the dual-use Star Tracker 6DoF vision pipeline:
      1. Instantiates the Edge6DoFPoseResNet model.
      2. Validates DataLoader against dataset (real SPARK folder or mock generator).
      3. Performs dummy forward inference pass with single-frame telemetry readout.
      4. Profiles latency across 100 iterations to verify <= 16 ms edge SLA.
      5. Optionally exports model to ONNX.
    """
    print("\n" + "=" * 80)
    print("🛰️  AEGIS-MESH: STAR TRACKER 6DoF POSE ESTIMATION & EDGE VISION")
    print("    Benchmark Architecture for SPARK 2022 Dataset")
    print("=" * 80)

    # Device Selection
    selected_device = (
        ("cuda" if torch.cuda.is_available() else "cpu")
        if device == "auto"
        else device
    )
    logger.info(f"Hardware Compute Device: {selected_device.upper()}")

    # 1. Model Initialization
    logger.info("Initializing Edge6DoFPoseResNet architecture...")
    model = Edge6DoFPoseResNet(num_classes=len(SPARK_CLASSES), feature_dim=512)
    model.to(selected_device)
    model.eval()

    # 2. DataLoader Validation
    if data_dir and Path(data_dir).exists():
        logger.info(f"Connecting DataLoader to SPARK 2022 dataset at: {data_dir}")
        loader = create_spark_dataloader(
            root_dir=data_dir,
            split="train",
            config=StarTrackerConfig(batch_size=batch_size, device=selected_device),
        )
        logger.info(f"Loaded dataset containing {len(loader.dataset)} indexed frames.")
    else:
        logger.info(
            "No active SPARK 2022 folder specified. "
            "Simulating optical ingestion using synthetic sensor frame."
        )

    # 3. Dummy Single-Frame Inference Pass
    logger.info("Running dummy single-frame optical ingestion & pose inference...")
    dummy_input = torch.randn(batch_size, 3, 224, 224, device=selected_device)

    predictions = model.predict_pose(dummy_input)
    sample_pred = predictions[0]

    print("\n" + "-" * 60)
    print("🔭 SINGLE-FRAME ESTIMATED 6DoF TELEMETRY READOUT:")
    print("-" * 60)
    print(f"  • Classified Object : {sample_pred.class_name} (Class ID: {sample_pred.class_id})")
    print(f"  • Detection Conf.   : {sample_pred.confidence * 100:.2f}%")
    print(f"  • 2D Bounding Box   : [{', '.join(f'{v:.1f}' for v in sample_pred.bbox)}] px")
    print(f"  • 3D Translation t  : [{sample_pred.translation[0]:+.3f}, {sample_pred.translation[1]:+.3f}, {sample_pred.translation[2]:+.3f}] meters")
    print(f"  • Attitude Quat q   : [{sample_pred.quaternion[0]:.4f}, {sample_pred.quaternion[1]:.4f}, {sample_pred.quaternion[2]:.4f}, {sample_pred.quaternion[3]:.4f}]")
    print("  • Rotation SO(3) Matrix:")
    for row in sample_pred.rotation_matrix:
        print(f"      [{row[0]:+7.4f}, {row[1]:+7.4f}, {row[2]:+7.4f}]")
    print("-" * 60 + "\n")

    # 4. Edge Hardware Latency Benchmark
    logger.info(f"Benchmarking edge latency across {benchmark_runs} iterations...")
    report = profile_edge_latency(
        model=model,
        input_shape=(batch_size, 3, 224, 224),
        device=selected_device,
        num_warmup=15,
        num_runs=benchmark_runs,
    )

    print("=" * 80)
    print("⚡ EDGE HARDWARE LATENCY PROFILING REPORT:")
    print("=" * 80)
    print(f"  Target Platform         : {report.device.upper()}")
    print(f"  Batch Size              : {report.batch_size} frame(s)")
    print(f"  Model Parameters        : {report.total_parameters:,} ({report.model_size_mb:.2f} MB FP32)")
    print(f"  Mean Latency            : {report.mean_latency_ms:.3f} ms")
    print(f"  Median Latency          : {report.median_latency_ms:.3f} ms")
    print(f"  95th Percentile (P95)   : {report.p95_latency_ms:.3f} ms")
    print(f"  99th Percentile (P99)   : {report.p99_latency_ms:.3f} ms")
    print(f"  Throughput              : {report.throughput_fps:.1f} FPS")
    print(f"  AEGIS-MESH SLA (<=16ms) : {'✅ PASSED (Within 16ms Edge SLA)' if report.sla_compliant else '⚠️ EXCEEDS SLA'}")
    print("=" * 80 + "\n")

    # 5. Optional ONNX Export
    if export_onnx:
        export_model_to_onnx(model, export_onnx)


def main() -> None:
    """CLI Entry Point."""
    parser = argparse.ArgumentParser(
        description="AEGIS-MESH Star Tracker 6DoF Pose Estimation & SPARK 2022 Vision Pipeline"
    )
    parser.add_argument(
        "--data_dir",
        type=str,
        default=None,
        help="Path to SPARK 2022 dataset directory containing images and annotations",
    )
    parser.add_argument(
        "--device",
        type=str,
        choices=["cpu", "cuda", "auto"],
        default="auto",
        help="Execution device ('cpu', 'cuda', or 'auto')",
    )
    parser.add_argument(
        "--batch_size",
        type=int,
        default=1,
        help="Batch size for inference (default 1 for streaming optical feed)",
    )
    parser.add_argument(
        "--num_runs",
        type=int,
        default=100,
        help="Number of iterations for edge latency benchmarking",
    )
    parser.add_argument(
        "--export_onnx",
        type=str,
        default=None,
        help="Path to save exported ONNX model for edge compilation",
    )
    parser.add_argument(
        "--create_mock_dir",
        type=str,
        default=None,
        help="Generate a synthetic SPARK 2022 sample dataset folder for quick testing",
    )

    args = parser.parse_args()

    if args.create_mock_dir:
        create_synthetic_spark_mock_dir(args.create_mock_dir, num_samples=5)
        if not args.data_dir:
            args.data_dir = args.create_mock_dir

    run_star_tracker_pipeline(
        data_dir=args.data_dir,
        device=args.device,
        batch_size=args.batch_size,
        benchmark_runs=args.num_runs,
        export_onnx=args.export_onnx,
    )


if __name__ == "__main__":
    main()

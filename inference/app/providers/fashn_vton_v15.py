"""FASHN VTON v1.5 provider (open-source local model).

Reference:
  - https://huggingface.co/fashn-ai/fashn-vton-1.5
  - https://github.com/fashn-AI/fashn-vton-1.5

Setup on the host (one-time):
  git clone https://github.com/fashn-AI/fashn-vton-1.5.git
  cd fashn-vton-1.5
  pip install -e .
  python scripts/download_weights.py --weights-dir ./weights

Then set in inference/.env:
  PROVIDER=fashn_vton_v15
  FASHN_WEIGHTS_DIR=C:\\path\\to\\fashn-vton-1.5\\weights

GPU: ~8GB VRAM, bfloat16 on Ampere+ (RTX 30/40/50 series).
Torch wheel: cu128 for Blackwell sm_120 (RTX 50-series).
"""

import io
import threading
from typing import Any

from PIL import Image

from ..config import settings
from .base import Provider, TryonInput, TryonOutput

# Module-level pipeline cache. We load the model on the first run() call so:
#   - PROVIDER=mock paths never import torch / fashn_vton
#   - subsequent /tryon calls within the same process reuse the loaded weights
# Guarded by a Lock so two concurrent requests don't both try to load.
_pipeline: Any = None
_pipeline_lock = threading.Lock()


def _normalize_category(raw: str | None) -> str:
    """Map free-text Korean/English category to FASHN's enum.

    FASHN accepts exactly one of: "tops", "bottoms", "one-pieces".
    """
    if not raw:
        return "tops"  # safe default — most uploads in this app are upper-body
    s = raw.strip().lower()
    # English
    if s in ("tops", "top", "shirt", "t-shirt", "tshirt", "blouse", "sweater", "jacket", "coat", "outer", "outerwear"):
        return "tops"
    if s in ("bottoms", "bottom", "pants", "trousers", "jeans", "skirt", "shorts"):
        return "bottoms"
    if s in ("one-pieces", "one-piece", "onepiece", "dress", "jumpsuit", "overall", "overalls"):
        return "one-pieces"
    # Korean
    if any(k in raw for k in ("상의", "티셔츠", "셔츠", "블라우스", "니트", "스웨터", "자켓", "재킷", "코트", "아우터")):
        return "tops"
    if any(k in raw for k in ("하의", "바지", "팬츠", "청바지", "진", "스커트", "치마", "반바지", "쇼츠")):
        return "bottoms"
    if any(k in raw for k in ("원피스", "드레스", "점프수트", "오버올", "멜빵")):
        return "one-pieces"
    return "tops"


def _load_pipeline() -> Any:
    global _pipeline
    if _pipeline is not None:
        return _pipeline
    with _pipeline_lock:
        if _pipeline is not None:
            return _pipeline
        # Imports are lazy so the mock path doesn't pay the torch import cost.
        import torch  # type: ignore[import-not-found]
        from fashn_vton import TryOnPipeline  # type: ignore[import-not-found]

        weights_dir = settings.fashn_weights_dir
        if not weights_dir:
            raise RuntimeError(
                "FASHN_WEIGHTS_DIR is not set. Run "
                "`python scripts/download_weights.py --weights-dir ./weights` "
                "in the fashn-vton-1.5 repo and set FASHN_WEIGHTS_DIR in inference/.env."
            )
        # bfloat16 on Ampere+ (sm_80+). 5070 Ti is Blackwell sm_120 → supported.
        dtype = torch.bfloat16 if torch.cuda.is_available() else torch.float32
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _pipeline = TryOnPipeline.from_pretrained(
            weights_dir,
            torch_dtype=dtype,
        ).to(device)
        return _pipeline


class FashnVtonV15Provider(Provider):
    """FASHN VTON v1.5 (open-source). ~1.94GB weights, ~8GB VRAM."""

    def run(self, inp: TryonInput) -> TryonOutput:
        pipe = _load_pipeline()

        person_img = Image.open(io.BytesIO(inp.person_bytes)).convert("RGB")
        garment_img = Image.open(io.BytesIO(inp.garment_bytes)).convert("RGB")
        category = _normalize_category(inp.category)

        result = pipe(
            person_image=person_img,
            garment_image=garment_img,
            category=category,
            num_timesteps=settings.fashn_num_timesteps,
            guidance_scale=settings.fashn_guidance_scale,
            seed=settings.fashn_seed,
            segmentation_free=settings.fashn_segmentation_free,
        )
        out_img: Image.Image = result.images[0]

        buf = io.BytesIO()
        out_img.save(buf, format="PNG")
        return TryonOutput(
            result_bytes=buf.getvalue(),
            content_type="image/png",
            model_used="fashn-vton-v1.5",
            cost_usd=0.0,  # local model — no per-call cost
        )

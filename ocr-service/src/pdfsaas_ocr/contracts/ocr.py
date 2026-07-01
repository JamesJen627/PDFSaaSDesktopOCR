from __future__ import annotations

from enum import StrEnum

from pdfsaas_ocr.models import ApiModel


class OcrMode(StrEnum):
    FAST = "fast"
    BALANCED = "balanced"
    HIGH_QUALITY = "high-quality"


class OcrBox(ApiModel):
    x: int
    y: int
    w: int
    h: int
    text: str
    confidence: float


class OcrProcessResponse(ApiModel):
    text: str
    boxes: list[OcrBox]
    language: str
    page_index: int
    page_confidence: float

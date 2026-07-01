from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict

OCR_ROOT = Path(__file__).resolve().parents[3]


class ScanPreprocessStrength(StrEnum):
    LIGHT = "light"
    NORMAL = "normal"
    AGGRESSIVE = "aggressive"


class OcrEngineMode(StrEnum):
    AUTO = "auto"
    PADDLE = "paddle"
    STUB = "stub"


class AppSettings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="PDFSAAS_OCR_", extra="ignore")

    host: str = "127.0.0.1"
    port: int = Field(default=5002, validation_alias=AliasChoices("OCR_SERVICE_PORT", "PDFSAAS_OCR_PORT"))
    engine: OcrEngineMode = OcrEngineMode.AUTO
    default_lang: str = "en"
    ocr_version: str = "PP-OCRv4"
    enable_textline_orientation: bool = False
    use_gpu: bool = False
    preload: bool = False
    # PaddlePaddle 3.3.x + oneDNN crashes on Windows CPU (PIR attribute conversion).
    # PaddleOCR must receive enable_mkldnn=False — FLAGS_use_mkldnn alone is not enough.
    enable_mkldnn: bool = False
    enable_scan_preprocess: bool = True
    scan_preprocess_strength: ScanPreprocessStrength = ScanPreprocessStrength.AGGRESSIVE
    enable_highlight_removal: bool = True
    cjk_min_box_confidence: float = 0.45
    version: str = "0.1.0"


@lru_cache
def load_settings() -> AppSettings:
    return AppSettings()

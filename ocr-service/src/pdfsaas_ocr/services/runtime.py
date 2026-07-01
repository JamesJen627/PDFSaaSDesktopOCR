from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Protocol

from PIL import Image

from pdfsaas_ocr.config import AppSettings, load_settings
from pdfsaas_ocr.config.settings import OcrEngineMode
from pdfsaas_ocr.contracts import OcrBox, OcrMode, OcrProcessResponse
from pdfsaas_ocr.services.paddle_adapter import create_paddle_ocr, map_paddle_lang, run_paddle_ocr

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class EngineStatus:
    engine: str
    models_loaded: bool
    gpu_available: bool
    load_error: str | None = None


class OcrEngine(Protocol):
    def status(self) -> EngineStatus: ...

    def recognize(
        self,
        image: Image.Image,
        *,
        page_index: int,
        mode: OcrMode,
        lang: str,
    ) -> OcrProcessResponse: ...


class StubOcrEngine:
    def status(self) -> EngineStatus:
        return EngineStatus(engine="stub", models_loaded=True, gpu_available=False)

    def recognize(
        self,
        image: Image.Image,
        *,
        page_index: int,
        mode: OcrMode,
        lang: str,
    ) -> OcrProcessResponse:
        width, height = image.size
        sample = f"stub:{width}x{height}:{mode.value}:{lang}"
        boxes = _stub_line_boxes(width, height, sample)
        return OcrProcessResponse(
            text=sample,
            boxes=boxes,
            language=_normalize_language(lang),
            page_index=page_index,
            page_confidence=1.0,
        )


def _stub_line_boxes(width: int, height: int, sample: str) -> list[OcrBox]:
    """Simulate line-level OCR boxes spread across the page (not one full-page box)."""
    margin_x = max(10, width // 20)
    line_h = max(24, height // 20)
    gap = max(8, line_h // 3)
    lines = [
        sample,
        "PDFSaaS stub OCR line 2",
        "PDFSaaS stub OCR line 3",
    ]
    boxes: list[OcrBox] = []
    y = max(10, height // 10)
    for line in lines:
        if y + line_h > height - 10:
            break
        boxes.append(
            OcrBox(
                x=margin_x,
                y=y,
                w=max(width - (2 * margin_x), 1),
                h=line_h,
                text=line,
                confidence=1.0,
            )
        )
        y += line_h + gap
    return boxes or [
        OcrBox(
            x=margin_x,
            y=y,
            w=max(width - (2 * margin_x), 1),
            h=line_h,
            text=sample,
            confidence=1.0,
        )
    ]


class PaddleOcrEngine:
    def __init__(self, settings: AppSettings) -> None:
        self._settings = settings
        self._ocr_by_lang: dict[str, Any] = {}
        self._load_error: str | None = None
        self._gpu_available = False

    def warmup(self) -> EngineStatus:
        return self.status()

    def _ensure_loaded(self, lang: str) -> None:
        paddle_lang = map_paddle_lang(lang)
        if paddle_lang in self._ocr_by_lang or self._load_error is not None:
            return

        try:
            self._ocr_by_lang[paddle_lang] = create_paddle_ocr(
                self._settings,
                lang=lang,
                use_textline_orientation=self._settings.enable_textline_orientation,
            )
            self._gpu_available = self._settings.use_gpu
            logger.info("PaddleOCR ready (lang=%s)", paddle_lang)
        except ImportError as exc:
            self._load_error = f"PaddleOCR not installed: {exc}"
            logger.warning(self._load_error)
        except Exception as exc:
            self._load_error = f"PaddleOCR init failed: {exc}"
            logger.exception("PaddleOCR init failed")

    def _resolve_ocr(self, lang: str) -> Any:
        self._ensure_loaded(lang)
        paddle_lang = map_paddle_lang(lang)
        ocr = self._ocr_by_lang.get(paddle_lang)
        if ocr is None:
            message = self._load_error or "PaddleOCR is not available"
            raise RuntimeError(message)
        return ocr

    def status(self) -> EngineStatus:
        self._ensure_loaded(self._settings.default_lang)
        if not self._ocr_by_lang:
            return EngineStatus(
                engine="paddleocr",
                models_loaded=False,
                gpu_available=False,
                load_error=self._load_error,
            )
        return EngineStatus(
            engine="paddleocr",
            models_loaded=True,
            gpu_available=self._gpu_available,
        )

    def recognize(
        self,
        image: Image.Image,
        *,
        page_index: int,
        mode: OcrMode,
        lang: str,
    ) -> OcrProcessResponse:
        ocr = self._resolve_ocr(lang)

        return run_paddle_ocr(
            ocr,
            image,
            mode=mode,
            page_index=page_index,
            lang=lang,
            enable_textline_orientation=self._settings.enable_textline_orientation,
            settings=self._settings,
        )


class OcrRuntime:
    def __init__(self, settings: AppSettings | None = None) -> None:
        self._settings = settings or load_settings()
        self._engine = self._build_engine()
        self._fallback_reason: str | None = None

    @property
    def settings(self) -> AppSettings:
        return self._settings

    def warmup(self) -> EngineStatus:
        if isinstance(self._engine, PaddleOcrEngine):
            return self._engine.warmup()
        return self._engine.status()

    def status(self) -> EngineStatus:
        current = self._engine.status()
        if self._fallback_reason and current.engine == "stub":
            return EngineStatus(
                engine=current.engine,
                models_loaded=current.models_loaded,
                gpu_available=current.gpu_available,
                load_error=self._fallback_reason,
            )
        return current

    def recognize(
        self,
        image: Image.Image,
        *,
        page_index: int,
        mode: OcrMode,
        lang: str,
    ) -> OcrProcessResponse:
        return self._engine.recognize(
            image,
            page_index=page_index,
            mode=mode,
            lang=lang,
        )

    def _build_engine(self) -> OcrEngine:
        mode = self._settings.engine
        if mode is OcrEngineMode.STUB:
            return StubOcrEngine()
        if mode is OcrEngineMode.PADDLE:
            return PaddleOcrEngine(self._settings)

        paddle = PaddleOcrEngine(self._settings)
        if self._settings.preload:
            paddle_status = paddle.warmup()
            if paddle_status.models_loaded:
                return paddle
            self._fallback_reason = paddle_status.load_error or "PaddleOCR unavailable"
        else:
            try:
                from paddleocr import PaddleOCR  # noqa: F401
            except ImportError as exc:
                self._fallback_reason = f"PaddleOCR not installed: {exc}"
                logger.warning(
                    "PaddleOCR unavailable; falling back to stub engine (%s)",
                    self._fallback_reason,
                )
                return StubOcrEngine()
            return paddle


_runtime: OcrRuntime | None = None


def get_runtime() -> OcrRuntime:
    global _runtime
    if _runtime is None:
        _runtime = OcrRuntime()
    return _runtime


def reset_runtime() -> None:
    global _runtime
    _runtime = None


def _normalize_language(lang: str) -> str:
    normalized = lang.strip().lower()
    if normalized in {"ch", "zh", "zh-cn", "zh-tw", "ch+en"}:
        return "zh"
    if normalized == "en":
        return "en"
    return normalized or "zh"

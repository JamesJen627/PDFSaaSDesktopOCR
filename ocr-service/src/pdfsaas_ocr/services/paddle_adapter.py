from __future__ import annotations

import inspect
import logging
from typing import Any

import numpy as np
from PIL import Image

from pdfsaas_ocr.config import AppSettings
from pdfsaas_ocr.contracts import OcrBox, OcrMode, OcrProcessResponse
from pdfsaas_ocr.services.cjk_cleanup import apply_cjk_cleanup
from pdfsaas_ocr.services.image_preprocess import is_cjk_lang, preprocess_scan_image
from pdfsaas_ocr.services.latin_spacing import reflow_latin_ocr_text
from pdfsaas_ocr.services.paddle_env import configure_paddle_runtime

logger = logging.getLogger(__name__)


def map_paddle_lang(lang: str) -> str:
    normalized = lang.strip().lower()
    if normalized in {"en", "english"}:
        return "en"
    if normalized in {"ch+en", "ch_en"}:
        return "ch"
    return "ch"


def create_paddle_ocr(
    settings: AppSettings, *, lang: str, use_textline_orientation: bool
) -> Any:
    configure_paddle_runtime(settings)
    from paddleocr import PaddleOCR

    paddle_lang = map_paddle_lang(lang)
    params = inspect.signature(PaddleOCR.__init__).parameters

    orientation = use_textline_orientation

    kwargs: dict[str, Any] = {
        "lang": paddle_lang,
        "ocr_version": settings.ocr_version,
        "enable_mkldnn": settings.enable_mkldnn,
    }

    if "use_textline_orientation" in params:
        kwargs["use_doc_orientation_classify"] = False
        kwargs["use_doc_unwarping"] = False
        kwargs["use_textline_orientation"] = orientation
    else:
        kwargs["use_angle_cls"] = orientation
        if "use_gpu" in params:
            kwargs["use_gpu"] = settings.use_gpu

    logger.info(
        "Initializing PaddleOCR (%s) — first run may download models to ~/.paddlex/official_models",
        ", ".join(f"{k}={v!r}" for k, v in kwargs.items()),
    )
    return PaddleOCR(**kwargs)


def run_paddle_ocr(
    ocr: Any,
    image: Image.Image,
    *,
    mode: OcrMode,
    page_index: int,
    lang: str,
    enable_textline_orientation: bool = False,
    settings: AppSettings | None = None,
) -> OcrProcessResponse:
    active_settings = settings or AppSettings()
    working = image
    if active_settings.enable_scan_preprocess and is_cjk_lang(lang):
        working = preprocess_scan_image(
            working,
            strength=active_settings.scan_preprocess_strength,
            remove_highlights=active_settings.enable_highlight_removal,
        )

    rgb = working.convert("RGB")
    array = np.array(rgb)
    use_orientation = mode != OcrMode.FAST and enable_textline_orientation

    if hasattr(ocr, "predict"):
        predict_params = inspect.signature(ocr.predict).parameters
        predict_kwargs: dict[str, Any] = {}
        if "use_textline_orientation" in predict_params:
            predict_kwargs["use_textline_orientation"] = use_orientation
        if mode is OcrMode.HIGH_QUALITY and "text_rec_score_thresh" in predict_params:
            predict_kwargs["text_rec_score_thresh"] = 0.3
        pages = ocr.predict(array, **predict_kwargs)
        if not pages:
            return _empty_response(page_index, lang)
        return _apply_postprocess(
            _parse_paddle_v3_page(pages[0], page_index=page_index, lang=lang),
            lang=lang,
            settings=active_settings,
        )

    legacy = ocr.ocr(array, cls=use_orientation)
    return _apply_postprocess(
        _parse_paddle_v2_result(legacy, page_index=page_index, lang=lang),
        lang=lang,
        settings=active_settings,
    )


def _apply_postprocess(
    response: OcrProcessResponse,
    *,
    lang: str,
    settings: AppSettings,
) -> OcrProcessResponse:
    response = _apply_latin_spacing(response)
    if is_cjk_lang(lang):
        return apply_cjk_cleanup(response, min_confidence=settings.cjk_min_box_confidence)
    return response


def _apply_latin_spacing(response: OcrProcessResponse) -> OcrProcessResponse:
    fixed_boxes = [
        OcrBox(
            x=box.x,
            y=box.y,
            w=box.w,
            h=box.h,
            text=reflow_latin_ocr_text(box.text),
            confidence=box.confidence,
        )
        for box in response.boxes
    ]
    fixed_lines = [reflow_latin_ocr_text(box.text) for box in fixed_boxes]
    return OcrProcessResponse(
        text="\n".join(fixed_lines),
        boxes=fixed_boxes,
        language=response.language,
        page_index=response.page_index,
        page_confidence=response.page_confidence,
    )


def _parse_paddle_v3_page(page: Any, *, page_index: int, lang: str) -> OcrProcessResponse:
    texts = list(page["rec_texts"] if "rec_texts" in page else [])
    scores = list(page["rec_scores"] if "rec_scores" in page else [])
    polys = page["rec_polys"] if "rec_polys" in page else page.get("rec_boxes", [])

    boxes: list[OcrBox] = []
    lines: list[str] = []
    confidences: list[float] = []

    for index, raw_text in enumerate(texts):
        text = str(raw_text).strip()
        if not text:
            continue
        confidence = float(scores[index]) if index < len(scores) else 0.0
        if index >= len(polys):
            continue
        poly = polys[index]
        xs = [int(point[0]) for point in poly]
        ys = [int(point[1]) for point in poly]
        x = min(xs)
        y = min(ys)
        w = max(max(xs) - x, 1)
        h = max(max(ys) - y, 1)
        boxes.append(OcrBox(x=x, y=y, w=w, h=h, text=text, confidence=confidence))
        lines.append(text)
        confidences.append(confidence)

    page_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return OcrProcessResponse(
        text="\n".join(lines),
        boxes=boxes,
        language=_normalize_language(lang),
        page_index=page_index,
        page_confidence=page_confidence,
    )


def _parse_paddle_v2_result(result: Any, *, page_index: int, lang: str) -> OcrProcessResponse:
    boxes: list[OcrBox] = []
    lines: list[str] = []
    confidences: list[float] = []

    for block in result or []:
        for item in block or []:
            if not item or len(item) < 2:
                continue
            points, payload = item[0], item[1]
            if not payload or len(payload) < 2:
                continue
            text = str(payload[0]).strip()
            confidence = float(payload[1])
            if not text:
                continue
            xs = [int(point[0]) for point in points]
            ys = [int(point[1]) for point in points]
            x = min(xs)
            y = min(ys)
            w = max(max(xs) - x, 1)
            h = max(max(ys) - y, 1)
            boxes.append(OcrBox(x=x, y=y, w=w, h=h, text=text, confidence=confidence))
            lines.append(text)
            confidences.append(confidence)

    page_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return OcrProcessResponse(
        text="\n".join(lines),
        boxes=boxes,
        language=_normalize_language(lang),
        page_index=page_index,
        page_confidence=page_confidence,
    )


def _empty_response(page_index: int, lang: str) -> OcrProcessResponse:
    return OcrProcessResponse(
        text="",
        boxes=[],
        language=_normalize_language(lang),
        page_index=page_index,
        page_confidence=0.0,
    )


def _normalize_language(lang: str) -> str:
    normalized = lang.strip().lower()
    if normalized in {"ch", "zh", "zh-cn", "zh-tw", "ch+en"}:
        return "zh"
    if normalized == "en":
        return "en"
    return normalized or "zh"

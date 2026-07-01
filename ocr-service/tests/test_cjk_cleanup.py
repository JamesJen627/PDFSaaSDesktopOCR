from __future__ import annotations

from pdfsaas_ocr.contracts import OcrBox, OcrProcessResponse
from pdfsaas_ocr.services.cjk_cleanup import (
    apply_cjk_cleanup,
    normalize_cjk_text,
    should_drop_cjk_box,
)


def test_normalize_cjk_text_nfkc_and_noise() -> None:
    assert normalize_cjk_text("⺠族") == "民族"
    assert normalize_cjk_text("世界^把握") == "世界把握"
    assert normalize_cjk_text("真理、.:改造") == "真理、改造"
    assert normalize_cjk_text("马克患主义") == "马克思主义"
    assert normalize_cjk_text("建筑,梦想") == "建筑，梦想"


def test_should_drop_junk_boxes() -> None:
    assert should_drop_cjk_box("^", 0.99, 0.45) is True
    assert should_drop_cjk_box("民族", 0.9, 0.45) is False
    assert should_drop_cjk_box("|", 0.2, 0.45) is True
    assert should_drop_cjk_box(",", 0.35, 0.45) is False
    assert should_drop_cjk_box("，", 0.35, 0.45) is False
    assert should_drop_cjk_box("。", 0.30, 0.45) is False


def test_apply_cjk_cleanup_filters_boxes() -> None:
    response = OcrProcessResponse(
        text="",
        boxes=[
            OcrBox(x=0, y=0, w=10, h=10, text="^", confidence=0.95),
            OcrBox(x=0, y=20, w=40, h=10, text="⺠族", confidence=0.92),
        ],
        language="zh",
        page_index=1,
        page_confidence=0.9,
    )
    cleaned = apply_cjk_cleanup(response, min_confidence=0.45)
    assert len(cleaned.boxes) == 1
    assert cleaned.boxes[0].text == "民族"
    assert cleaned.text == "民族"

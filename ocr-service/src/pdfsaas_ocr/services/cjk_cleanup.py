from __future__ import annotations

import re
import unicodedata

from pdfsaas_ocr.contracts import OcrBox, OcrProcessResponse

_CJK = re.compile(r"[\u4e00-\u9fff]")
_CJK_PUNCT = re.compile(
    r"[\u3000-\u303f\uff00-\uffef"
    r"，。、；：？！（）《》【】「」『』—…]"
)
_SPURIOUS = re.compile(r"[\^|]")
_DOT_NOISE = re.compile(r"\.{2,}:?")
_JUNK_ONLY = re.compile(r"^[\^|·]+$")
_JUNK_DOT_RUN = re.compile(r"^\.{2,}:?$")

_PHRASE_FIXES: tuple[tuple[str, str], ...] = (
    ("马克患主义", "马克思主义"),
    ("马克患主", "马克思主"),
    ("改姜", "改变"),
)

# Half-width punctuation OCR'd inside Chinese lines → full-width (reference PDF style).
_HALF_TO_FULL_PUNCT: dict[str, str] = {
    ",": "，",
    ".": "。",
    ";": "；",
    ":": "：",
    "?": "？",
    "!": "！",
    "(": "（",
    ")": "）",
}


def _normalize_mixed_cjk_punctuation(text: str) -> str:
    if not _CJK.search(text):
        return text
    return "".join(_HALF_TO_FULL_PUNCT.get(ch, ch) for ch in text)
_RADICAL_FORMS: tuple[tuple[str, str], ...] = (
    ("⺠", "民"),
    ("⻢", "马"),
    ("⻔", "门"),
    ("⻓", "长"),
    ("⻅", "见"),
    ("⼂", ""),
    ("·", ""),
)


def normalize_cjk_text(text: str) -> str:
    if not text:
        return ""
    normalized = unicodedata.normalize("NFKC", text.strip())
    for wrong, right in _RADICAL_FORMS:
        normalized = normalized.replace(wrong, right)
    normalized = _SPURIOUS.sub("", normalized)
    normalized = _DOT_NOISE.sub("", normalized)
    normalized = normalized.replace(".:", "")
    for wrong, right in _PHRASE_FIXES:
        normalized = normalized.replace(wrong, right)
    normalized = _normalize_mixed_cjk_punctuation(normalized)
    return normalized.strip()


def _is_keepworthy_punctuation(text: str) -> bool:
    if _CJK_PUNCT.search(text):
        return True
    return text in _HALF_TO_FULL_PUNCT or text in _HALF_TO_FULL_PUNCT.values()


def should_drop_cjk_box(text: str, confidence: float, min_confidence: float) -> bool:
    cleaned = normalize_cjk_text(text)
    if not cleaned:
        return True
    if _JUNK_DOT_RUN.fullmatch(cleaned):
        return True
    if _JUNK_ONLY.fullmatch(cleaned):
        return True
    if len(cleaned) == 1 and confidence < min_confidence:
        if _CJK.search(cleaned) or _is_keepworthy_punctuation(cleaned):
            return False
        return True
    return False


def apply_cjk_cleanup(response: OcrProcessResponse, *, min_confidence: float) -> OcrProcessResponse:
    kept_boxes: list[OcrBox] = []
    lines: list[str] = []
    confidences: list[float] = []

    for box in response.boxes:
        if should_drop_cjk_box(box.text, box.confidence, min_confidence):
            continue
        text = normalize_cjk_text(box.text)
        if not text:
            continue
        kept_boxes.append(
            OcrBox(
                x=box.x,
                y=box.y,
                w=box.w,
                h=box.h,
                text=text,
                confidence=box.confidence,
            )
        )
        lines.append(text)
        confidences.append(box.confidence)

    page_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    return OcrProcessResponse(
        text="\n".join(lines),
        boxes=kept_boxes,
        language=response.language,
        page_index=response.page_index,
        page_confidence=page_confidence,
    )

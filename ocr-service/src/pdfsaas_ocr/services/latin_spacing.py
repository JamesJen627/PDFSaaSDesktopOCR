from __future__ import annotations

import re

try:
    import wordninja
except ImportError:  # pragma: no cover - optional until paddle extra installed
    wordninja = None  # type: ignore[assignment]

_LATIN_LETTER = re.compile(r"[A-Za-z]")
_TOKEN = re.compile(r"[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*|[^\sA-Za-z0-9]+|\s+")
_SHOULD_SPLIT = re.compile(
    r"^[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*$",
)


def reflow_latin_ocr_text(text: str) -> str:
    """Insert missing spaces in glued Latin OCR tokens (e.g. arebuilt → are built)."""
    if not text or wordninja is None or not _LATIN_LETTER.search(text):
        return text

    parts: list[str] = []
    for token in _TOKEN.finditer(text):
        segment = token.group(0)
        if segment.isspace() or not _SHOULD_SPLIT.fullmatch(segment):
            parts.append(segment)
            continue
        parts.append(_split_latin_token(segment))
    return "".join(parts)


def _split_latin_token(token: str) -> str:
    if len(token) <= 3 or " " in token:
        return token

    if "-" in token:
        head, tail = token.split("-", 1)
        if head.isdigit() and tail.isalpha():
            return f"{head}-{_split_latin_token(tail)}"
        return "-".join(_split_latin_token(part) for part in token.split("-"))

    if token.isupper() and len(token) <= 4:
        return token

    pieces = wordninja.split(token)
    if len(pieces) <= 1:
        return token
    return " ".join(pieces)

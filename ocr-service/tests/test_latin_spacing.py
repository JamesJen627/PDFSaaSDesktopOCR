from __future__ import annotations

import pytest

wordninja = pytest.importorskip("wordninja")

from pdfsaas_ocr.services.latin_spacing import reflow_latin_ocr_text  # noqa: E402


def test_splits_glued_words() -> None:
    assert reflow_latin_ocr_text("arebuilt") == "are built"
    assert reflow_latin_ocr_text("areshipping") == "are shipping"


def test_preserves_existing_spaces_and_punctuation() -> None:
    raw = "AI is reshaping how startups are built."
    assert reflow_latin_ocr_text(raw) == raw


def test_fixes_user_sample_fragment() -> None:
    raw = (
        "AI is reshaping how startups arebuilt.Founders who've never written a line of "
        "code areshippingproduction applications today,and thelean10-personunicorn"
    )
    fixed = reflow_latin_ocr_text(raw)
    assert "are built" in fixed
    assert "are shipping" in fixed
    assert "the lean" in fixed
    assert "10-person" in fixed or "10 person" in fixed


def test_keeps_short_tokens() -> None:
    assert reflow_latin_ocr_text("AI") == "AI"

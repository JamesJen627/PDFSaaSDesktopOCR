from __future__ import annotations

from pdfsaas_ocr.services.golden_compare import compare_golden_text, normalize_golden_text, text_similarity


def test_text_similarity_ignores_whitespace() -> None:
    left = "一个民族\n要走在时代前列"
    right = "一个民族 要走在时代前列"
    assert text_similarity(left, right) >= 0.99


def test_compare_golden_text_must_contain() -> None:
    result = compare_golden_text(
        "马克思主义是中国共产党的指导思想",
        "马克思主义",
        min_similarity=0.0,
        must_contain=["马克思主义", "中国共产党"],
    )
    assert result.missing_phrases == ()


def test_compare_golden_text_reports_missing_and_forbidden() -> None:
    result = compare_golden_text(
        "马克患主义 ^",
        "马克思主义",
        min_similarity=0.0,
        must_contain=["民族"],
        must_not_contain=["^", "马克患"],
    )
    assert "民族" in result.missing_phrases
    assert "^" in result.forbidden_phrases
    assert not result.ok


def test_normalize_golden_text_nfkc() -> None:
    assert normalize_golden_text("⺠族") == "民族"

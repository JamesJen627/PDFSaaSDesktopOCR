from __future__ import annotations

import importlib.util
from pathlib import Path

import pytest

from pdfsaas_ocr.services.golden_compare import evaluate_golden_case, runnable_e2e_cases

E2E_ROOT = Path(__file__).resolve().parent / "fixtures" / "golden" / "e2e"


def _paddle_available() -> bool:
    return importlib.util.find_spec("paddleocr") is not None


@pytest.mark.skipif(not _paddle_available(), reason="PaddleOCR not installed (uv sync --group paddle)")
def test_golden_e2e_cases_with_local_images() -> None:
    cases = runnable_e2e_cases(E2E_ROOT)
    if not cases:
        pytest.skip(
            "No runnable e2e golden cases — add page.png under tests/fixtures/golden/e2e/*/ "
            "(see tests/fixtures/golden/e2e/README.md)"
        )

    for case in cases:
        result = evaluate_golden_case(case)
        assert result.ok, (
            f"{case.id}: similarity={result.similarity:.3f}, "
            f"missing={result.missing_phrases}, forbidden={result.forbidden_phrases}\n"
            + "\n".join(result.diff_lines[:40])
        )

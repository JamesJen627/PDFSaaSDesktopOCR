from __future__ import annotations

import json
from pathlib import Path

from pdfsaas_ocr.contracts import OcrBox, OcrProcessResponse
from pdfsaas_ocr.services.cjk_cleanup import apply_cjk_cleanup

FIXTURES_DIR = Path(__file__).resolve().parent / "fixtures" / "golden"


def _load_golden_cases() -> list[dict]:
    cases: list[dict] = []
    for path in sorted(FIXTURES_DIR.glob("*.json")):
        cases.append(json.loads(path.read_text(encoding="utf-8")))
    return cases


def _response_from_case(case: dict) -> OcrProcessResponse:
    boxes = [
        OcrBox(
            x=0,
            y=index * 20,
            w=100,
            h=18,
            text=str(entry["text"]),
            confidence=float(entry.get("confidence", 0.9)),
        )
        for index, entry in enumerate(case["raw_boxes"])
    ]
    return OcrProcessResponse(
        text="\n".join(box.text for box in boxes),
        boxes=boxes,
        language="zh",
        page_index=1,
        page_confidence=0.9,
    )


def test_golden_cjk_cleanup_cases() -> None:
    cases = _load_golden_cases()
    assert cases, "expected at least one golden fixture"

    for case in cases:
        cleaned = apply_cjk_cleanup(
            _response_from_case(case),
            min_confidence=float(case.get("min_confidence", 0.45)),
        )
        combined = cleaned.text

        for phrase in case.get("must_contain", []):
            assert phrase in combined, f"{case['id']}: missing {phrase!r} in {combined!r}"

        for phrase in case.get("must_not_contain", []):
            assert phrase not in combined, f"{case['id']}: forbidden {phrase!r} in {combined!r}"

        assert "^" not in combined
        assert cleaned.boxes, f"{case['id']}: all boxes were filtered out"

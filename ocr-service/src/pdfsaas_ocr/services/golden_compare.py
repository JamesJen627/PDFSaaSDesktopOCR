from __future__ import annotations

import difflib
import json
from dataclasses import dataclass
from pathlib import Path

from PIL import Image

from pdfsaas_ocr.config import AppSettings
from pdfsaas_ocr.config.settings import OcrEngineMode
from pdfsaas_ocr.contracts import OcrMode, OcrProcessResponse
from pdfsaas_ocr.services.cjk_cleanup import normalize_cjk_text
from pdfsaas_ocr.services.runtime import OcrRuntime


@dataclass(frozen=True)
class GoldenE2eCase:
    id: str
    description: str
    lang: str
    mode: OcrMode
    image_path: Path
    expected_path: Path
    min_similarity: float
    must_contain: tuple[str, ...]
    must_not_contain: tuple[str, ...]
    case_dir: Path


@dataclass(frozen=True)
class GoldenCompareResult:
    ok: bool
    similarity: float
    actual_text: str
    expected_text: str
    missing_phrases: tuple[str, ...]
    forbidden_phrases: tuple[str, ...]
    diff_lines: tuple[str, ...]


def normalize_golden_text(text: str) -> str:
    normalized = normalize_cjk_text(text.replace("\r\n", "\n").strip())
    return " ".join(normalized.split())


def text_similarity(actual: str, expected: str) -> float:
    left = normalize_golden_text(actual)
    right = normalize_golden_text(expected)
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    return difflib.SequenceMatcher(a=right, b=left).ratio()


def compare_golden_text(
    actual: str,
    expected: str,
    *,
    min_similarity: float = 0.9,
    must_contain: list[str] | tuple[str, ...] | None = None,
    must_not_contain: list[str] | tuple[str, ...] | None = None,
    diff_context: int = 2,
) -> GoldenCompareResult:
    similarity = text_similarity(actual, expected)
    combined = normalize_golden_text(actual)

    missing = tuple(
        phrase for phrase in (must_contain or ()) if phrase not in actual and phrase not in combined
    )
    forbidden = tuple(
        phrase for phrase in (must_not_contain or ()) if phrase in actual or phrase in combined
    )

    ok = similarity >= min_similarity and not missing and not forbidden

    diff_lines: list[str] = []
    if not ok:
        diff_lines = list(
            difflib.unified_diff(
                expected.replace("\r\n", "\n").strip().splitlines(),
                actual.replace("\r\n", "\n").strip().splitlines(),
                fromfile="expected",
                tofile="actual",
                lineterm="",
                n=diff_context,
            )
        )

    return GoldenCompareResult(
        ok=ok,
        similarity=similarity,
        actual_text=actual,
        expected_text=expected,
        missing_phrases=missing,
        forbidden_phrases=forbidden,
        diff_lines=tuple(diff_lines),
    )


def load_e2e_case(manifest_path: Path) -> GoldenE2eCase:
    payload = json.loads(manifest_path.read_text(encoding="utf-8"))
    case_dir = manifest_path.parent
    image_name = str(payload.get("image", "page.png"))
    expected_name = str(payload.get("expected", "expected.txt"))
    mode_raw = str(payload.get("mode", "high-quality"))
    try:
        mode = OcrMode(mode_raw)
    except ValueError:
        mode = OcrMode.HIGH_QUALITY

    return GoldenE2eCase(
        id=str(payload["id"]),
        description=str(payload.get("description", payload["id"])),
        lang=str(payload.get("lang", "ch")),
        mode=mode,
        image_path=case_dir / image_name,
        expected_path=case_dir / expected_name,
        min_similarity=float(payload.get("min_similarity", 0.9)),
        must_contain=tuple(payload.get("must_contain", ())),
        must_not_contain=tuple(payload.get("must_not_contain", ())),
        case_dir=case_dir,
    )


def discover_e2e_cases(root: Path) -> list[GoldenE2eCase]:
    if not root.is_dir():
        return []
    cases: list[GoldenE2eCase] = []
    for manifest in sorted(root.glob("*/manifest.json")):
        cases.append(load_e2e_case(manifest))
    return cases


def runnable_e2e_cases(root: Path) -> list[GoldenE2eCase]:
    return [
        case
        for case in discover_e2e_cases(root)
        if case.image_path.is_file() and case.expected_path.is_file()
    ]


def run_golden_ocr(case: GoldenE2eCase, *, settings: AppSettings | None = None) -> OcrProcessResponse:
    active_settings = settings or AppSettings(engine=OcrEngineMode.PADDLE, preload=True)
    runtime = OcrRuntime(active_settings)
    image = Image.open(case.image_path)
    return runtime.recognize(
        image,
        page_index=1,
        mode=case.mode,
        lang=case.lang,
    )


def evaluate_golden_case(
    case: GoldenE2eCase,
    *,
    settings: AppSettings | None = None,
) -> GoldenCompareResult:
    response = run_golden_ocr(case, settings=settings)
    expected = case.expected_path.read_text(encoding="utf-8")
    return compare_golden_text(
        response.text,
        expected,
        min_similarity=case.min_similarity,
        must_contain=case.must_contain,
        must_not_contain=case.must_not_contain,
    )

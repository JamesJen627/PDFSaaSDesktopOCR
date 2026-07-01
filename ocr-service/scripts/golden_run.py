#!/usr/bin/env python3
"""Run Paddle OCR on a golden e2e case and compare against expected.txt."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pdfsaas_ocr.services.golden_compare import (  # noqa: E402
    compare_golden_text,
    discover_e2e_cases,
    load_e2e_case,
    runnable_e2e_cases,
    run_golden_ocr,
)

DEFAULT_E2E_ROOT = ROOT / "tests" / "fixtures" / "golden" / "e2e"


def main() -> int:
    parser = argparse.ArgumentParser(description="Run golden Paddle OCR e2e comparison")
    parser.add_argument(
        "--case",
        type=str,
        help="Case id (subdirectory name under e2e fixtures). Runs all runnable cases if omitted.",
    )
    parser.add_argument(
        "--root",
        type=Path,
        default=DEFAULT_E2E_ROOT,
        help="Golden e2e fixtures root directory",
    )
    parser.add_argument(
        "--write-actual",
        type=Path,
        help="Optional path to write OCR output text",
    )
    parser.add_argument(
        "--list",
        action="store_true",
        help="List discovered cases and whether page.png is present",
    )
    args = parser.parse_args()

    if args.list:
        for case in discover_e2e_cases(args.root):
            image_ok = case.image_path.is_file()
            expected_ok = case.expected_path.is_file()
            status = "ready" if image_ok and expected_ok else "missing-image" if not image_ok else "missing-expected"
            print(f"{case.id}\t{status}\t{case.case_dir}")
        return 0

    if args.case:
        manifest = args.root / args.case / "manifest.json"
        if not manifest.is_file():
            print(f"Case not found: {manifest}", file=sys.stderr)
            return 2
        case = load_e2e_case(manifest)
        if not case.image_path.is_file():
            print(
                f"Missing image: {case.image_path}\n"
                "Add page.png to the case directory (see tests/fixtures/golden/e2e/README.md).",
                file=sys.stderr,
            )
            return 2
        cases = [case]
    else:
        cases = runnable_e2e_cases(args.root)
        if not cases:
            print(
                "No runnable golden e2e cases (need page.png + expected.txt under e2e/*/).",
                file=sys.stderr,
            )
            return 2

    exit_code = 0
    for case in cases:
        print(f"=== {case.id} ({case.description}) ===")
        response = run_golden_ocr(case)
        actual_text = response.text
        write_actual = args.write_actual
        if write_actual:
            target = write_actual if len(cases) == 1 else case.case_dir / "actual.txt"
            target.write_text(actual_text, encoding="utf-8")
            print(f"Wrote actual OCR text to {target}")

        expected = case.expected_path.read_text(encoding="utf-8")
        result = compare_golden_text(
            actual_text,
            expected,
            min_similarity=case.min_similarity,
            must_contain=case.must_contain,
            must_not_contain=case.must_not_contain,
        )
        print(f"Similarity: {result.similarity * 100:.2f}% (min {case.min_similarity * 100:.1f}%)")
        if result.missing_phrases:
            print(f"Missing phrases: {', '.join(result.missing_phrases)}")
        if result.forbidden_phrases:
            print(f"Forbidden phrases: {', '.join(result.forbidden_phrases)}")
        if result.ok:
            print("OK")
        else:
            exit_code = 1
            for line in result.diff_lines:
                print(line)
        print()

    return exit_code


if __name__ == "__main__":
    sys.exit(main())

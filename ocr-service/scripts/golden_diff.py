#!/usr/bin/env python3
"""Compare OCR text output against a golden reference (character-level diff summary)."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from pdfsaas_ocr.services.golden_compare import compare_golden_text, text_similarity  # noqa: E402


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Diff OCR output against golden reference text")
    parser.add_argument("actual", type=Path, help="Actual OCR text file")
    parser.add_argument("expected", type=Path, help="Expected golden text file")
    parser.add_argument("--context", type=int, default=2, help="Unified diff context lines")
    parser.add_argument(
        "--min-similarity",
        type=float,
        default=None,
        help="Minimum similarity ratio (0-1) to exit 0",
    )
    parser.add_argument(
        "--manifest",
        type=Path,
        default=None,
        help="Optional manifest.json for must_contain / must_not_contain / min_similarity",
    )
    parser.add_argument(
        "--must-contain",
        action="append",
        default=[],
        help="Phrase required in actual text (repeatable)",
    )
    parser.add_argument(
        "--must-not-contain",
        action="append",
        default=[],
        help="Phrase forbidden in actual text (repeatable)",
    )
    args = parser.parse_args()

    actual = read_text(args.actual)
    expected = read_text(args.expected)

    min_similarity = args.min_similarity
    must_contain = list(args.must_contain)
    must_not_contain = list(args.must_not_contain)

    if args.manifest is not None:
        payload = json.loads(args.manifest.read_text(encoding="utf-8"))
        if min_similarity is None:
            min_similarity = float(payload.get("min_similarity", 0.9))
        must_contain.extend(payload.get("must_contain", []))
        must_not_contain.extend(payload.get("must_not_contain", []))

    if min_similarity is None:
        if actual == expected:
            print("OK — texts match")
            return 0
        ratio = text_similarity(actual, expected)
        print(f"Similarity: {ratio * 100:.2f}%")
        result = compare_golden_text(actual, expected, min_similarity=0.0, diff_context=args.context)
        for line in result.diff_lines:
            print(line)
        return 1

    result = compare_golden_text(
        actual,
        expected,
        min_similarity=min_similarity,
        must_contain=must_contain,
        must_not_contain=must_not_contain,
        diff_context=args.context,
    )
    print(f"Similarity: {result.similarity * 100:.2f}% (min {min_similarity * 100:.1f}%)")
    if result.missing_phrases:
        print(f"Missing: {', '.join(result.missing_phrases)}")
    if result.forbidden_phrases:
        print(f"Forbidden: {', '.join(result.forbidden_phrases)}")
    if result.ok:
        print("OK")
        return 0
    for line in result.diff_lines:
        print(line)
    return 1


if __name__ == "__main__":
    sys.exit(main())

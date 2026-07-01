#!/usr/bin/env python3
"""Scaffold a golden e2e OCR case directory (manifest + copy image/expected)."""

from __future__ import annotations

import argparse
import json
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_E2E_ROOT = ROOT / "tests" / "fixtures" / "golden" / "e2e"


def main() -> int:
    parser = argparse.ArgumentParser(description="Create a golden Paddle OCR e2e case")
    parser.add_argument("case_id", help="Case id / subdirectory name")
    parser.add_argument("--image", type=Path, required=True, help="Source page image (PNG/JPG)")
    parser.add_argument("--expected", type=Path, required=True, help="Golden reference .txt")
    parser.add_argument("--root", type=Path, default=DEFAULT_E2E_ROOT)
    parser.add_argument("--lang", default="ch")
    parser.add_argument("--mode", default="high-quality")
    parser.add_argument("--min-similarity", type=float, default=0.9)
    parser.add_argument("--description", default="")
    parser.add_argument(
        "--must-contain",
        action="append",
        default=[],
        help="Phrase that must appear in OCR output (repeatable)",
    )
    parser.add_argument(
        "--must-not-contain",
        action="append",
        default=[],
        help="Phrase that must not appear (repeatable)",
    )
    args = parser.parse_args()

    case_dir = args.root / args.case_id
    case_dir.mkdir(parents=True, exist_ok=True)

    image_dest = case_dir / "page.png"
    expected_dest = case_dir / "expected.txt"
    shutil.copy2(args.image, image_dest)
    shutil.copy2(args.expected, expected_dest)

    manifest = {
        "id": args.case_id,
        "description": args.description or f"Golden e2e case {args.case_id}",
        "lang": args.lang,
        "mode": args.mode,
        "image": "page.png",
        "expected": "expected.txt",
        "min_similarity": args.min_similarity,
        "must_contain": args.must_contain,
        "must_not_contain": args.must_not_contain,
    }
    manifest_path = case_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    print(f"Created {case_dir}")
    print(f"  {image_dest.name}")
    print(f"  {expected_dest.name}")
    print(f"  {manifest_path.name}")
    print()
    print("Run comparison:")
    print(f"  uv run python scripts/golden_run.py --case {args.case_id}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

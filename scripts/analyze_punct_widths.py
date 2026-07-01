#!/usr/bin/env python3
"""Compare Han vs punctuation glyph width ratios in reference double-layer PDF."""

from __future__ import annotations

import re
import statistics as stats
import sys
from collections import Counter
from pathlib import Path

import fitz

HAN = re.compile(r"[\u4e00-\u9fff]")
PUNCT = re.compile(r"[\u3000-\u303f\uff00-\uffef]")


def analyze(path: Path, max_pages: int = 20) -> None:
    doc = fitz.open(path)
    han_ratios: list[float] = []
    punct_samples: list[tuple[str, float]] = []

    for page_index in range(min(max_pages, doc.page_count)):
        for block in doc[page_index].get_text("rawdict")["blocks"]:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                for span in line.get("spans", []):
                    for char in span.get("chars", []):
                        glyph = char.get("c", "")
                        x0, y0, x1, y1 = char["bbox"]
                        width = max(x1 - x0, 0.1)
                        height = max(y1 - y0, 0.1)
                        ratio = width / height
                        if HAN.match(glyph):
                            han_ratios.append(ratio)
                        elif PUNCT.match(glyph) or not glyph.isalnum():
                            punct_samples.append((glyph, ratio))

    doc.close()

    print(f"Han w/h median={stats.median(han_ratios):.3f} n={len(han_ratios)}")
    if punct_samples:
        print(
            f"Punct w/h median={stats.median(r for _, r in punct_samples):.3f} "
            f"n={len(punct_samples)}"
        )
        for glyph, _ in Counter(g for g, _ in punct_samples).most_common(15):
            ratios = [r for g, r in punct_samples if g == glyph]
            print(
                f"  {glyph!r} count={len(ratios)} "
                f"w/h median={stats.median(ratios):.3f}"
            )


if __name__ == "__main__":
    pdf = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else r"D:\黄帝内经《素问》白话文图解\黄帝内经《素问》白话文图解_1.pdf"
    )
    analyze(pdf)

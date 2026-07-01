#!/usr/bin/env python3
"""Analyze a professionally converted double-layer PDF for text-layer calibration."""

from __future__ import annotations

import statistics as stats
import sys
from pathlib import Path

import fitz


def analyze(path: Path, max_pages: int = 20) -> None:
    doc = fitz.open(path)
    print(f"pages={doc.page_count}")

    for pi in [0, 1, 2, min(5, doc.page_count - 1)]:
        page = doc[pi]
        print(f"\n=== page {pi + 1} {page.rect.width:.1f}x{page.rect.height:.1f} ===")
        blocks = page.get_text("dict")["blocks"]
        img_count = sum(1 for b in blocks if b.get("type") == 1)
        text_spans: list[dict] = []
        for b in blocks:
            if b.get("type") != 0:
                continue
            for line in b.get("lines", []):
                for span in line.get("spans", []):
                    text = span.get("text", "").strip()
                    if not text:
                        continue
                    x0, y0, x1, y1 = span["bbox"]
                    h = max(y1 - y0, 0.1)
                    fs = span.get("size", 0)
                    text_spans.append(
                        {
                            "text": text[:20],
                            "w": x1 - x0,
                            "h": h,
                            "fs": fs,
                            "fs_h": fs / h if h else 0,
                            "font": span.get("font", "")[:30],
                        }
                    )
        print(f"  images={img_count} text_spans={len(text_spans)}")
        if not text_spans:
            continue
        fs_h = [s["fs_h"] for s in text_spans if s["fs"] > 0]
        q = stats.quantiles(fs_h, n=4)
        print(
            f"  font/h ratio: median={stats.median(fs_h):.3f} "
            f"p25={q[0]:.3f} p75={q[2]:.3f}"
        )
        cjk = [
            s
            for s in text_spans
            if any("\u4e00" <= c <= "\u9fff" for c in s["text"])
        ]
        print(f"  cjk spans={len(cjk)}")
        for s in cjk[:5]:
            print(
                f"    fs={s['fs']:.2f} h={s['h']:.2f} ratio={s['fs_h']:.3f} "
                f"font={s['font']} text={s['text']!r}"
            )

    all_ratios: list[float] = []
    span_width_ratios: list[float] = []
    char_widths: list[float] = []
    line_span_counts: list[int] = []

    baseline_ratios: list[float] = []
    char_boxes: list[dict] = []

    for pi in range(min(max_pages, doc.page_count)):
        page = doc[pi]
        for b in page.get_text("rawdict")["blocks"]:
            if b.get("type") != 0:
                continue
            for line in b.get("lines", []):
                spans = [s for s in line.get("spans", []) if s.get("text", "").strip()]
                if spans:
                    line_span_counts.append(len(spans))
                for span in spans:
                    text = span.get("text", "")
                    x0, y0, x1, y1 = span["bbox"]
                    h = max(y1 - y0, 0.1)
                    w = max(x1 - x0, 0.1)
                    fs = span.get("size", 0)
                    if fs <= 0:
                        continue
                    all_ratios.append(fs / h)
                    span_width_ratios.append(w / h)
                    n = len(text.strip())
                    if n:
                        char_widths.append(w / n / fs)
                    # origin is baseline-left in PDF coords (y increases downward)
                    ox, oy = span.get("origin", (x0, y1))
                    baseline_from_bottom = y1 - oy
                    if h > 0:
                        baseline_ratios.append(baseline_from_bottom / h)
                    # per-char boxes when available
                    for ch in span.get("chars", []):
                        cx0, cy0, cx1, cy1 = ch["bbox"]
                        ch_h = max(cy1 - cy0, 0.1)
                        ch_w = max(cx1 - cx0, 0.1)
                        ch_ox, ch_oy = ch.get("origin", (cx0, cy1))
                        char_boxes.append(
                            {
                                "fs": fs,
                                "h": ch_h,
                                "w": ch_w,
                                "fs_h": fs / ch_h,
                                "baseline_from_bottom": (cy1 - ch_oy) / ch_h,
                            }
                        )

    print(f"\n=== aggregate first {min(max_pages, doc.page_count)} pages ===")
    if all_ratios:
        print(
            f"font/span_height median={stats.median(all_ratios):.3f} "
            f"mean={stats.mean(all_ratios):.3f}"
        )
    else:
        print("font/span_height: no span data (try rawdict char pass)")
    if baseline_ratios:
        q = stats.quantiles(baseline_ratios, n=4)
        print(
            f"baseline from span bottom / height: "
            f"median={stats.median(baseline_ratios):.3f} "
            f"p25={q[0]:.3f} p75={q[2]:.3f}"
        )
    if char_boxes:
        ch_fs_h = [c["fs_h"] for c in char_boxes]
        ch_bl = [c["baseline_from_bottom"] for c in char_boxes]
        print(f"char-level samples={len(char_boxes)}")
        print(
            f"  char font/h median={stats.median(ch_fs_h):.3f} "
            f"baseline/bottom median={stats.median(ch_bl):.3f}"
        )
    print(f"span_width/height median={stats.median(span_width_ratios):.3f}")
    print(f"chars_per_em_width median={stats.median(char_widths):.3f}")
    if line_span_counts:
        print(
            f"spans per line: median={stats.median(line_span_counts):.0f} "
            f"max={max(line_span_counts)}"
        )

    doc.close()


if __name__ == "__main__":
    pdf_path = Path(
        sys.argv[1]
        if len(sys.argv) > 1
        else r"D:\黄帝内经《素问》白话文图解\黄帝内经《素问》白话文图解_1.pdf"
    )
    analyze(pdf_path)

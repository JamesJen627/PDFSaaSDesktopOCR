# 6_PLAN — 双栏阅读顺序（Phase 6）

## 背景

单栏中文扫描件 OCR 正确率已达 ~95%。双栏 PDF 复制/搜索时文字顺序仍可能左右栏交错（Phase 4 已知限制）。

## Phase 6A（本提交）

- 复用 `PageColumnLayout`（`app/common`）检测双栏
- `PdfDoubleLayerService`：
  - 按 OCR 行框检测单/双栏（OCR 像素坐标 + 可调最小行宽）
  - 双栏时同行左右栏 box 不再合并为一行
  - 文字层写入顺序：**左栏自上而下 → 右栏自上而下**
- 单栏行为不变

## 验收

1. 单栏导论 PDF：复制顺序与 Phase 5 一致
2. 双栏 PDF：复制应为左栏全文接右栏全文，而非逐行 L-R 交错
3. `PdfDoubleLayerTextLayoutTest` 双栏用例通过

## 后续

- 跨栏标题行（整页宽 heading）单独处理
- 3+ 栏版式（报纸/杂志）需 gutter 聚类，不在本阶段范围

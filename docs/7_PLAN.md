# Phase 7 — OCR 识别范围（页眉页脚裁剪）

## 背景

双栏阅读顺序（Phase 6）已解决左右栏顺序问题，但扫描书籍 PDF 仍有两类噪声：

1. **页眉/页脚**：书名、章节名、页码被 OCR 识别进正文。
2. **高亮/色块覆盖**：荧光笔、批注色块导致部分汉字漏识（本阶段不解决，见 Phase 7B）。

## Phase 7A（已实现）

用户在开始 OCR 前通过**预览页 + 两条可拖水平线**划定正文区域：

- 上边界 `contentTop`（页面高度比例，默认 6%）
- 下边界 `contentBottom`（默认 87%，预览时自动检测页脚）
- 范围应用到**全部页面**（同一本书版式一致）

### 后端

| 组件 | 作用 |
|------|------|
| `OcrContentRegion` | 垂直裁剪比例，含 `defaultsForBooks()` |
| `OcrImageCrop` | PNG 按区域裁剪 |
| `POST /api/v1/pdf/preview-page` | 渲染单页预览 PNG |
| `POST /api/v1/ocr/batch-from-pdf` | 新增 `contentTop` / `contentBottom` 表单字段 |
| `OcrBatchJobService` | 缓存**全页** PNG；OCR 用**裁剪** PNG |
| `OcrBatchResultResponse` | 持久化 `contentTopRatio` / `contentBottomRatio` |
| `PdfDoubleLayerService` | OCR box 的 `y` 加上裁剪偏移，对齐全页图像层 |

### Electron

1. 选择 PDF
2. 加载第 1 页预览
3. `OcrRegionPreviewModal` 拖线调整
4. `runPdfPipeline` 携带 `contentTop` / `contentBottom`

### 验证

```powershell
task backend:test -- --tests "*OcrImageCrop*"
cd frontend/electron && npm test
```

书籍扫描 PDF：拖线排除「给青年建筑师的信 / 页码 16·17」后重跑，页眉页脚不应出现在 OCR 文本层。

## Phase 7B（本提交）

高亮/色块覆盖漏字：在 `image_preprocess.py` 增加 HSV 色块检测 + 最小通道文本恢复，于扫描预处理前执行。

- 配置：`PDFSAAS_OCR_ENABLE_HIGHLIGHT_REMOVAL=true`（默认开，仅 CJK 语言路径）
- OpenCV 检测蓝/黄/绿/粉高亮区域，在 mask 内用 `min(R,G,B)` 恢复笔划后再走 CLAHE 去噪

## 已知问题（待后续验证）

- **页脚仍被选中**：默认下边界已改为 87% 并加入 `OcrRegionEstimator` 自动检测；用户反馈需在新任务上重跑 OCR 验证。若个别版式仍漏页脚，预览中手动上拖下蓝线。

## 限制

- 续跑任务使用 JSON 内保存的 `pipelineOptions`（含 crop）。
- 旧任务 JSON 无 crop 字段 → 全页 OCR。
- 跨页标题行、不规则版式需后续 per-page 区域（未做）。

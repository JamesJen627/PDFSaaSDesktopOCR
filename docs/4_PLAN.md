# 4_PLAN — TEE 批量 OCR（Phase 4）

## 上下文

Phase 3 已完成 Java OCR 代理与 Electron 单页试跑。本计划实现 **TEE 最小闭环**：多页 OCR 任务入队、异步执行、结果查询，Electron 经 `taskEvents` 推送页级进度。

PRD API（逐字）：

```
POST /api/ocr/batch
GET  /api/ocr/result/{id}
```

---

## 架构（Phase 4A）

```
Electron Main (OcrBatchRunner)
  pick multiple images
  POST /api/v1/ocr/batch  →  batch_id
  poll GET /api/v1/ocr/result/{id}
  emit task:start | progress | page_done | complete | failed
        ↓
Java OcrBatchJobService (in-memory, virtual threads)
  per page → OcrServiceClient.process → Python OCR
```

---

## API

### `POST /api/v1/ocr/batch`

Multipart：

| 字段 | 说明 |
|------|------|
| `files` | 多页 PNG/JPG（顺序即 page_index 1..N） |
| `mode` | `fast` \| `balanced` \| `high-quality` |
| `lang` | `ch` \| `en` \| `ch+en` |

响应 `202 Accepted`：

```json
{ "batchId": "uuid", "status": "pending", "pageCount": 3 }
```

### `GET /api/v1/ocr/result/{id}`

```json
{
  "batchId": "uuid",
  "status": "running",
  "progress": 66,
  "pageCount": 3,
  "completedCount": 2,
  "failedCount": 0,
  "pages": [
    { "pageIndex": 1, "status": "completed", "text": "..." },
    { "pageIndex": 2, "status": "completed", "text": "..." },
    { "pageIndex": 3, "status": "processing" }
  ]
}
```

---

## 分阶段

### Phase 4A（本提交）

- Java `OcrBatchJobService` + batch/result 端点
- Electron `OcrBatchRunner` + IPC + UI「批量 OCR」
- `taskEvents` 页级进度

### Phase 4B（本提交）

- Java `PdfPageRenderService` + `POST /api/v1/ocr/batch-from-pdf`
- Java `PdfDoubleLayerService` + `POST /api/v1/pdf/double-layer`
- 批量结果保留 `rawJson`（含 boxes）与 `renderDpi`
- Electron `PdfOcrPipelineRunner`：选 PDF → OCR → 双层 PDF → `app_data/tasks/` + `exports/`
- 修复 batch 全程统一 `task_id`（使用 `batchId`）

### Phase 4C（本提交）

- Electron **任务历史** UI：列出 `app_data/tasks/*.json`
- **增量持久化**：OCR 开始 / OCR 完成 / 导出完成 / 失败 均写入任务 JSON
- **断点续跑** IPC `tasks:resume`：
  - OCR 已完成、仅缺导出 → 只跑双层 PDF（`batchResultJson` 回退，Backend 重启后仍可用）
  - Backend 仍有 batch → 继续轮询 OCR
  - batch 丢失 → 自动重新提交 PDF OCR
- **打开导出** / **打开 exports 目录**
- 已知限制：双栏 PDF 复制顺序仍可能交错（Phase 5+）；单栏 PDF 为验收基准

### Phase 4D（本提交）

- **复用 OCR 渲染图**：`batch-from-pdf` 路径在内存中保留 PNG，`/pdf/double-layer` 不再二次 `PDFRenderer.render`
- **JPEG 图像层**：双层 PDF 图像层改为 JPEG 嵌入（体积更小、`save()` 更快）
- Backend 重启后续跑导出仍走 `batchResultJson` + 重新渲染（无缓存时回退）
- 待办：双栏阅读顺序修复

### Phase 4E（本提交）

- Electron 将 OCR 页图持久化到 `app_data/cache/{batchId}/page-NNNN.png`
- OCR 完成后从 Backend 下载渲染图（`GET /api/v1/ocr/rendered-page/{id}/{page}`）
- 双层 PDF 导出时附带 `pageImages`，Backend 重启后仍免二次 `PDFRenderer.render`
- 待办：双栏阅读顺序（`PageColumnLayout`）

---

## 本地验证

```powershell
# Terminal 1 — OCR stub
cd ocr-service
$env:PDFSAAS_OCR_ENGINE='stub'
py -3 -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port 5002

# Terminal 2 — Backend
.\scripts\windows\dev-backend.ps1

# Terminal 3 — Electron
.\scripts\windows\dev-electron.ps1
```

Electron 中点击 **批量 OCR**，选多张图片，任务事件表应出现 `task:progress` / `task:page_done` / `task:complete`。

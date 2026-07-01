# 2_PLAN — Python OCR Service（PaddleOCR）

## 上下文

Phase 1 已完成 Electron 壳、Java 后端子进程、IPC 骨架。本计划实现 **本地 Python OCR Service**，替换 `ocrServiceStub`，为后续 Java OCR Extension（3_PLAN）与 TEE（4_PLAN）提供推理端点。

PRD 约束（逐字保留）：

- 主引擎：**PaddleOCR**（中文/英文/混合）
- 备用：**Tesseract**（本计划实现接口预留 + Phase 2.1 可选接入）
- 默认完全本地，端口 **5002**（与 AI `engine` 5001 区分）
- Health：`GET /health`
- OCR 输出结构对齐 OER-021（text、boxes、language、page_index、confidence）

---

## 相关文件

### 新建

| 路径 | 职责 |
|------|------|
| `ocr-service/pyproject.toml` | uv 项目；FastAPI + PaddleOCR 可选依赖组 |
| `ocr-service/src/pdfsaas_ocr/` | API、contracts、PaddleOCR 引擎封装 |
| `ocr-service/tests/` | health + OCR route 测试（stub 引擎，无需 GPU） |
| `ocr-service/scripts/start.bat` / `start.sh` | Electron / 手动启动入口 |
| `.taskfiles/ocr.yml` | `ocr:install`、`ocr:dev`、`ocr:check` |
| `frontend/electron/main/ocrService.ts` | 替换 stub：spawn + health poll |
| `docs/2_PLAN.md` | 本文件 |

### 修改

| 路径 | 变更 |
|------|------|
| `frontend/electron/main/processManager.ts` | 使用 `OcrService` |
| `frontend/electron/main/healthCheck.ts` | `checkOcrServiceHealth()` |
| `frontend/electron/main/config.ts` | `externalOcrUrl`、`ELECTRON_START_OCR` |
| `frontend/electron/shared/types.ts` | `ElectronConfig.externalOcrUrl` |
| `.taskfiles/electron.yml` | `bundle-resources` 同步 `ocr-service/` |
| `Taskfile.yml` | include `ocr:` |

### 明确不在本计划范围

- Java `POST /api/ocr/process` 代理（3_PLAN）
- TEE 队列、batch、GPU worker 池（4_PLAN）
- PP-Structure 布局树、预处理全套（OER-010+，后续迭代）
- 嵌入式 Python 运行时打包（Phase 2 用 uv/系统 Python；embed 随 electron-builder 后续完善）

---

## API 契约（ocr-service 直连）

### `GET /health`

```json
{
  "status": "UP",
  "engine": "paddleocr",
  "modelsLoaded": true,
  "version": "0.1.0",
  "gpuAvailable": false
}
```

### `POST /api/ocr/process`

Multipart：`file`（PNG/JPG/TIFF）、`page_index`（默认 1）、`mode`（fast|balanced|high-quality）、`lang`（ch|en|ch+en）。

响应（OER-021 子集）：

```json
{
  "text": "...",
  "boxes": [{ "x": 0, "y": 0, "w": 10, "h": 10, "text": "...", "confidence": 0.98 }],
  "language": "zh",
  "pageIndex": 1,
  "pageConfidence": 0.95
}
```

---

## Electron 集成

| 变量 | 用途 |
|------|------|
| `OCR_SERVICE_PORT` | 默认 5002 |
| `ELECTRON_USE_EXTERNAL_OCR` | 跳过 spawn，连已有实例（如 `ocr:dev`） |
| `ELECTRON_START_OCR` | dev 模式下也 spawn 本地 OCR |
| `ELECTRON_FORCE_OCR_STUB` | 保留 Phase 1 纯 stub 行为（测试用） |

启动流：

1. `ProcessManager.start('ocr-service')`
2. spawn `resources/ocr-service/start.bat`（或 repo `ocr-service/scripts/start.bat`）
3. poll `GET http://127.0.0.1:5002/health` until `status=UP`
4. 失败 → `unhealthy`，日志写入 `app_data/logs/ocr-service.log`

---

## 分阶段实施

### Phase 2A — 服务骨架（本提交）

- FastAPI + `/health` + `/api/ocr/process`
- PaddleOCR lazy load + stub 引擎（无 paddle 时 CI 可测）
- Electron `OcrService` + taskfile

### Phase 2B — 增强（后续）

- Tesseract fallback（OER-023）
- 预处理 pipeline（OER-010）
- `POST /api/ocr/batch`、结果缓存

---

## 本地开发

### 方式 A — uv（推荐，与 engine 一致）

```powershell
cd ocr-service
uv sync
uv sync --group paddle   # 可选：安装 PaddleOCR
uv run uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port 5002
```

### 方式 B — 无 uv / 无 task（Windows）

```powershell
cd ocr-service
py -3 -m pip install -e ".[dev]"
py -3 -m pip install -e ".[paddle]"   # PaddleOCR 3.7+
$env:PDFSAAS_OCR_ENGINE='paddle'
$env:PDFSAAS_OCR_OCR_VERSION='PP-OCRv4'   # 默认 v4 mobile；v6 medium 首次下载很慢
$env:PDFSAAS_OCR_ENABLE_MKLDNN='0'        # Windows CPU 必须关闭 oneDNN（Paddle 3.3.x bug）
$env:PDFSAAS_OCR_PRELOAD='1'
py -3 -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port 5002
```

或使用脚本（已设置上述环境变量）：

```powershell
.\scripts\windows\dev-ocr-paddle.ps1
```

**Paddle 503 / OneDNN 错误：** PaddlePaddle 3.3.x 在 Windows CPU 上若启用 MKLDNN 会报 `ConvertPirAttribute2RuntimeAttribute`。仅设 `FLAGS_use_mkldnn=0` **不够**，必须在 PaddleOCR 构造时 `enable_mkldnn=False`（本仓库默认 `PDFSAAS_OCR_ENABLE_MKLDNN=0`）。环境变量须在 **OCR 服务进程启动前** 设置。

**卡在 `PP-OCRv6_medium_det`：** PaddleOCR 3.7 默认 v6 大模型（数百 MB）。`Ctrl+C` 中断，设 `PDFSAAS_OCR_OCR_VERSION=PP-OCRv4` 后重装/重启；可删未完成目录 `%USERPROFILE%\.paddlex\official_models\PP-OCRv6_medium_det`。

验证：

- `http://127.0.0.1:5002/` — 服务索引（不是 404）
- `http://127.0.0.1:5002/health` — `"engine":"paddleocr"` 且 `"modelsLoaded":true`
- `POST http://127.0.0.1:5002/api/ocr/warmup` — 手动触发模型加载

### 连接 Electron

```powershell
cd frontend/electron
$env:ELECTRON_USE_EXTERNAL_OCR='http://127.0.0.1:5002'
npm run dev
```

或在 dev 模式自动 spawn：`$env:ELECTRON_START_OCR='true'`

---

## 与后续 PLAN 的接口

- **3_PLAN**：Java Stirling 扩展 API 代理到 `http://127.0.0.1:5002/api/ocr/process`
- **4_PLAN**：TEE 按页调用 OCR service，经 Electron `taskEvents` 推送进度

# 3_PLAN — Java OCR Extension API

## 上下文

Phase 2 已完成本地 Python OCR Service（`ocr-service/`，端口 **5002**）。本计划在 **Stirling Java Backend** 新增 OCR Extension 代理层，使 Renderer / TEE / 外部客户端通过统一 Backend URL 调用 PaddleOCR，而无需直连 Python 端口。

与现有 **`/api/v1/misc/ocr-pdf`**（OCRmyPDF / Tesseract 整份 PDF OCR）**并存**，不替换。

PRD API（逐字）：

```
POST /api/ocr/process
POST /api/ocr/batch
GET  /api/ocr/result/{id}
```

Stirling 惯例同时暴露 **`/api/v1/ocr/*`** 与 PRD 路径 **`/api/ocr/*`**（双前缀）。

---

## 架构

```
Electron Renderer / TEE / Swagger
        ↓
Java Backend  :8080
  POST /api/v1/ocr/process  (或 /api/ocr/process)
        ↓ HTTP multipart proxy
Python ocr-service  :5002
  POST /api/ocr/process
```

配置：`settings.yml` → `ocrService.url`（默认 `http://localhost:5002`），环境变量 **`OCR_SERVICE_URL`** 可覆盖（与 Electron 一致）。

---

## 相关文件

### 新建

| 路径 | 职责 |
|------|------|
| `app/common/.../annotations/api/OcrApi.java` | `@OcrApi` 双前缀注解 |
| `app/core/.../service/ocr/OcrServiceClient.java` | HttpClient 代理（health / warmup / process） |
| `app/core/.../controller/api/ocr/OcrExtensionController.java` | REST 端点 |
| `app/core/src/test/.../OcrServiceClientTest.java` | Client 单测 |
| `app/core/src/test/.../OcrExtensionControllerTest.java` | Controller 单测 |
| `docs/3_PLAN.md` | 本文件 |

### 修改

| 路径 | 变更 |
|------|------|
| `ApplicationProperties.java` | `ocrService` 配置块 |
| `settings.yml.template` | 默认 `ocrService` |
| `EndpointConfiguration.java` | `PaddleOCR` 功能组 + `ocrService.enabled=false` 时禁用 |

---

## API 映射

| Java Backend | Python ocr-service | 状态 |
|--------------|-------------------|------|
| `GET /api/v1/ocr/health` | `GET /health` | ✅ Phase 3A |
| `POST /api/v1/ocr/warmup` | `POST /api/ocr/warmup` | ✅ Phase 3A |
| `POST /api/v1/ocr/process` | `POST /api/ocr/process` | ✅ Phase 3A |
| `POST /api/v1/ocr/batch` | — | ⏳ 501，Phase 4 TEE |
| `GET /api/v1/ocr/result/{id}` | — | ⏳ 501，Phase 4 TEE |

### `POST /api/v1/ocr/process`

Multipart 字段与 Python 一致：

- `file` — PNG/JPG/TIFF 页图
- `page_index` — 默认 1
- `mode` — `fast` \| `balanced` \| `high-quality`
- `lang` — `ch` \| `en` \| `ch+en`

响应 JSON 透传（OER-021 子集：`text`、`boxes`、`language`、`page_index`、`page_confidence`）。

---

## Endpoint 开关

| Endpoint key | 说明 |
|--------------|------|
| `ocr-health` | Health 代理 |
| `ocr-process` | 单页 OCR |
| `ocr-warmup` | 模型预热（开发/运维） |
| `ocr-batch` | 批量（占位） |
| `ocr-result` | 异步结果（占位） |

功能组 **`PaddleOCR`**；`ocrService.enabled: false` 或 `endpoints.groupsToRemove` 含 `PaddleOCR` 时整组禁用。

---

## 本地验证

### 1. 启动 OCR 服务

```powershell
cd ocr-service
$env:PDFSAAS_OCR_ENGINE='paddle'
$env:PDFSAAS_OCR_OCR_VERSION='PP-OCRv4'
py -3 -m uvicorn pdfsaas_ocr.api.app:app --host 127.0.0.1 --port 5002
```

### 2. 启动 Java Backend

```powershell
cd app
.\gradlew.bat :stirling-pdf:bootRun
# 或 task backend:dev（若已安装 task）
```

### 3. 验证代理

```powershell
# Health（经 Java）
curl http://127.0.0.1:8080/api/v1/ocr/health

# 单页 OCR（示例 PNG）
curl -X POST http://127.0.0.1:8080/api/v1/ocr/process `
  -F "file=@page.png" -F "page_index=1" -F "mode=balanced" -F "lang=ch"
```

Swagger：`http://127.0.0.1:8080/swagger-ui/index.html` → **OCR Extension**。

### Windows 常见问题（无 task / 网络慢）

**1. Gradle 下载 timeout**

`gradle-wrapper.properties` 已将 `networkTimeout` 提到 300s。仍失败时：

```powershell
.\scripts\windows\ensure-gradle.ps1
```

**2. 本机没有 Java / `java` 不在 PATH**

Backend 需要 **JDK 25**（或 Gradle toolchain 可解析的版本）。安装 [Temurin JDK 25](https://adoptium.net/) 后：

```powershell
.\scripts\windows\dev-backend.ps1
```

**3. `curl` 报「找不到参数 -X」**

PowerShell 里 `curl` 是 `Invoke-WebRequest` 的别名，不是 curl。请用 **`curl.exe`** 或脚本：

```powershell
# 健康检查（Backend 必须先启动）
curl.exe http://127.0.0.1:8080/api/v1/ocr/health

# 或一键脚本（Python 直连 / Java 代理）
.\scripts\windows\test-ocr-proxy.ps1 -Target java
.\scripts\windows\test-ocr-proxy.ps1 -Target python

# OCR 处理（需要 page.png）
curl.exe -X POST http://127.0.0.1:8080/api/v1/ocr/process `
  -F "file=@page.png" -F "page_index=1" -F "mode=balanced" -F "lang=ch"
```

**4. `8080 无法连接`**

说明 Java Backend **未运行**。OCR Python 在 5002 正常 ≠ Backend 在 8080。先在一个终端跑 Backend，再 curl 8080。

### 4. Electron 试跑（Phase 3B）

先确保 Backend + OCR 已启动，再在仓库根目录：

```powershell
cd frontend/electron
$env:ELECTRON_USE_EXTERNAL_BACKEND='http://127.0.0.1:8080'
$env:ELECTRON_USE_EXTERNAL_OCR='http://127.0.0.1:5002'
npm run dev
```

窗口内 **OCR 代理（Java Backend）** 面板应显示 `UP · stub`（或 `paddleocr`）。点击 **选择图片并 OCR** 经 Java 代理上传页图。

开发期 OCR 建议 stub：`$env:PDFSAAS_OCR_ENGINE='stub'` 后重启 uvicorn。

---

## 分阶段

### Phase 3A（本提交）✅

- `OcrServiceClient` + `OcrExtensionController`
- health / warmup / process 代理
- batch / result 返回 501 + 说明

### Phase 3B（本提交）✅

- Electron Main：`ocrProxyClient` — GET `/api/v1/ocr/health`、POST `/api/v1/ocr/process`
- `JavaBackendService` 启动后探测 OCR 代理健康状态
- Renderer OCR 试跑面板（选图 → Java 代理 → 显示 text / HTTP 状态）
- IPC：`ocr:refreshProxyHealth`、`ocr:pickAndProcess`

### Phase 4（4_PLAN）

- ✅ Phase 4A：TEE 批量 OCR + Electron taskEvents（本提交）
- ⏳ Phase 4B：PDF 拆页、double-layer、任务持久化

---

## 与 2_PLAN 的衔接

- Python 直连：`http://127.0.0.1:5002/api/ocr/process`（Electron 子进程 / 外部 OCR）
- Java 代理：`http://127.0.0.1:8080/api/v1/ocr/process`（统一 Backend、Swagger、权限、后续 TEE）

两者可并存；TEE 应优先走 Java 代理以保持任务状态在 Backend 侧。

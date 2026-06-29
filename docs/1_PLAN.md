# 1_PLAN — Electron 桌面壳 + 子进程管理 + IPC 骨架

## 上下文

基于 Stirling-PDF 深度 fork 二次开发 **PDFSaaS OCR Desktop**。已确认桌面端按 PRD 使用 **Electron**（不使用现有 Tauri 路线）。

本计划覆盖 PRD Phase 1 的第一步基础设施：新建 Electron 应用，在 Main Process 中启动并监控本地 **Stirling-PDF Java 后端**，预留 **Python OCR Service** 子进程插槽，通过 **preload + contextBridge** 向 Renderer 暴露 IPC，并实现 PRD 定义的任务事件通道骨架。Renderer 本期仅提供最小 React 壳（连通性验证），OCR 专用 UI 与 PaddleOCR 逻辑不在本计划范围内。

PRD 约束（逐字保留）：

- 架构模式：**Fork + 强耦合扩展（不是插件模式）**
- Phase 1（当前）：**Windows Desktop**、**本地 Python OCR service**、**Fork Stirling-PDF**
- 默认完全本地处理，不上传 PDF，可离线运行
- Electron Desktop UI → IPC → Task Execution Engine → OCR / Layout / PDF Engines（本计划先实现 UI→IPC→本地服务 的前两段）
- 本地存储结构：`app_data/tasks/`、`app_data/cache/`、`app_data/exports/`、`app_data/logs/`
- IPC 必须支持事件：`task:start`、`task:progress`、`task:page_done`、`task:failed`、`task:complete`
- UI 性能目标：页面响应 < 100ms；任务创建 < 100ms；状态更新 < 200ms

---

## 相关文件

### 新建

| 路径 | 职责 |
|------|------|
| `frontend/electron/package.json` | Electron + electron-builder 依赖；dev/build 脚本 |
| `frontend/electron/tsconfig.json` | Main / Preload / Renderer 分项目编译 |
| `frontend/electron/electron-builder.yml` | Windows NSIS 打包；`extraResources` 挂载 JRE + JAR |
| `frontend/electron/main/index.ts` | 应用入口：`app.whenReady`、窗口创建、生命周期 |
| `frontend/electron/main/appPaths.ts` | 解析 `app_data/` 子目录（tasks/cache/exports/logs） |
| `frontend/electron/main/processManager.ts` | 通用子进程抽象：spawn、stdout 解析、health poll、graceful shutdown |
| `frontend/electron/main/javaBackendService.ts` | 启动 bundled JRE + `stirling-pdf-*.jar`；解析 `running on port:` 日志 |
| `frontend/electron/main/ocrServiceStub.ts` | OCR 子进程占位（dev 模式可跳过；prod 预留 uv/python 启动点） |
| `frontend/electron/main/ipc/registerHandlers.ts` | 注册 `ipcMain.handle` / `ipcMain.on` |
| `frontend/electron/main/ipc/taskEvents.ts` | Main→Renderer 任务事件推送（`webContents.send`） |
| `frontend/electron/preload/index.ts` | `contextBridge.exposeInMainWorld('electronAPI', …)` |
| `frontend/electron/shared/ipcChannels.ts` | IPC channel 名称常量 |
| `frontend/electron/shared/types.ts` | `ServiceStatus`、`BackendConfig`、`TaskEventPayload` 等共享类型 |
| `frontend/electron/renderer/index.html` | Renderer 入口 HTML |
| `frontend/electron/renderer/main.tsx` | React 挂载点 |
| `frontend/electron/renderer/App.tsx` | 最小验证 UI：服务状态、后端 URL、手动 health check |
| `frontend/electron/renderer/hooks/useElectronAPI.ts` | 类型安全的 preload API 封装 |
| `frontend/electron/renderer/vite.config.ts` | Renderer 独立 Vite 配置（`base: './'`） |
| `.taskfiles/electron.yml` | `task electron:dev`、`electron:build`、`electron:bundle-resources` |
| `Taskfile.yml` | `includes: electron:` 引入 electron taskfile |

### 修改

| 路径 | 变更 |
|------|------|
| `Taskfile.yml` | 增加 `electron:` include；可选 `dev:ocr-desktop` 并发启动 electron + backend |
| `frontend/package.json` | workspaces 加入 `electron`（若使用 monorepo workspace） |

### 参考（只读，不修改）

| 路径 | 借鉴点 |
|------|--------|
| `frontend/editor/src-tauri/src/commands/backend.rs` | JRE/JAR 路径发现、`running on port:` 解析、防重复启动 |
| `.taskfiles/desktop.yml` | `jlink:jar` / `jlink:runtime` 产物路径；JRE 模块列表 `JLINK_MODULES` |
| `frontend/editor/src/desktop/services/backendHealthMonitor.ts` | 轮询 `/api/v1/info/status` 的模式 |
| `app/common/.../RequestUriUtils.java` | health 端点路径 `/api/v1/info/status` |
| `docs/PRDs/07_ElectronDesktopApplicationRequirements.md` | IPC 事件表、Dashboard 模块划分 |
| `docs/PRDs/08_SystemArchitectureSpecification.md` | 分层：Electron UI → IPC → TEE → Engines |

### 明确不在本计划范围

- `frontend/editor/src-tauri/` — 保留不动，二开桌面不依赖
- `frontend/editor/src/desktop/` — Tauri 专用 seam，不迁移
- `ocr-service/` PaddleOCR 实现 — 仅预留 stub
- TEE 队列、Layout Engine、双层 PDF — 后续 PLAN

---

## 共享类型（Phase 0 — 数据层）

在 `frontend/electron/shared/types.ts` 定义 Main / Preload / Renderer 共用契约：

**`ServiceKind`**：`java-backend` | `ocr-service`

**`ServiceStatus`**：`idle` | `starting` | `healthy` | `unhealthy` | `stopped` | `crashed`

**`ManagedServiceState`**：含 `kind`、`status`、`port`、`pid`、`lastError`、`startedAt`

**`AppPaths`**：对应 PRD `app_data/` 结构

```
app_data/
  tasks/
  cache/
  exports/
  logs/
```

**`TaskEventName`**（与 PRD EDA §5.2 一致）：`task:start` | `task:progress` | `task:page_done` | `task:failed` | `task:complete`

**`TaskEventPayload`**（PRD 示例结构）：

```
{
  "event": "task:update",
  "data": {
    "task_id": "...",
    "page": 12,
    "status": "ocr_done"
  }
}
```

本计划将 channel 名对齐 PRD 五事件名；payload 字段保留 `task_id`、`page`、`status`，并扩展可选 `message`、`progress`（0–100）。

**`ElectronAPI`**（preload 暴露面）：`getServiceStates()`、`getBackendBaseUrl()`、`restartService(kind)`、`onTaskEvent(callback)`、`openPath(subpath)`、`getAppPaths()`

---

## 算法与流程

### 1. 应用启动（Main Process）

1. `app.requestSingleInstanceLock()` — Windows 单实例
2. `appPaths.ensureDirectories()` — 创建 `app_data/{tasks,cache,exports,logs}`
3. 解析 bundled resources 路径：
   - dev：`ELECTRON_RESOURCES_DIR` 环境变量或指向 `frontend/electron/resources/dev/`
   - prod：`process.resourcesPath/runtime/jre`、`process.resourcesPath/libs/stirling-pdf-*.jar`
4. `processManager.start('java-backend')` — 见算法 2
5. （可选 dev 跳过）`processManager.start('ocr-service')` — stub 仅写日志并标记 `idle`
6. 创建 `BrowserWindow`：`webPreferences.preload` 指向编译后的 preload；`contextIsolation: true`、`nodeIntegration: false`
7. 加载 Renderer：dev 连 Vite dev server URL；prod 加载 `renderer/dist/index.html`
8. 注册 IPC handlers
9. 启动 health 轮询（默认 3s 间隔，可配置）

### 2. Java 后端启动（参考 Tauri `backend.rs`）

1. 若 `ManagedServiceState.status` 为 `starting` 或 `healthy`，拒绝重复启动
2. 定位 `java.exe`（bundled JRE）与 `stirling-pdf-*.jar`（libs 目录下文件名含 `stirling-pdf` 的最新 jar）
3. `child_process.spawn(java, ['-jar', jarPath], { env: { SERVER_PORT: '0' 或固定端口 }, cwd: app_data })`
   - Phase 1 使用**动态端口**：不设 `SERVER_PORT`，解析 stdout 中 `Stirling-PDF running on port: PORT`（与 Tauri 相同正则逻辑）
4. 监听 stdout/stderr → 追加写入 `app_data/logs/java-backend.log`
5. 解析到 port 后更新 state，`status = starting` → 进入 health poll
6. health poll：`GET http://127.0.0.1:{port}/api/v1/info/status`，响应含 `UP` 则 `healthy`
7. 超时（默认 120s）未 healthy → `unhealthy`，向 Renderer 发送服务状态变更

### 3. OCR Service Stub

1. dev 模式：不 spawn；`ocr-service` state 保持 `idle`，Renderer 显示「未启动（Phase 2）」
2. prod 占位：`spawn` 脚本 `resources/ocr-service/start.bat`（空脚本或 echo）；port 预留 **5002**（与现有 `engine` 5001 区分）
3. 接口契约预留：`OCR_SERVICE_URL=http://127.0.0.1:5002`，供后续 Java OCR Extension 使用

### 4. IPC 注册与任务事件推送

**Renderer → Main（invoke）：**

| Channel | 行为 |
|---------|------|
| `services:getStates` | 返回所有 `ManagedServiceState` |
| `services:getBackendBaseUrl` | 返回 `http://127.0.0.1:{port}` 或 null |
| `services:restart` | 参数 `ServiceKind`；stop + start |
| `app:getPaths` | 返回 `AppPaths` 绝对路径 |
| `app:openLogsDir` | `shell.openPath(logsDir)` |

**Main → Renderer（push，PRD 事件）：**

- `task:start`、`task:progress`、`task:page_done`、`task:failed`、`task:complete`
- 本计划实现 **事件总线骨架**：`taskEvents.emit(name, payload)` + preload `onTaskEvent` 订阅
- 提供 **dev 模拟**：Renderer 按钮触发 Main 调用 `taskEvents.emitDemoSequence()`，按序推送 fake payload，验证 IPC 无阻塞

### 5. 应用退出

1. `app.on('before-quit')`：依次 `processManager.stop('ocr-service')`、`processManager.stop('java-backend')`
2. stop：SIGTERM → 等待 5s → SIGKILL
3. 清空 global state

### 6. Windows 打包资源布局（electron-builder `extraResources`）

复用 `.taskfiles/desktop.yml` 的 `jlink:jar` + `jlink:runtime` 产物，复制到：

```
resources/
  runtime/jre/          # jlink 输出
  libs/stirling-pdf-*.jar
  ocr-service/          # 占位目录
```

`electron:bundle-resources` task 在 `electron:build` 前执行，避免与 Tauri `src-tauri/runtime` 路径耦合——复制到 `frontend/electron/resources/`。

---

## 分阶段实施

### Phase 0 — 数据层与目录脚手架

- 创建 `frontend/electron/` 目录树
- 定义 `shared/types.ts`、`shared/ipcChannels.ts`
- 创建 `appPaths` 与 `app_data` 目录约定
- 添加 `.taskfiles/electron.yml` 空壳 task

### Phase 1A — Main Process 子进程管理

- 实现 `processManager.ts`、`javaBackendService.ts`
- 实现 health poll（`/api/v1/info/status`）
- 实现 `ocrServiceStub.ts`
- 单元测试：port 解析函数、state 机转换（Node test 或 vitest in electron package）

### Phase 1B — Preload + IPC

- 实现 `preload/index.ts`、`ipc/registerHandlers.ts`、`ipc/taskEvents.ts`
- 实现 dev 模拟任务事件序列

### Phase 1C — Renderer 最小壳

- Vite + React 最小 App：展示 Java/OCR 服务状态、backend URL、Restart 按钮
- 订阅 task 事件并打印到 UI 列表（验证 10Hz 刷新不卡 UI 的可行性）
- 多语言占位：i18n 键位预留 `zh-CN`、`zh-TW`、`en`（本计划不翻译，仅结构）

### Phase 1D — 构建与 Task 集成

- `electron-builder` Windows NSIS target
- `task electron:dev`：并行 Vite renderer + electron main（electron-vite 或 concurrently 模式）
- `task electron:bundle-resources`：从 gradle jlink 复制 JRE/JAR
- `task electron:build`：完整 Windows 安装包

Phase 1A 与 1B 可并行；1C 依赖 1B；1D 依赖 1A。

---

## 环境变量与配置

| 变量 | 用途 |
|------|------|
| `ELECTRON_RESOURCES_DIR` | dev 模式下 bundled JRE/JAR 路径 |
| `ELECTRON_BACKEND_START_TIMEOUT_MS` | 默认 120000 |
| `ELECTRON_HEALTH_POLL_MS` | 默认 3000 |
| `OCR_SERVICE_PORT` | 默认 5002 |
| `DISABLE_ADDITIONAL_FEATURES` | bundle JAR 时设为 `true`（与 desktop.yml jlink:jar 一致，OSS core JAR） |

dev 模式下 Java 后端也可通过 `ELECTRON_USE_EXTERNAL_BACKEND=http://localhost:8080` 跳过 spawn，直接连 `task backend:dev` 实例。

---

## 与后续 PLAN 的接口

本计划完成后，以下模块可独立接入：

- **`2_PLAN` ocr-service**：替换 `ocrServiceStub`，health 端点 `GET /health`
- **`3_PLAN` Java OCR Extension API**：`POST /api/ocr/process` 等（PRD §5.1）
- **`4_PLAN` TEE**：Main 或 Python 侧队列，通过已有 `taskEvents` 推送 page 级进度
- **`5_PLAN` OCR 专用 Renderer 页面**：Dashboard、任务中心、双层预览（PRD EDA-001–051）

Java 后端 base URL 统一由 Renderer 经 `electronAPI.getBackendBaseUrl()` 获取，HTTP 调用走 `fetch` 到本地 Stirling API，不引入 Tauri HTTP client。

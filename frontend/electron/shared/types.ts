import type { OcrLang, OcrMode, OcrRunOptions } from "./ocrLang.js";
import type { OcrContentRegion } from "./ocrContentRegion.js";

export type { OcrLang, OcrMode, OcrRunOptions };
export type { OcrContentRegion };

/** Managed local service identifiers. */
export type ServiceKind = "java-backend" | "ocr-service";

/** Lifecycle state for a managed child process. */
export type ServiceStatus =
  | "idle"
  | "starting"
  | "healthy"
  | "unhealthy"
  | "stopped"
  | "crashed";

/** Runtime snapshot of a managed service (Main process source of truth). */
export interface ManagedServiceState {
  kind: ServiceKind;
  status: ServiceStatus;
  port: number | null;
  pid: number | null;
  lastError: string | null;
  startedAt: string | null;
  /** java-backend only: last probe of GET /api/v1/ocr/health */
  ocrProxy?: OcrProxyHealth | null;
}

/** OCR proxy health via Java backend (Phase 3B). */
export interface OcrProxyHealth {
  status: "UP" | "DOWN" | "unknown";
  engine?: string | null;
  modelsLoaded?: boolean;
  message?: string | null;
}

/** Result of POST /api/v1/ocr/process via Java backend. */
export interface OcrProcessResult {
  ok: boolean;
  httpStatus: number;
  body: string;
  parsed?: {
    text?: string;
    page_index?: number;
    page_confidence?: number;
    language?: string;
  };
  detail?: string;
  error?: string | null;
  cancelled?: boolean;
}

export interface OcrBatchSubmitResponse {
  batchId: string;
  status: string;
  pageCount: number;
}

export interface OcrBatchPageResult {
  pageIndex: number;
  status: string;
  text?: string | null;
  pageConfidence?: number | null;
  language?: string | null;
  error?: string | null;
}

export interface OcrBatchResultResponse {
  batchId: string;
  status: string;
  progress: number;
  pageCount: number;
  completedCount: number;
  failedCount: number;
  pages: OcrBatchPageResult[];
  error?: string | null;
  renderDpi?: number | null;
  contentTopRatio?: number | null;
  contentBottomRatio?: number | null;
}

export interface PdfPagePreviewResult {
  imageBase64: string;
  width: number;
  height: number;
  pageIndex: number;
  dpi: number;
  contentTop: number;
  contentBottom: number;
}

export interface PickedPdfFile {
  pdfPath: string;
  fileName: string;
}

export interface PdfOcrPipelineResult {
  batchId: string;
  result: OcrBatchResultResponse;
  taskPath: string;
  exportPath?: string;
}

export type OcrTaskPhase = "ocr" | "export" | "completed" | "failed";

export type TaskResumeKind = "none" | "export" | "continue" | "rerun";

export interface OcrTaskSummary {
  batchId: string;
  sourcePdf: string;
  sourceFileName: string;
  status: string;
  phase: OcrTaskPhase;
  progress: number;
  pageCount: number;
  createdAt: string;
  updatedAt: string;
  exportPath: string | null;
  hasExportFile: boolean;
  resumeKind: TaskResumeKind;
  lastError: string | null;
}

/** PRD app_data/ layout — tasks, cache, exports, logs. */
export interface AppPaths {
  root: string;
  tasks: string;
  cache: string;
  exports: string;
  logs: string;
}

/** PRD EDA §5.2 task IPC event names. */
export type TaskEventName =
  | "task:start"
  | "task:progress"
  | "task:page_done"
  | "task:failed"
  | "task:complete";

/** Payload pushed from Main → Renderer for task lifecycle updates. */
export interface TaskEventPayload {
  task_id: string;
  page?: number;
  status: string;
  message?: string;
  /** 0–100 page or task progress. */
  progress?: number;
}

/** Envelope for task event IPC (PRD example uses event + data). */
export interface TaskEventEnvelope {
  event: TaskEventName;
  data: TaskEventPayload;
}

/** Bundled resource paths resolved at startup. */
export interface ResourcePaths {
  jreBin: string;
  jarPath: string;
  ocrServiceDir: string;
}

/** Environment-driven Electron configuration (Phase 0 defaults). */
export interface ElectronConfig {
  backendStartTimeoutMs: number;
  healthPollMs: number;
  ocrServicePort: number;
  externalBackendUrl: string | null;
  externalOcrUrl: string | null;
  resourcesDir: string;
}

/** Preload API surface exposed to Renderer via contextBridge. */
export interface ElectronAPI {
  getServiceStates: () => Promise<ManagedServiceState[]>;
  getBackendBaseUrl: () => Promise<string | null>;
  restartService: (kind: ServiceKind) => Promise<ManagedServiceState>;
  onTaskEvent: (callback: (envelope: TaskEventEnvelope) => void) => () => void;
  getAppPaths: () => Promise<AppPaths>;
  openLogsDir: () => Promise<void>;
  /** Dev-only: trigger fake task:* IPC sequence in Main process. */
  emitDemoTaskEvents: () => Promise<void>;
  refreshOcrProxyHealth: () => Promise<OcrProxyHealth | null>;
  pickAndProcessOcr: (options?: OcrRunOptions) => Promise<OcrProcessResult>;
  pickAndRunOcrBatch: (options?: OcrRunOptions) => Promise<OcrBatchResultResponse | null>;
  pickPdfAndRunPipeline: (options?: OcrRunOptions) => Promise<PdfOcrPipelineResult | null>;
  pickPdfForPipeline: () => Promise<PickedPdfFile | null>;
  fetchPdfPagePreview: (
    pdfPath: string,
    options?: { pageIndex?: number; dpi?: number },
  ) => Promise<PdfPagePreviewResult>;
  runPdfPipeline: (
    pdfPath: string,
    options?: OcrRunOptions,
  ) => Promise<PdfOcrPipelineResult>;
  listOcrTasks: () => Promise<OcrTaskSummary[]>;
  resumeOcrTask: (batchId: string) => Promise<PdfOcrPipelineResult>;
  openTaskExport: (batchId: string) => Promise<void>;
  openExportsDir: () => Promise<void>;
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

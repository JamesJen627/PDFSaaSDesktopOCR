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
}

declare global {
  interface Window {
    electronAPI?: ElectronAPI;
  }
}

export {};

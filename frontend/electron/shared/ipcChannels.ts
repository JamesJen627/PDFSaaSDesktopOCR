/** Renderer → Main invoke channels. */
export const IPC = {
  services: {
    getStates: "services:getStates",
    getBackendBaseUrl: "services:getBackendBaseUrl",
    restart: "services:restart",
  },
  app: {
    getPaths: "app:getPaths",
    openLogsDir: "app:openLogsDir",
  },
} as const;

/** Main → Renderer push channels (PRD EDA §5.2). */
export const TASK_EVENTS = {
  start: "task:start",
  progress: "task:progress",
  pageDone: "task:page_done",
  failed: "task:failed",
  complete: "task:complete",
} as const;

export type TaskEventChannel =
  (typeof TASK_EVENTS)[keyof typeof TASK_EVENTS];

export const ALL_TASK_EVENT_CHANNELS: TaskEventChannel[] = [
  TASK_EVENTS.start,
  TASK_EVENTS.progress,
  TASK_EVENTS.pageDone,
  TASK_EVENTS.failed,
  TASK_EVENTS.complete,
];

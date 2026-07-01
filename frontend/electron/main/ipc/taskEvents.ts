import type { BrowserWindow } from "electron";

import { TASK_EVENTS } from "../../shared/ipcChannels.js";
import type {
  TaskEventEnvelope,
  TaskEventName,
  TaskEventPayload,
} from "../../shared/types.js";

export type TaskEventSender = (
  channel: TaskEventName,
  envelope: TaskEventEnvelope,
) => void;

export interface EmitDemoSequenceOptions {
  taskId?: string;
  stepMs?: number;
  pageCount?: number;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Main → Renderer task lifecycle event bus (PRD EDA §5.2). */
export class TaskEventBus {
  private sender: TaskEventSender | null = null;

  bindSender(sender: TaskEventSender): void {
    this.sender = sender;
  }

  bindWindow(window: BrowserWindow): void {
    this.bindSender((channel, envelope) => {
      if (!window.isDestroyed()) {
        window.webContents.send(channel, envelope);
      }
    });
  }

  clearBinding(): void {
    this.sender = null;
  }

  emit(event: TaskEventName, data: TaskEventPayload): void {
    const envelope: TaskEventEnvelope = { event, data };
    this.sender?.(event, envelope);
  }

  /** Dev-only fake OCR pipeline for IPC verification in Phase 1C. */
  async emitDemoSequence(options: EmitDemoSequenceOptions = {}): Promise<void> {
    const taskId = options.taskId ?? "demo-task-1";
    const stepMs = options.stepMs ?? 50;
    const pageCount = options.pageCount ?? 3;

    this.emit(TASK_EVENTS.start, {
      task_id: taskId,
      status: "started",
      progress: 0,
      message: "Demo OCR task started",
    });
    await sleep(stepMs);

    for (let page = 1; page <= pageCount; page += 1) {
      this.emit(TASK_EVENTS.progress, {
        task_id: taskId,
        page,
        status: "ocr_processing",
        progress: Math.round(((page - 1) / pageCount) * 100),
        message: `Processing page ${page}`,
      });
      await sleep(stepMs);

      this.emit(TASK_EVENTS.pageDone, {
        task_id: taskId,
        page,
        status: "ocr_done",
        progress: Math.round((page / pageCount) * 100),
      });
      await sleep(stepMs);
    }

    this.emit(TASK_EVENTS.complete, {
      task_id: taskId,
      status: "completed",
      progress: 100,
      message: "Demo OCR task completed",
    });
  }
}

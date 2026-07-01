import { TASK_EVENTS } from "../shared/ipcChannels.js";
import type { OcrBatchResultResponse } from "../shared/types.js";
import { fetchOcrBatchResult, sleep, submitOcrBatch } from "./ocrBatchClient.js";
import type { TaskEventBus } from "./ipc/taskEvents.js";

export interface RunOcrBatchOptions {
  mode?: string;
  lang?: string;
  pollMs?: number;
  timeoutMs?: number;
}

export async function pollOcrBatchWithEvents(
  taskEvents: TaskEventBus,
  backendBaseUrl: string,
  batchId: string,
  options: { pollMs?: number; timeoutMs?: number; suppressTerminalEvents?: boolean } = {},
): Promise<OcrBatchResultResponse> {
  const pollMs = options.pollMs ?? 500;
  const timeoutMs = options.timeoutMs ?? 300_000;
  const suppressTerminalEvents = options.suppressTerminalEvents ?? false;
  const deadline = Date.now() + timeoutMs;
  let lastProgress = -1;
  const notifiedPages = new Set<number>();

  while (Date.now() < deadline) {
    const result = await fetchOcrBatchResult(backendBaseUrl, batchId);

    if (result.progress !== lastProgress) {
      lastProgress = result.progress;
      taskEvents.emit(TASK_EVENTS.progress, {
        task_id: batchId,
        status: result.status,
        progress: result.progress,
        message: `Batch ${result.completedCount}/${result.pageCount} pages`,
      });
    }

    for (const page of result.pages) {
      if (
        (page.status === "completed" || page.status === "failed") &&
        !notifiedPages.has(page.pageIndex)
      ) {
        notifiedPages.add(page.pageIndex);
        taskEvents.emit(TASK_EVENTS.pageDone, {
          task_id: batchId,
          page: page.pageIndex,
          status: page.status,
          progress: result.progress,
          message: page.text ?? page.error ?? page.status,
        });
      }
    }

    if (result.status === "completed") {
      if (!suppressTerminalEvents) {
        taskEvents.emit(TASK_EVENTS.complete, {
          task_id: batchId,
          status: "completed",
          progress: 100,
          message: `OCR batch completed (${result.completedCount}/${result.pageCount})`,
        });
      }
      return result;
    }

    if (result.status === "failed") {
      if (!suppressTerminalEvents) {
        taskEvents.emit(TASK_EVENTS.failed, {
          task_id: batchId,
          status: "failed",
          progress: result.progress,
          message: result.error ?? "OCR batch failed",
        });
      }
      return result;
    }

    await sleep(pollMs);
  }

  taskEvents.emit(TASK_EVENTS.failed, {
    task_id: batchId,
    status: "failed",
    progress: lastProgress >= 0 ? lastProgress : 0,
    message: "OCR batch timed out",
  });
  throw new Error("OCR batch timed out");
}

export class OcrBatchRunner {
  constructor(private readonly taskEvents: TaskEventBus) {}

  async run(
    backendBaseUrl: string,
    imagePaths: string[],
    options: RunOcrBatchOptions = {},
  ): Promise<OcrBatchResultResponse> {
    if (imagePaths.length === 0) {
      throw new Error("No images selected for OCR batch");
    }

    const submit = await submitOcrBatch(backendBaseUrl, imagePaths, {
      mode: options.mode,
      lang: options.lang,
    });

    this.taskEvents.emit(TASK_EVENTS.start, {
      task_id: submit.batchId,
      status: "started",
      progress: 0,
      message: `OCR batch queued (${submit.pageCount} pages)`,
    });

    return pollOcrBatchWithEvents(this.taskEvents, backendBaseUrl, submit.batchId, {
      pollMs: options.pollMs,
      timeoutMs: options.timeoutMs,
    });
  }
}

import fs from "node:fs";
import path from "node:path";

import { TASK_EVENTS } from "../shared/ipcChannels.js";
import { resolveOcrRunOptions } from "../shared/ocrLang.js";
import type { AppPaths, OcrBatchResultResponse } from "../shared/types.js";
import { fetchOcrBatchResult } from "./ocrBatchClient.js";
import { pollOcrBatchWithEvents } from "./ocrBatchRunner.js";
import { fetchDoubleLayerPdf, submitOcrBatchFromPdf } from "./ocrPdfPipelineClient.js";
import { ensurePageImageCache } from "./pageImageCache.js";
import type { TaskEventBus } from "./ipc/taskEvents.js";
import {
  batchResultJsonForExport,
  buildExportPath,
  exportFileExists,
  loadOcrTask,
  saveOcrTask,
  writeExportPdf,
  type PersistedOcrTask,
  type PipelineOptions,
} from "./taskPersistence.js";

export interface RunPdfOcrPipelineOptions extends PipelineOptions {
  pollMs?: number;
  timeoutMs?: number;
  exportDoubleLayer?: boolean;
}

export interface PdfOcrPipelineResult {
  batchId: string;
  result: OcrBatchResultResponse;
  taskPath: string;
  exportPath?: string;
}

export class PdfOcrPipelineRunner {
  constructor(
    private readonly taskEvents: TaskEventBus,
    private readonly appPaths: AppPaths,
  ) {}

  async run(
    backendBaseUrl: string,
    pdfPath: string,
    options: RunPdfOcrPipelineOptions = {},
  ): Promise<PdfOcrPipelineResult> {
    const exportDoubleLayer = options.exportDoubleLayer ?? true;
    const absolutePdf = path.resolve(pdfPath);

    const resolved = resolveOcrRunOptions(options);

    const submit = await submitOcrBatchFromPdf(backendBaseUrl, absolutePdf, {
      dpi: resolved.dpi,
      mode: resolved.mode,
      lang: resolved.lang,
      contentTop: resolved.contentRegion.contentTop,
      contentBottom: resolved.contentRegion.contentBottom,
    });

    const taskId = submit.batchId;
    const createdAt = new Date().toISOString();
    const pipelineOptions: PipelineOptions = {
      mode: resolved.mode,
      lang: resolved.lang,
      dpi: resolved.dpi,
      contentTop: resolved.contentRegion.contentTop,
      contentBottom: resolved.contentRegion.contentBottom,
    };

    this.persistTask({
      batchId: taskId,
      sourcePdf: absolutePdf,
      status: "running",
      phase: "ocr",
      createdAt,
      pipelineOptions,
      result: {
        batchId: taskId,
        status: "pending",
        progress: 0,
        pageCount: submit.pageCount,
        completedCount: 0,
        failedCount: 0,
        pages: [],
      },
    });

    this.taskEvents.emit(TASK_EVENTS.start, {
      task_id: taskId,
      status: "started",
      progress: 0,
      message: `PDF OCR pipeline queued (${submit.pageCount} pages)`,
    });

    const pageCount = submit.pageCount;
    const defaultTimeoutMs = Math.max(600_000, pageCount * 45_000);

    const result = await pollOcrBatchWithEvents(this.taskEvents, backendBaseUrl, taskId, {
      pollMs: options.pollMs,
      timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
      suppressTerminalEvents: exportDoubleLayer,
    });

    this.persistTask({
      batchId: taskId,
      sourcePdf: absolutePdf,
      status: result.status,
      phase: result.status === "completed" && exportDoubleLayer ? "export" : result.status === "completed" ? "completed" : "failed",
      createdAt,
      pipelineOptions,
      result,
      lastError: result.status === "failed" ? (result.error ?? "OCR failed") : null,
    });

    return this.finishPipeline(backendBaseUrl, {
      taskId,
      pdfPath: absolutePdf,
      createdAt,
      pipelineOptions,
      result,
      exportDoubleLayer,
    });
  }

  async resume(
    backendBaseUrl: string,
    batchId: string,
    options: RunPdfOcrPipelineOptions = {},
  ): Promise<PdfOcrPipelineResult> {
    const task = loadOcrTask(this.appPaths.tasks, batchId);
    if (!task) {
      throw new Error(`Task not found: ${batchId}`);
    }

    if (exportFileExists(task.exportPath)) {
      return {
        batchId: task.batchId,
        result: task.result!,
        taskPath: path.join(this.appPaths.tasks, `${batchId}.json`),
        exportPath: task.exportPath ?? undefined,
      };
    }

    const absolutePdf = path.resolve(task.sourcePdf);
    if (!fs.existsSync(absolutePdf)) {
      throw new Error(`Source PDF missing: ${absolutePdf}`);
    }

    const exportDoubleLayer = options.exportDoubleLayer ?? true;
    const pipelineOptions = { ...task.pipelineOptions, ...options };
    const createdAt = task.createdAt;

    this.taskEvents.emit(TASK_EVENTS.start, {
      task_id: batchId,
      status: "started",
      progress: task.result?.progress ?? 0,
      message: `Resuming task ${batchId}`,
    });

    let result = task.result;
    if (result?.status !== "completed") {
      try {
        const live = await fetchOcrBatchResult(backendBaseUrl, batchId);
        if (live.status === "completed" || live.status === "failed") {
          result = live;
        } else {
          const pageCount = live.pageCount || task.result?.pageCount || 1;
          const defaultTimeoutMs = Math.max(600_000, pageCount * 45_000);
          result = await pollOcrBatchWithEvents(this.taskEvents, backendBaseUrl, batchId, {
            pollMs: options.pollMs,
            timeoutMs: options.timeoutMs ?? defaultTimeoutMs,
            suppressTerminalEvents: exportDoubleLayer,
          });
        }
      } catch {
        return this.run(backendBaseUrl, absolutePdf, {
          ...pipelineOptions,
          ...options,
          exportDoubleLayer,
        });
      }
    }

    if (!result) {
      return this.run(backendBaseUrl, absolutePdf, {
        ...pipelineOptions,
        ...options,
        exportDoubleLayer,
      });
    }

    this.persistTask({
      batchId,
      sourcePdf: absolutePdf,
      status: result.status,
      phase: result.status === "completed" && exportDoubleLayer ? "export" : result.status === "completed" ? "completed" : "failed",
      createdAt,
      pipelineOptions,
      result,
      lastError: result.status === "failed" ? (result.error ?? "OCR failed") : null,
    });

    return this.finishPipeline(backendBaseUrl, {
      taskId: batchId,
      pdfPath: absolutePdf,
      createdAt,
      pipelineOptions,
      result,
      exportDoubleLayer,
      persistedTask: task,
    });
  }

  private async finishPipeline(
    backendBaseUrl: string,
    context: {
      taskId: string;
      pdfPath: string;
      createdAt: string;
      pipelineOptions: PipelineOptions;
      result: OcrBatchResultResponse;
      exportDoubleLayer: boolean;
      persistedTask?: PersistedOcrTask;
    },
  ): Promise<PdfOcrPipelineResult> {
    const { taskId, pdfPath, createdAt, pipelineOptions, result, exportDoubleLayer, persistedTask } =
      context;

    let exportPath: string | undefined;
    let finalStatus = result.status;
    let lastError: string | null = result.status === "failed" ? (result.error ?? "OCR failed") : null;

    if (exportDoubleLayer && result.status === "completed") {
      const pageCount = result.pageCount;
      const doubleLayerTimeoutMs = Math.max(600_000, pageCount * 30_000);

      this.taskEvents.emit(TASK_EVENTS.progress, {
        task_id: taskId,
        status: "running",
        progress: 95,
        message: `Building double-layer PDF (${pageCount} pages, may take several minutes)…`,
      });

      try {
        const batchResultJson =
          batchResultJsonForExport(persistedTask ?? { batchId: taskId, sourcePdf: pdfPath, status: result.status, createdAt, result }) ??
          batchResultJsonForExport({
            batchId: taskId,
            sourcePdf: pdfPath,
            status: result.status,
            createdAt,
            result,
          });

        await ensurePageImageCache(
          this.appPaths.cache,
          backendBaseUrl,
          taskId,
          pageCount,
        );

        const pdfBytes = await fetchDoubleLayerPdf(backendBaseUrl, pdfPath, taskId, {
          timeoutMs: doubleLayerTimeoutMs,
          batchResultJson,
          pageCacheDir: this.appPaths.cache,
          pageCount,
        });
        const targetExportPath = buildExportPath(this.appPaths.exports, pdfPath);
        exportPath = await writeExportPdf(this.appPaths.exports, targetExportPath, pdfBytes);

        const stubEngine = result.pages.some((page) => page.text?.startsWith("stub:"));
        const stubNote = stubEngine
          ? " (stub: English placeholders only — Chinese body is image-only; use Paddle OCR for real text layer)"
          : "";

        this.taskEvents.emit(TASK_EVENTS.complete, {
          task_id: taskId,
          status: "completed",
          progress: 100,
          message: `Pipeline complete — exported ${path.basename(exportPath)}${stubNote}`,
        });
        finalStatus = "completed";
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Double-layer PDF export failed";
        lastError = message;
        finalStatus = "failed";
        this.taskEvents.emit(TASK_EVENTS.failed, {
          task_id: taskId,
          status: "failed",
          progress: 95,
          message,
        });
        this.persistTask({
          batchId: taskId,
          sourcePdf: pdfPath,
          status: finalStatus,
          phase: "export",
          createdAt,
          pipelineOptions,
          result,
          exportPath: null,
          lastError: message,
          completedAt: new Date().toISOString(),
        });
        throw error;
      }
    } else if (result.status === "completed") {
      this.taskEvents.emit(TASK_EVENTS.complete, {
        task_id: taskId,
        status: "completed",
        progress: 100,
        message: `OCR complete (${result.completedCount}/${result.pageCount})`,
      });
    } else if (result.status === "failed") {
      this.taskEvents.emit(TASK_EVENTS.failed, {
        task_id: taskId,
        status: "failed",
        progress: result.progress,
        message: result.error ?? "PDF OCR pipeline failed",
      });
    }

    const taskPath = this.persistTask({
      batchId: taskId,
      sourcePdf: pdfPath,
      status: finalStatus,
      phase: exportPath ? "completed" : finalStatus === "failed" ? "failed" : "export",
      createdAt,
      completedAt: new Date().toISOString(),
      pipelineOptions,
      result,
      exportPath: exportPath ?? null,
      lastError,
    });

    return { batchId: taskId, result, taskPath, exportPath };
  }

  private persistTask(task: PersistedOcrTask): string {
    return saveOcrTask(this.appPaths.tasks, task);
  }
}

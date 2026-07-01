import { ipcMain, shell, dialog } from "electron";
import path from "node:path";

import { IPC } from "../../shared/ipcChannels.js";
import { resolveOcrRunOptions } from "../../shared/ocrLang.js";
import type { AppPaths, OcrBatchResultResponse, OcrProcessResult, OcrTaskSummary, PdfOcrPipelineResult, PickedPdfFile, PdfPagePreviewResult, ServiceKind } from "../../shared/types.js";
import type { ProcessManager } from "../processManager.js";
import type { TaskEventBus } from "./taskEvents.js";
import { OcrBatchRunner } from "../ocrBatchRunner.js";
import { PdfOcrPipelineRunner } from "../pdfOcrPipelineRunner.js";
import { fetchPdfPagePreview } from "../ocrPdfPipelineClient.js";
import { listOcrTaskSummaries, loadOcrTask } from "../taskPersistence.js";

const SERVICE_KINDS: ServiceKind[] = ["java-backend", "ocr-service"];

function assertServiceKind(value: unknown): ServiceKind {
  if (typeof value !== "string" || !SERVICE_KINDS.includes(value as ServiceKind)) {
    throw new Error(`Invalid service kind: ${String(value)}`);
  }
  return value as ServiceKind;
}

export interface RegisterIpcHandlersOptions {
  processManager: ProcessManager;
  appPaths: AppPaths;
  taskEvents: TaskEventBus;
}

function resolveOcrRunOptionsFromIpc(value: unknown) {
  return resolveOcrRunOptions(value);
}

/** Register Renderer → Main IPC handlers. */
export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const { processManager, appPaths, taskEvents } = options;
  const batchRunner = new OcrBatchRunner(taskEvents);
  const pdfPipelineRunner = new PdfOcrPipelineRunner(taskEvents, appPaths);

  ipcMain.handle(IPC.services.getStates, () => processManager.getStates());

  ipcMain.handle(IPC.services.getBackendBaseUrl, () =>
    processManager.getBackendBaseUrl(),
  );

  ipcMain.handle(IPC.services.restart, async (_event, kind: unknown) => {
    const serviceKind = assertServiceKind(kind);
    return processManager.restart(serviceKind);
  });

  ipcMain.handle(IPC.app.getPaths, () => appPaths);

  ipcMain.handle(IPC.app.openLogsDir, async () => {
    const result = await shell.openPath(appPaths.logs);
    if (result) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IPC.tasks.list, (): OcrTaskSummary[] =>
    listOcrTaskSummaries(appPaths.tasks),
  );

  ipcMain.handle(IPC.tasks.openExportsDir, async () => {
    const result = await shell.openPath(appPaths.exports);
    if (result) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IPC.tasks.openExport, async (_event, batchId: unknown) => {
    if (typeof batchId !== "string" || !batchId.trim()) {
      throw new Error("Invalid task id");
    }
    const task = loadOcrTask(appPaths.tasks, batchId);
    if (!task?.exportPath) {
      throw new Error("Export file not recorded for this task");
    }
    const result = await shell.openPath(task.exportPath);
    if (result) {
      throw new Error(result);
    }
  });

  ipcMain.handle(IPC.tasks.resume, async (_event, batchId: unknown): Promise<PdfOcrPipelineResult> => {
    if (typeof batchId !== "string" || !batchId.trim()) {
      throw new Error("Invalid task id");
    }
    const backendBaseUrl = processManager.getBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error("Java backend is not available");
    }
    return pdfPipelineRunner.resume(backendBaseUrl, batchId);
  });

  ipcMain.handle(IPC.dev.emitDemoTaskEvents, async () => {
    await taskEvents.emitDemoSequence();
  });

  ipcMain.handle(IPC.ocr.refreshProxyHealth, async () =>
    processManager.refreshOcrProxyHealth(),
  );

  ipcMain.handle(IPC.ocr.pickAndProcess, async (_event, options: unknown): Promise<OcrProcessResult> => {
    const ocrOptions = resolveOcrRunOptionsFromIpc(options);
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "tif", "tiff"],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return {
        ok: false,
        httpStatus: 0,
        body: "",
        cancelled: true,
        error: null,
      };
    }

    return processManager.runOcrViaBackend(result.filePaths[0]!, ocrOptions);
  });

  ipcMain.handle(IPC.ocr.pickAndRunBatch, async (_event, options: unknown): Promise<OcrBatchResultResponse | null> => {
    const ocrOptions = resolveOcrRunOptionsFromIpc(options);
    const backendBaseUrl = processManager.getBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error("Java backend is not available");
    }

    const result = await dialog.showOpenDialog({
      properties: ["openFile", "multiSelections"],
      filters: [
        {
          name: "Images",
          extensions: ["png", "jpg", "jpeg", "tif", "tiff"],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return batchRunner.run(backendBaseUrl, result.filePaths, ocrOptions);
  });

  ipcMain.handle(IPC.ocr.pickPdfForPipeline, async (): Promise<PickedPdfFile | null> => {
    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const pdfPath = result.filePaths[0]!;
    return { pdfPath, fileName: path.basename(pdfPath) };
  });

  ipcMain.handle(
    IPC.ocr.fetchPdfPagePreview,
    async (_event, pdfPath: unknown, previewOptions: unknown): Promise<PdfPagePreviewResult> => {
      if (typeof pdfPath !== "string" || !pdfPath.trim()) {
        throw new Error("Invalid PDF path");
      }
      const backendBaseUrl = processManager.getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error("Java backend is not available");
      }
      const raw =
        previewOptions && typeof previewOptions === "object"
          ? (previewOptions as { pageIndex?: number; dpi?: number; lang?: string })
          : {};
      const resolved = resolveOcrRunOptionsFromIpc(previewOptions);
      return fetchPdfPagePreview(backendBaseUrl, pdfPath, {
        pageIndex: raw.pageIndex,
        dpi: typeof raw.dpi === "number" ? raw.dpi : resolved.dpi,
      });
    },
  );

  ipcMain.handle(
    IPC.ocr.runPdfPipeline,
    async (_event, pdfPath: unknown, options: unknown): Promise<PdfOcrPipelineResult> => {
      if (typeof pdfPath !== "string" || !pdfPath.trim()) {
        throw new Error("Invalid PDF path");
      }
      const backendBaseUrl = processManager.getBackendBaseUrl();
      if (!backendBaseUrl) {
        throw new Error("Java backend is not available");
      }
      const ocrOptions = resolveOcrRunOptionsFromIpc(options);
      return pdfPipelineRunner.run(backendBaseUrl, pdfPath, ocrOptions);
    },
  );

  ipcMain.handle(IPC.ocr.pickPdfAndRunPipeline, async (_event, options: unknown): Promise<PdfOcrPipelineResult | null> => {
    const ocrOptions = resolveOcrRunOptionsFromIpc(options);
    const backendBaseUrl = processManager.getBackendBaseUrl();
    if (!backendBaseUrl) {
      throw new Error("Java backend is not available");
    }

    const result = await dialog.showOpenDialog({
      properties: ["openFile"],
      filters: [
        {
          name: "PDF",
          extensions: ["pdf"],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return pdfPipelineRunner.run(backendBaseUrl, result.filePaths[0]!, ocrOptions);
  });
}

export function unregisterIpcHandlers(): void {
  const channels = [
    IPC.services.getStates,
    IPC.services.getBackendBaseUrl,
    IPC.services.restart,
    IPC.app.getPaths,
    IPC.app.openLogsDir,
    IPC.tasks.list,
    IPC.tasks.resume,
    IPC.tasks.openExport,
    IPC.tasks.openExportsDir,
    IPC.dev.emitDemoTaskEvents,
    IPC.ocr.refreshProxyHealth,
    IPC.ocr.pickAndProcess,
    IPC.ocr.pickAndRunBatch,
    IPC.ocr.pickPdfAndRunPipeline,
    IPC.ocr.pickPdfForPipeline,
    IPC.ocr.fetchPdfPagePreview,
    IPC.ocr.runPdfPipeline,
  ];

  for (const channel of channels) {
    ipcMain.removeHandler(channel);
  }
}

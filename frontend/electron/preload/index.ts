import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

import { ALL_TASK_EVENT_CHANNELS, IPC } from "../shared/ipcChannels.js";
import type {
  ElectronAPI,
  OcrRunOptions,
  ServiceKind,
  TaskEventEnvelope,
} from "../shared/types.js";

const electronAPI: ElectronAPI = {
  getServiceStates: () => ipcRenderer.invoke(IPC.services.getStates),

  getBackendBaseUrl: () => ipcRenderer.invoke(IPC.services.getBackendBaseUrl),

  restartService: (kind: ServiceKind) =>
    ipcRenderer.invoke(IPC.services.restart, kind),

  getAppPaths: () => ipcRenderer.invoke(IPC.app.getPaths),

  openLogsDir: () => ipcRenderer.invoke(IPC.app.openLogsDir),

  onTaskEvent: (callback: (envelope: TaskEventEnvelope) => void) => {
    const handlers = ALL_TASK_EVENT_CHANNELS.map((channel) => {
      const handler = (_event: IpcRendererEvent, envelope: TaskEventEnvelope) => {
        callback(envelope);
      };
      ipcRenderer.on(channel, handler);
      return { channel, handler };
    });

    return () => {
      for (const { channel, handler } of handlers) {
        ipcRenderer.removeListener(channel, handler);
      }
    };
  },

  emitDemoTaskEvents: () => ipcRenderer.invoke(IPC.dev.emitDemoTaskEvents),

  refreshOcrProxyHealth: () => ipcRenderer.invoke(IPC.ocr.refreshProxyHealth),

  pickAndProcessOcr: (options?: OcrRunOptions) =>
    ipcRenderer.invoke(IPC.ocr.pickAndProcess, options ?? {}),

  pickAndRunOcrBatch: (options?: OcrRunOptions) =>
    ipcRenderer.invoke(IPC.ocr.pickAndRunBatch, options ?? {}),

  pickPdfAndRunPipeline: (options?: OcrRunOptions) =>
    ipcRenderer.invoke(IPC.ocr.pickPdfAndRunPipeline, options ?? {}),

  pickPdfForPipeline: () => ipcRenderer.invoke(IPC.ocr.pickPdfForPipeline),

  fetchPdfPagePreview: (
    pdfPath: string,
    options?: { pageIndex?: number; dpi?: number },
  ) => ipcRenderer.invoke(IPC.ocr.fetchPdfPagePreview, pdfPath, options ?? {}),

  runPdfPipeline: (pdfPath: string, options?: OcrRunOptions) =>
    ipcRenderer.invoke(IPC.ocr.runPdfPipeline, pdfPath, options ?? {}),

  listOcrTasks: () => ipcRenderer.invoke(IPC.tasks.list),

  resumeOcrTask: (batchId: string) => ipcRenderer.invoke(IPC.tasks.resume, batchId),

  openTaskExport: (batchId: string) => ipcRenderer.invoke(IPC.tasks.openExport, batchId),

  openExportsDir: () => ipcRenderer.invoke(IPC.tasks.openExportsDir),
};

contextBridge.exposeInMainWorld("electronAPI", electronAPI);

import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { IPC } from "../../shared/ipcChannels.js";

describe("registerIpcHandlers channels", () => {
  it("defines all Renderer invoke channels from 1_PLAN", () => {
    assert.equal(IPC.services.getStates, "services:getStates");
    assert.equal(IPC.services.getBackendBaseUrl, "services:getBackendBaseUrl");
    assert.equal(IPC.services.restart, "services:restart");
    assert.equal(IPC.app.getPaths, "app:getPaths");
    assert.equal(IPC.app.openLogsDir, "app:openLogsDir");
    assert.equal(IPC.dev.emitDemoTaskEvents, "dev:emitDemoTaskEvents");
    assert.equal(IPC.ocr.refreshProxyHealth, "ocr:refreshProxyHealth");
    assert.equal(IPC.ocr.pickAndProcess, "ocr:pickAndProcess");
    assert.equal(IPC.ocr.pickAndRunBatch, "ocr:pickAndRunBatch");
    assert.equal(IPC.ocr.pickPdfAndRunPipeline, "ocr:pickPdfAndRunPipeline");
    assert.equal(IPC.ocr.pickPdfForPipeline, "ocr:pickPdfForPipeline");
    assert.equal(IPC.ocr.fetchPdfPagePreview, "ocr:fetchPdfPagePreview");
    assert.equal(IPC.ocr.runPdfPipeline, "ocr:runPdfPipeline");
    assert.equal(IPC.tasks.list, "tasks:list");
    assert.equal(IPC.tasks.resume, "tasks:resume");
    assert.equal(IPC.tasks.openExport, "tasks:openExport");
    assert.equal(IPC.tasks.openExportsDir, "tasks:openExportsDir");
  });
});

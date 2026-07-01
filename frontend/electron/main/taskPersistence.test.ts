import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildExportPath,
  buildFallbackExportPath,
  deriveResumeKind,
  listOcrTaskSummaries,
  loadOcrTask,
  saveOcrTask,
  writeExportPdf,
  type PersistedOcrTask,
} from "./taskPersistence.js";

describe("taskPersistence", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfsaas-task-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("saves and loads OCR task JSON", () => {
    const task: PersistedOcrTask = {
      batchId: "batch-123",
      sourcePdf: "C:\\docs\\sample.pdf",
      status: "completed",
      phase: "completed",
      createdAt: "2026-06-30T00:00:00.000Z",
      completedAt: "2026-06-30T00:01:00.000Z",
      result: {
        batchId: "batch-123",
        status: "completed",
        progress: 100,
        pageCount: 1,
        completedCount: 1,
        failedCount: 0,
        pages: [],
      },
      exportPath: null,
    };

    const filePath = saveOcrTask(tempDir, task);
    assert.ok(fs.existsSync(filePath));

    const loaded = loadOcrTask(tempDir, "batch-123");
    assert.equal(loaded?.batchId, "batch-123");
    assert.equal(loaded?.phase, "completed");
    assert.ok(loaded?.updatedAt);
  });

  it("builds export path from source PDF basename", () => {
    const exportPath = buildExportPath(tempDir, "C:\\docs\\scan.pdf");
    assert.equal(exportPath, path.join(tempDir, "scan-double-layer.pdf"));
  });

  it("writes export PDF to disk", async () => {
    const exportPath = buildExportPath(tempDir, "C:\\docs\\scan.pdf");
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

    const written = await writeExportPdf(tempDir, exportPath, bytes);
    assert.equal(written, exportPath);
    assert.equal(fs.readFileSync(exportPath).compare(Buffer.from(bytes)), 0);
  });

  it("builds unique fallback export paths", () => {
    const exportPath = buildExportPath(tempDir, "C:\\docs\\scan.pdf");
    fs.writeFileSync(exportPath, "locked");

    const fallback = buildFallbackExportPath(exportPath);
    assert.notEqual(fallback, exportPath);
    assert.match(path.basename(fallback), /^scan-double-layer-/);
  });

  it("lists tasks newest first and derives resume kind", () => {
    saveOcrTask(tempDir, {
      batchId: "older",
      sourcePdf: "C:\\docs\\old.pdf",
      status: "failed",
      phase: "failed",
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      result: {
        batchId: "older",
        status: "failed",
        progress: 40,
        pageCount: 10,
        completedCount: 4,
        failedCount: 1,
        pages: [],
        error: "timed out",
      },
    });

    saveOcrTask(tempDir, {
      batchId: "newer",
      sourcePdf: "C:\\docs\\new.pdf",
      status: "running",
      phase: "export",
      createdAt: "2026-06-30T01:00:00.000Z",
      updatedAt: "2026-06-30T02:00:00.000Z",
      result: {
        batchId: "newer",
        status: "completed",
        progress: 100,
        pageCount: 5,
        completedCount: 5,
        failedCount: 0,
        pages: [],
      },
    });

    const summaries = listOcrTaskSummaries(tempDir);
    assert.equal(summaries.length, 2);
    assert.equal(summaries[0]?.batchId, "newer");
    assert.equal(summaries[0]?.resumeKind, "export");
    const olderTask = loadOcrTask(tempDir, "older");
    assert.ok(olderTask);
    assert.equal(deriveResumeKind(olderTask!), "rerun");
    assert.equal(summaries[1]?.sourceFileName, "old.pdf");
  });
});

import fs from "node:fs";
import path from "node:path";

import type { OcrBatchResultResponse } from "../shared/types.js";

const EXPORT_WRITE_MAX_ATTEMPTS = 8;
const EXPORT_WRITE_RETRY_MS = 250;

export type OcrTaskPhase = "ocr" | "export" | "completed" | "failed";

export type TaskResumeKind = "none" | "export" | "continue" | "rerun";

export interface PipelineOptions {
  mode?: string;
  lang?: string;
  dpi?: number;
  contentTop?: number;
  contentBottom?: number;
}

export interface PersistedOcrTask {
  batchId: string;
  sourcePdf: string;
  status: string;
  phase?: OcrTaskPhase;
  createdAt: string;
  updatedAt?: string;
  completedAt?: string;
  lastError?: string | null;
  result?: OcrBatchResultResponse | null;
  exportPath?: string | null;
  pipelineOptions?: PipelineOptions;
}

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

export function taskFilePath(tasksDir: string, batchId: string): string {
  return path.join(tasksDir, `${batchId}.json`);
}

export function saveOcrTask(tasksDir: string, task: PersistedOcrTask): string {
  fs.mkdirSync(tasksDir, { recursive: true });
  const filePath = taskFilePath(tasksDir, task.batchId);
  const payload: PersistedOcrTask = {
    ...task,
    updatedAt: task.updatedAt ?? new Date().toISOString(),
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), "utf8");
  return filePath;
}

export function loadOcrTask(tasksDir: string, batchId: string): PersistedOcrTask | null {
  const filePath = taskFilePath(tasksDir, batchId);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw) as PersistedOcrTask;
}

export function listOcrTasks(tasksDir: string): PersistedOcrTask[] {
  if (!fs.existsSync(tasksDir)) {
    return [];
  }

  const tasks: PersistedOcrTask[] = [];
  for (const entry of fs.readdirSync(tasksDir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) {
      continue;
    }
    try {
      const raw = fs.readFileSync(path.join(tasksDir, entry.name), "utf8");
      tasks.push(JSON.parse(raw) as PersistedOcrTask);
    } catch {
      // Skip corrupt task files.
    }
  }

  return tasks.sort((left, right) => {
    const leftTime = Date.parse(left.updatedAt ?? left.createdAt);
    const rightTime = Date.parse(right.updatedAt ?? right.createdAt);
    return rightTime - leftTime;
  });
}

export function exportFileExists(exportPath: string | null | undefined): boolean {
  return Boolean(exportPath && fs.existsSync(exportPath));
}

export function deriveResumeKind(task: PersistedOcrTask): TaskResumeKind {
  if (exportFileExists(task.exportPath)) {
    return "none";
  }

  const result = task.result;
  if (result?.status === "completed") {
    return "export";
  }

  if (
    task.phase === "ocr" ||
    result?.status === "running" ||
    result?.status === "pending" ||
    task.status === "running"
  ) {
    return "continue";
  }

  if (task.status === "failed" || result?.status === "failed") {
    return "rerun";
  }

  return "none";
}

export function summarizeOcrTask(task: PersistedOcrTask): OcrTaskSummary {
  const result = task.result;
  const phase =
    task.phase ??
    (task.status === "failed"
      ? "failed"
      : exportFileExists(task.exportPath)
        ? "completed"
        : result?.status === "completed"
          ? "export"
          : "ocr");

  return {
    batchId: task.batchId,
    sourcePdf: task.sourcePdf,
    sourceFileName: path.basename(task.sourcePdf),
    status: task.status,
    phase,
    progress: result?.progress ?? (phase === "completed" ? 100 : 0),
    pageCount: result?.pageCount ?? 0,
    createdAt: task.createdAt,
    updatedAt: task.updatedAt ?? task.createdAt,
    exportPath: task.exportPath ?? null,
    hasExportFile: exportFileExists(task.exportPath),
    resumeKind: deriveResumeKind(task),
    lastError: task.lastError ?? result?.error ?? null,
  };
}

export function listOcrTaskSummaries(tasksDir: string): OcrTaskSummary[] {
  return listOcrTasks(tasksDir).map(summarizeOcrTask);
}

export function buildExportPath(exportsDir: string, sourcePdfPath: string): string {
  const base = path.basename(sourcePdfPath, path.extname(sourcePdfPath));
  return path.join(exportsDir, `${base}-double-layer.pdf`);
}

function isFileLockedError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }
  const code = (error as NodeJS.ErrnoException).code;
  return code === "EBUSY" || code === "EPERM" || code === "EACCES";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export function buildFallbackExportPath(exportPath: string): string {
  const dir = path.dirname(exportPath);
  const ext = path.extname(exportPath);
  const base = path.basename(exportPath, ext);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  let candidate = path.join(dir, `${base}-${stamp}${ext}`);
  let counter = 1;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base}-${stamp}-${counter}${ext}`);
    counter += 1;
  }
  return candidate;
}

async function replaceExportFile(tempPath: string, targetPath: string): Promise<void> {
  try {
    await fs.promises.rename(tempPath, targetPath);
    return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== "EEXIST" && code !== "EPERM" && code !== "EBUSY" && code !== "EACCES") {
      throw error;
    }
  }

  try {
    await fs.promises.unlink(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  await fs.promises.rename(tempPath, targetPath);
}

/** Writes export bytes atomically; retries Windows file locks and falls back to a timestamped name. */
export async function writeExportPdf(
  exportsDir: string,
  exportPath: string,
  bytes: Uint8Array,
): Promise<string> {
  fs.mkdirSync(exportsDir, { recursive: true });
  const tempPath = `${exportPath}.${process.pid}.${Date.now()}.tmp`;

  try {
    await fs.promises.writeFile(tempPath, bytes);

    for (let attempt = 0; attempt < EXPORT_WRITE_MAX_ATTEMPTS; attempt++) {
      try {
        await replaceExportFile(tempPath, exportPath);
        return exportPath;
      } catch (error) {
        if (!isFileLockedError(error) || attempt === EXPORT_WRITE_MAX_ATTEMPTS - 1) {
          break;
        }
        await delay(EXPORT_WRITE_RETRY_MS * (attempt + 1));
      }
    }

    const fallbackPath = buildFallbackExportPath(exportPath);
    await fs.promises.rename(tempPath, fallbackPath);
    return fallbackPath;
  } catch (error) {
    try {
      await fs.promises.unlink(tempPath);
    } catch {
      // Ignore cleanup failure.
    }
    throw error;
  }
}

export function batchResultJsonForExport(task: PersistedOcrTask): string | undefined {
  if (!task.result || task.result.status !== "completed") {
    return undefined;
  }
  return JSON.stringify(task.result);
}

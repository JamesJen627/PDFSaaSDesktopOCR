import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AppPaths } from "../shared/types.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

const APP_DATA_DIR_NAME = "app_data";
const SUBDIRS = ["tasks", "cache", "exports", "logs"] as const;

/**
 * Resolve the user-writable app_data root.
 * Uses ELECTRON_APP_DATA_DIR when set (tests/dev overrides), otherwise
 * `%APPDATA%/PDFSaaSDesktopOCR/app_data` on Windows or `~/.pdfsaas-desktop-ocr/app_data`.
 */
export function resolveAppDataRoot(): string {
  if (process.env.ELECTRON_APP_DATA_DIR) {
    return path.resolve(process.env.ELECTRON_APP_DATA_DIR);
  }

  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, "PDFSaaSDesktopOCR", APP_DATA_DIR_NAME);
  }

  return path.join(os.homedir(), ".pdfsaas-desktop-ocr", APP_DATA_DIR_NAME);
}

/** Build absolute paths for all PRD app_data subdirectories. */
export function buildAppPaths(root: string = resolveAppDataRoot()): AppPaths {
  return {
    root,
    tasks: path.join(root, "tasks"),
    cache: path.join(root, "cache"),
    exports: path.join(root, "exports"),
    logs: path.join(root, "logs"),
  };
}

/** Create app_data/{tasks,cache,exports,logs} if missing. Idempotent. */
export function ensureAppDataDirectories(paths: AppPaths = buildAppPaths()): AppPaths {
  fs.mkdirSync(paths.root, { recursive: true });
  for (const sub of SUBDIRS) {
    fs.mkdirSync(paths[sub], { recursive: true });
  }
  return paths;
}

/** Resolve bundled resources directory (JRE, JAR, ocr-service stub). */
export function resolveResourcesDir(): string {
  if (process.env.ELECTRON_RESOURCES_DIR) {
    return path.resolve(process.env.ELECTRON_RESOURCES_DIR);
  }
  // Dev default relative to compiled main output: frontend/electron/resources/dev
  return path.resolve(moduleDir, "..", "resources", "dev");
}

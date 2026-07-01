import path from "node:path";

import type { ElectronConfig } from "../shared/types.js";
import { resolveResourcesDir } from "./appPaths.js";

function parseIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

/** Load Electron main-process configuration from environment variables. */
export function loadElectronConfig(
  isPackaged = false,
  packagedResourcesPath?: string,
): ElectronConfig {
  const resourcesDir =
    isPackaged && packagedResourcesPath
      ? path.resolve(packagedResourcesPath)
      : resolveResourcesDir();

  return {
    backendStartTimeoutMs: parseIntEnv("ELECTRON_BACKEND_START_TIMEOUT_MS", 120_000),
    healthPollMs: parseIntEnv("ELECTRON_HEALTH_POLL_MS", 3_000),
    ocrServicePort: parseIntEnv("OCR_SERVICE_PORT", 5002),
    externalBackendUrl: process.env.ELECTRON_USE_EXTERNAL_BACKEND?.trim() || null,
    externalOcrUrl: process.env.ELECTRON_USE_EXTERNAL_OCR?.trim() || null,
    resourcesDir,
  };
}

export function isDevMode(): boolean {
  return process.env.NODE_ENV !== "production" && !process.env.ELECTRON_FORCE_PROD;
}

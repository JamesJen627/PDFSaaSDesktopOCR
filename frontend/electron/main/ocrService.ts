import fs from "node:fs";
import path from "node:path";

import type { AppPaths, ElectronConfig, ManagedServiceState } from "../shared/types.js";
import { isDevMode } from "./config.js";
import { checkOcrServiceHealth, pollUntilHealthy } from "./healthCheck.js";
import { resolveResourcePaths } from "./resourcePaths.js";
import {
  assertCanStart,
  createInitialState,
  patchState,
  transitionTo,
} from "./serviceState.js";

export interface OcrServiceOptions {
  config: ElectronConfig;
  appPaths: AppPaths;
  onStateChange?: (state: ManagedServiceState) => void;
}

type ManagedProcess = {
  child: import("node:child_process").ChildProcess;
  startTimer: NodeJS.Timeout | null;
};

/**
 * Manages the local Python OCR service (PaddleOCR via uvicorn).
 */
export class OcrService {
  private state: ManagedServiceState = createInitialState("ocr-service");
  private process: ManagedProcess | null = null;
  private readonly logFile: string;

  constructor(private readonly options: OcrServiceOptions) {
    this.logFile = path.join(options.appPaths.logs, "ocr-service.log");
  }

  getState(): ManagedServiceState {
    return this.state;
  }

  getBaseUrl(): string | null {
    if (this.state.status !== "healthy" || !this.state.port) {
      return null;
    }
    return `http://127.0.0.1:${this.state.port}`;
  }

  async start(): Promise<ManagedServiceState> {
    assertCanStart(this.state);

    if (process.env.ELECTRON_FORCE_OCR_STUB === "true") {
      return this.startLegacyStub();
    }

    if (this.options.config.externalOcrUrl) {
      return this.startExternal(this.options.config.externalOcrUrl);
    }

    if (isDevMode() && process.env.ELECTRON_START_OCR !== "true") {
      this.setState(
        patchState(this.state, {
          status: "idle",
          port: this.options.config.ocrServicePort,
          lastError: null,
          startedAt: null,
        }),
      );
      return this.state;
    }

    return this.startManagedProcess();
  }

  async stop(): Promise<ManagedServiceState> {
    this.clearStartTimer();

    if (this.process?.child) {
      await terminateProcess(this.process.child);
      this.process = null;
    }

    this.setState(
      transitionTo(this.state, "stopped", {
        port: null,
        pid: null,
      }),
    );
    return this.state;
  }

  private async startLegacyStub(): Promise<ManagedServiceState> {
    this.setState(
      patchState(this.state, {
        status: "idle",
        port: this.options.config.ocrServicePort,
        lastError: null,
        startedAt: null,
      }),
    );
    return this.state;
  }

  private async startExternal(baseUrl: string): Promise<ManagedServiceState> {
    const normalized = baseUrl.replace(/\/$/, "");
    const port = parsePortFromUrl(normalized) ?? this.options.config.ocrServicePort;

    this.setState(
      transitionTo(this.state, "starting", {
        port,
        pid: null,
        lastError: null,
        startedAt: new Date().toISOString(),
      }),
    );

    const healthy = await pollUntilOcrHealthy({
      baseUrl: normalized,
      pollMs: this.options.config.healthPollMs,
      timeoutMs: this.options.config.backendStartTimeoutMs,
    });

    if (!healthy) {
      this.setState(
        transitionTo(this.state, "unhealthy", {
          lastError: `External OCR service did not become healthy: ${normalized}`,
        }),
      );
      return this.state;
    }

    this.setState(transitionTo(this.state, "healthy"));
    return this.state;
  }

  private async startManagedProcess(): Promise<ManagedServiceState> {
    const { spawn } = await import("node:child_process");

    let resources;
    try {
      resources = resolveResourcePaths(this.options.config.resourcesDir);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setState(
        transitionTo(this.state, "unhealthy", {
          lastError: message,
        }),
      );
      return this.state;
    }

    const startScript = resolveStartScript(resources.ocrServiceDir);
    if (!startScript) {
      this.setState(
        transitionTo(this.state, "unhealthy", {
          lastError: `OCR start script missing under ${resources.ocrServiceDir}`,
        }),
      );
      return this.state;
    }

    const port = this.options.config.ocrServicePort;
    const baseUrl = `http://127.0.0.1:${port}`;

    this.setState(
      transitionTo(this.state, "starting", {
        port,
        pid: null,
        lastError: null,
        startedAt: new Date().toISOString(),
      }),
    );

    fs.mkdirSync(this.options.appPaths.logs, { recursive: true });
    appendLogLine(this.logFile, `Starting OCR service: ${startScript}`);

    const child = spawn(startScript, [], {
      cwd: path.dirname(startScript),
      env: {
        ...process.env,
        OCR_SERVICE_PORT: String(port),
        OCR_SERVICE_URL: baseUrl,
        PDFSAAS_OCR_ENGINE: process.env.PDFSAAS_OCR_ENGINE ?? "auto",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
      windowsHide: true,
    });

    this.process = { child, startTimer: null };
    this.setState(patchState(this.state, { pid: child.pid ?? null }));

    child.stdout?.on("data", (chunk: Buffer) => {
      appendLogLine(this.logFile, chunk.toString("utf8").trimEnd());
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      appendLogLine(this.logFile, `[stderr] ${chunk.toString("utf8").trimEnd()}`);
    });

    child.on("exit", (code, signal) => {
      this.clearStartTimer();
      this.process = null;
      const message = `OCR service exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
      appendLogLine(this.logFile, message);
      this.setState(
        transitionTo(this.state, code === 0 ? "stopped" : "crashed", {
          port: null,
          pid: null,
          lastError: code === 0 ? null : message,
        }),
      );
    });

    this.process.startTimer = setTimeout(() => {
      if (this.state.status === "starting") {
        this.setState(
          transitionTo(this.state, "unhealthy", {
            lastError: `OCR start timed out after ${this.options.config.backendStartTimeoutMs}ms`,
          }),
        );
        void this.stop();
      }
    }, this.options.config.backendStartTimeoutMs);

    const healthy = await pollUntilOcrHealthy({
      baseUrl,
      pollMs: this.options.config.healthPollMs,
      timeoutMs: this.options.config.backendStartTimeoutMs,
    });

    this.clearStartTimer();

    if (healthy) {
      this.setState(transitionTo(this.state, "healthy"));
      return this.state;
    }

    this.setState(
      transitionTo(this.state, "unhealthy", {
        lastError: `Health check failed for ${baseUrl}`,
      }),
    );
    return this.state;
  }

  private clearStartTimer(): void {
    if (this.process?.startTimer) {
      clearTimeout(this.process.startTimer);
      this.process.startTimer = null;
    }
  }

  private setState(next: ManagedServiceState): void {
    this.state = next;
    this.options.onStateChange?.(next);
  }
}

function resolveStartScript(ocrServiceDir: string): string | null {
  const candidates =
    process.platform === "win32"
      ? [
          path.join(ocrServiceDir, "scripts", "start.bat"),
          path.join(ocrServiceDir, "start.bat"),
        ]
      : [
          path.join(ocrServiceDir, "scripts", "start.sh"),
          path.join(ocrServiceDir, "start.sh"),
        ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

function appendLogLine(logFile: string, line: string): void {
  if (!line) {
    return;
  }
  fs.appendFileSync(logFile, `${line}\n`, "utf8");
}

function parsePortFromUrl(baseUrl: string): number | null {
  try {
    const url = new URL(baseUrl);
    if (url.port) {
      return Number.parseInt(url.port, 10);
    }
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return null;
  }
}

async function pollUntilOcrHealthy(options: {
  baseUrl: string;
  pollMs: number;
  timeoutMs: number;
}): Promise<boolean> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    if (await checkOcrServiceHealth(options.baseUrl)) {
      return true;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      break;
    }
    await sleep(Math.min(options.pollMs, remaining));
  }
  return false;
}

async function terminateProcess(
  child: import("node:child_process").ChildProcess,
): Promise<void> {
  if (child.killed || child.exitCode !== null) {
    return;
  }

  child.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null && !child.killed) {
        child.kill("SIGKILL");
      }
      resolve();
    }, 5_000);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

import fs from "node:fs";
import path from "node:path";

import type { AppPaths, ElectronConfig, ManagedServiceState, OcrProxyHealth } from "../shared/types.js";
import { pollUntilHealthy } from "./healthCheck.js";
import { fetchBackendOcrProxyHealth } from "./ocrProxyClient.js";
import { extractPortFromRunningLog } from "./portParser.js";
import { resolveResourcePaths } from "./resourcePaths.js";
import {
  assertCanStart,
  createInitialState,
  patchState,
  transitionTo,
} from "./serviceState.js";

export interface JavaBackendServiceOptions {
  config: ElectronConfig;
  appPaths: AppPaths;
  onStateChange?: (state: ManagedServiceState) => void;
}

type ManagedProcess = {
  child: import("node:child_process").ChildProcess;
  healthTimer: NodeJS.Timeout | null;
  startTimer: NodeJS.Timeout | null;
};

export class JavaBackendService {
  private state: ManagedServiceState = createInitialState("java-backend");
  private process: ManagedProcess | null = null;
  private readonly logFile: string;

  constructor(private readonly options: JavaBackendServiceOptions) {
    this.logFile = path.join(options.appPaths.logs, "java-backend.log");
  }

  getState(): ManagedServiceState {
    return this.state;
  }

  getBaseUrl(): string | null {
    if (!this.state.port) {
      return null;
    }
    return `http://127.0.0.1:${this.state.port}`;
  }

  async start(): Promise<ManagedServiceState> {
    assertCanStart(this.state);

    if (this.options.config.externalBackendUrl) {
      return this.startExternal(this.options.config.externalBackendUrl);
    }

    return this.startBundled();
  }

  async stop(): Promise<ManagedServiceState> {
    this.clearTimers();

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

  private async startExternal(baseUrl: string): Promise<ManagedServiceState> {
    const normalized = baseUrl.replace(/\/$/, "");
    const port = parsePortFromUrl(normalized);

    this.setState(
      transitionTo(this.state, "starting", {
        port,
        pid: null,
        lastError: null,
        startedAt: new Date().toISOString(),
      }),
    );

    const healthy = await pollUntilHealthy({
      baseUrl: normalized,
      pollMs: this.options.config.healthPollMs,
      timeoutMs: this.options.config.backendStartTimeoutMs,
    });

    if (!healthy) {
      this.setState(
        transitionTo(this.state, "unhealthy", {
          lastError: `External backend did not become healthy: ${normalized}`,
        }),
      );
      return this.state;
    }

    this.setState(transitionTo(this.state, "healthy"));
    await this.probeOcrProxy(normalized);
    return this.state;
  }

  private async startBundled(): Promise<ManagedServiceState> {
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

    this.setState(
      transitionTo(this.state, "starting", {
        port: null,
        pid: null,
        lastError: null,
        startedAt: new Date().toISOString(),
      }),
    );

    const logDir = this.options.appPaths.logs;
    fs.mkdirSync(logDir, { recursive: true });

    const javaArgs = [
      "-Xmx2g",
      "-DBROWSER_OPEN=false",
      `-Dlogging.file.path=${logDir}`,
      "-Dlogging.file.name=stirling-pdf.log",
      "-Dserver.port=0",
      "-Dsecurity.enableLogin=false",
      "-Dsecurity.csrfDisabled=true",
      "-jar",
      resources.jarPath,
    ];

    appendLogLine(this.logFile, `Starting Java backend: ${resources.jreBin} ${javaArgs.join(" ")}`);

    const child = spawn(resources.jreBin, javaArgs, {
      cwd: this.options.appPaths.root,
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });

    this.process = { child, healthTimer: null, startTimer: null };

    this.setState(
      patchState(this.state, {
        pid: child.pid ?? null,
      }),
    );

    child.stdout?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf8");
      appendLogLine(this.logFile, text.trimEnd());

      for (const line of text.split(/\r?\n/)) {
        const port = extractPortFromRunningLog(line);
        if (port !== null && this.state.port !== port) {
          this.onPortDetected(port);
        }
      }
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      appendLogLine(this.logFile, `[stderr] ${chunk.toString("utf8").trimEnd()}`);
    });

    child.on("exit", (code, signal) => {
      this.clearTimers();
      this.process = null;
      const message = `Java backend exited (code=${code ?? "null"}, signal=${signal ?? "null"})`;
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
            lastError: `Backend start timed out after ${this.options.config.backendStartTimeoutMs}ms`,
          }),
        );
        void this.stop();
      }
    }, this.options.config.backendStartTimeoutMs);

    return this.state;
  }

  private onPortDetected(port: number): void {
    this.setState(patchState(this.state, { port }));
    void this.beginHealthPolling(`http://127.0.0.1:${port}`);
  }

  private async beginHealthPolling(baseUrl: string): Promise<void> {
    if (!this.process) {
      return;
    }

    this.clearHealthTimer();

    const healthy = await pollUntilHealthy({
      baseUrl,
      pollMs: this.options.config.healthPollMs,
      timeoutMs: this.options.config.backendStartTimeoutMs,
    });

    if (this.process?.startTimer) {
      clearTimeout(this.process.startTimer);
      this.process.startTimer = null;
    }

    if (healthy) {
      this.setState(transitionTo(this.state, "healthy"));
      await this.probeOcrProxy(baseUrl);
      return;
    }

    this.setState(
      transitionTo(this.state, "unhealthy", {
        lastError: `Health check failed for ${baseUrl}`,
      }),
    );
  }

  private clearHealthTimer(): void {
    if (this.process?.healthTimer) {
      clearInterval(this.process.healthTimer);
      this.process.healthTimer = null;
    }
  }

  private clearTimers(): void {
    this.clearHealthTimer();
    if (this.process?.startTimer) {
      clearTimeout(this.process.startTimer);
      this.process.startTimer = null;
    }
  }

  async refreshOcrProxyHealth(): Promise<OcrProxyHealth | null> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) {
      return null;
    }
    return this.probeOcrProxy(baseUrl);
  }

  private async probeOcrProxy(baseUrl: string): Promise<OcrProxyHealth> {
    const health = await fetchBackendOcrProxyHealth(baseUrl);
    this.setState(patchState(this.state, { ocrProxy: health }));
    if (health.status !== "UP") {
      appendLogLine(
        this.logFile,
        `OCR proxy via backend: ${health.status}${health.message ? ` (${health.message})` : ""}`,
      );
    } else {
      appendLogLine(
        this.logFile,
        `OCR proxy via backend: UP (engine=${health.engine ?? "unknown"})`,
      );
    }
    return health;
  }

  private setState(next: ManagedServiceState): void {
    this.state = next;
    this.options.onStateChange?.(next);
  }
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

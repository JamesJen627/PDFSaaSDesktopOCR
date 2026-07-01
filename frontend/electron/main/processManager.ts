import { resolveOcrRunOptions } from "../shared/ocrLang.js";
import type {
  AppPaths,
  ElectronConfig,
  ManagedServiceState,
  OcrProcessResult,
  OcrProxyHealth,
  OcrRunOptions,
  ServiceKind,
} from "../shared/types.js";
import { ensureAppDataDirectories } from "./appPaths.js";
import { loadElectronConfig } from "./config.js";
import { JavaBackendService } from "./javaBackendService.js";
import { OcrService } from "./ocrService.js";
import { processOcrImageFile } from "./ocrProxyClient.js";

export interface ProcessManagerOptions {
  config?: ElectronConfig;
  appPaths?: AppPaths;
  onStateChange?: (state: ManagedServiceState) => void;
  isPackaged?: boolean;
  packagedResourcesPath?: string;
}

/**
 * Coordinates java-backend and ocr-service child processes.
 */
export class ProcessManager {
  private readonly config: ElectronConfig;
  private readonly appPaths: AppPaths;
  private readonly javaBackend: JavaBackendService;
  private readonly ocrService: OcrService;

  constructor(options: ProcessManagerOptions = {}) {
    this.appPaths = options.appPaths ?? ensureAppDataDirectories();
    this.config =
      options.config ??
      loadElectronConfig(options.isPackaged ?? false, options.packagedResourcesPath);

    const onStateChange = options.onStateChange;
    this.javaBackend = new JavaBackendService({
      config: this.config,
      appPaths: this.appPaths,
      onStateChange,
    });
    this.ocrService = new OcrService({
      config: this.config,
      appPaths: this.appPaths,
      onStateChange,
    });
  }

  getStates(): ManagedServiceState[] {
    return [this.javaBackend.getState(), this.ocrService.getState()];
  }

  getState(kind: ServiceKind): ManagedServiceState {
    return kind === "java-backend"
      ? this.javaBackend.getState()
      : this.ocrService.getState();
  }

  getBackendBaseUrl(): string | null {
    return this.javaBackend.getBaseUrl();
  }

  getOcrServiceBaseUrl(): string | null {
    return this.ocrService.getBaseUrl();
  }

  async start(kind: ServiceKind): Promise<ManagedServiceState> {
    if (kind === "java-backend") {
      return this.javaBackend.start();
    }
    return this.ocrService.start();
  }

  async stop(kind: ServiceKind): Promise<ManagedServiceState> {
    if (kind === "java-backend") {
      return this.javaBackend.stop();
    }
    return this.ocrService.stop();
  }

  async restart(kind: ServiceKind): Promise<ManagedServiceState> {
    await this.stop(kind);
    return this.start(kind);
  }

  async startAll(): Promise<ManagedServiceState[]> {
    await this.start("java-backend");
    await this.start("ocr-service");
    return this.getStates();
  }

  async shutdownAll(): Promise<void> {
    await this.stop("ocr-service");
    await this.stop("java-backend");
  }

  async refreshOcrProxyHealth(): Promise<OcrProxyHealth | null> {
    return this.javaBackend.refreshOcrProxyHealth();
  }

  async runOcrViaBackend(
    imagePath: string,
    options: OcrRunOptions = {},
  ): Promise<OcrProcessResult> {
    const resolved = resolveOcrRunOptions(options);
    const baseUrl = this.getBackendBaseUrl();
    if (!baseUrl) {
      return {
        ok: false,
        httpStatus: 0,
        body: "",
        error: "Java backend is not available",
      };
    }
    return processOcrImageFile(baseUrl, imagePath, {
      lang: resolved.lang,
      mode: resolved.mode,
    });
  }
}

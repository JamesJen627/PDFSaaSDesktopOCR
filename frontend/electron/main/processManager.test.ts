import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { buildAppPaths } from "./appPaths.js";
import { ProcessManager } from "./processManager.js";
import { OcrService } from "./ocrService.js";

describe("ProcessManager", () => {
  it("returns null backend URL before java-backend starts", () => {
    const manager = new ProcessManager({
      appPaths: buildAppPaths("/tmp/pdfsaas-manager-test"),
      config: {
        backendStartTimeoutMs: 1000,
        healthPollMs: 50,
        ocrServicePort: 5002,
        externalBackendUrl: null,
        externalOcrUrl: null,
        resourcesDir: "/nonexistent",
      },
    });

    assert.equal(manager.getBackendBaseUrl(), null);
    assert.equal(manager.getStates().length, 2);
  });

  it("marks java-backend unhealthy when bundled resources are missing", async () => {
    const manager = new ProcessManager({
      appPaths: buildAppPaths("/tmp/pdfsaas-manager-unhealthy"),
      config: {
        backendStartTimeoutMs: 1000,
        healthPollMs: 50,
        ocrServicePort: 5002,
        externalBackendUrl: null,
        externalOcrUrl: null,
        resourcesDir: "/nonexistent/resources",
      },
    });

    const state = await manager.start("java-backend");
    assert.equal(state.status, "unhealthy");
    assert.ok(state.lastError?.includes("Bundled JRE not found"));
  });
});

describe("OcrService", () => {
  it("stays idle in dev mode", async () => {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    delete process.env.ELECTRON_START_OCR;
    delete process.env.ELECTRON_USE_EXTERNAL_OCR;

    try {
      const service = new OcrService({
        appPaths: buildAppPaths("/tmp/pdfsaas-ocr-stub"),
        config: {
          backendStartTimeoutMs: 1000,
          healthPollMs: 50,
          ocrServicePort: 5002,
          externalBackendUrl: null,
          externalOcrUrl: null,
          resourcesDir: "/nonexistent",
        },
      });

      const state = await service.start();
      assert.equal(state.status, "idle");
      assert.equal(state.port, 5002);
      assert.equal(service.getBaseUrl(), null);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});

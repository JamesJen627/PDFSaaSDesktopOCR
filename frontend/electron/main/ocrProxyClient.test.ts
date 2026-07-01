import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  fetchBackendOcrProxyHealth,
  processOcrImageFile,
} from "./ocrProxyClient.js";

describe("ocrProxyClient", () => {
  it("fetchBackendOcrProxyHealth returns UP with engine metadata", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({
          status: "UP",
          engine: "stub",
          modelsLoaded: true,
        }),
      }) as Response;

    const health = await fetchBackendOcrProxyHealth(
      "http://127.0.0.1:8080",
      fetchImpl,
    );

    assert.equal(health.status, "UP");
    assert.equal(health.engine, "stub");
    assert.equal(health.modelsLoaded, true);
  });

  it("processOcrImageFile posts multipart to Java proxy", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ocr-proxy-test-"));
    const imagePath = path.join(tempDir, "page.png");
    fs.writeFileSync(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47]));

    let capturedUrl = "";
    let capturedMethod = "";
    let capturedBody: FormData | undefined;

    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      capturedMethod = init?.method ?? "GET";
      capturedBody = init?.body as FormData;
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ text: "stub:10x10:balanced:ch" }),
      } as Response;
    };

    const result = await processOcrImageFile("http://127.0.0.1:8080", imagePath, {
      fetchImpl,
    });

    assert.equal(result.ok, true);
    assert.equal(result.httpStatus, 200);
    assert.equal(result.parsed?.text, "stub:10x10:balanced:ch");
    assert.equal(capturedUrl, "http://127.0.0.1:8080/api/v1/ocr/process");
    assert.equal(capturedMethod, "POST");
    assert.ok(capturedBody instanceof FormData);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});

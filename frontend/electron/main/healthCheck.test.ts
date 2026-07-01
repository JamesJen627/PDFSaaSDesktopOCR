import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { checkBackendHealth, checkOcrServiceHealth, pollUntilHealthy } from "./healthCheck.js";

describe("healthCheck", () => {
  it("returns true when status is UP", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({ status: "UP", version: "1.0.0" }),
      }) as Response;

    assert.equal(await checkBackendHealth("http://127.0.0.1:8080", fetchImpl), true);
  });

  it("returns false when status is not UP", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({ status: "DOWN" }),
      }) as Response;

    assert.equal(await checkBackendHealth("http://127.0.0.1:8080", fetchImpl), false);
  });

  it("checkOcrServiceHealth returns true when status is UP", async () => {
    const fetchImpl = async () =>
      ({
        ok: true,
        json: async () => ({ status: "UP", engine: "stub" }),
      }) as Response;

    assert.equal(await checkOcrServiceHealth("http://127.0.0.1:5002", fetchImpl), true);
  });

  it("pollUntilHealthy stops on first success", async () => {
    let calls = 0;
    const fetchImpl = async () => {
      calls += 1;
      return {
        ok: true,
        json: async () => ({ status: calls >= 2 ? "UP" : "DOWN" }),
      } as Response;
    };

    const ok = await pollUntilHealthy({
      baseUrl: "http://127.0.0.1:8080",
      pollMs: 1,
      timeoutMs: 500,
      fetchImpl,
    });

    assert.equal(ok, true);
    assert.ok(calls >= 2);
  });
});

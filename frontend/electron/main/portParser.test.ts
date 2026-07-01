import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { extractPortFromRunningLog } from "./portParser.js";

describe("extractPortFromRunningLog", () => {
  it("parses Stirling-PDF running log line", () => {
    assert.equal(
      extractPortFromRunningLog("Stirling-PDF running on port: 8080"),
      8080,
    );
  });

  it("parses port followed by extra text", () => {
    assert.equal(
      extractPortFromRunningLog("INFO Stirling-PDF running on port: 49152 started"),
      49152,
    );
  });

  it("returns null when prefix is missing", () => {
    assert.equal(extractPortFromRunningLog("Server started on 8080"), null);
  });

  it("returns null for invalid port", () => {
    assert.equal(
      extractPortFromRunningLog("Stirling-PDF running on port: abc"),
      null,
    );
  });
});

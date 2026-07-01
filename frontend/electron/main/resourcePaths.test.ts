import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { resolveResourcePaths } from "./resourcePaths.js";

describe("resolveResourcePaths", () => {
  it("finds bundled JRE and latest stirling-pdf jar", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "pdfsaas-resources-"));

    try {
      const jreBin = path.join(root, "runtime", "jre", "bin", "java.exe");
      fs.mkdirSync(path.dirname(jreBin), { recursive: true });
      fs.writeFileSync(jreBin, "");

      const libsDir = path.join(root, "libs");
      fs.mkdirSync(libsDir);
      fs.writeFileSync(path.join(libsDir, "stirling-pdf-0.9.0.jar"), "");
      fs.writeFileSync(path.join(libsDir, "stirling-pdf-1.0.0.jar"), "");

      const ocrDir = path.join(root, "ocr-service");
      fs.mkdirSync(ocrDir);

      const resolved = resolveResourcePaths(root);
      assert.equal(resolved.jreBin, jreBin);
      assert.ok(resolved.jarPath.endsWith("stirling-pdf-1.0.0.jar"));
      assert.equal(resolved.ocrServiceDir, ocrDir);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  buildAppPaths,
  ensureAppDataDirectories,
} from "./appPaths.js";

describe("appPaths", () => {
  it("creates PRD app_data subdirectories", () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pdfsaas-appdata-"));
    process.env.ELECTRON_APP_DATA_DIR = tmpRoot;

    try {
      const paths = ensureAppDataDirectories();
      assert.equal(paths.root, path.resolve(tmpRoot));
      assert.ok(fs.statSync(paths.tasks).isDirectory());
      assert.ok(fs.statSync(paths.cache).isDirectory());
      assert.ok(fs.statSync(paths.exports).isDirectory());
      assert.ok(fs.statSync(paths.logs).isDirectory());
    } finally {
      delete process.env.ELECTRON_APP_DATA_DIR;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it("buildAppPaths maps subfolder names", () => {
    const paths = buildAppPaths("/tmp/pdfsaas-test");
    assert.equal(paths.tasks, path.join("/tmp/pdfsaas-test", "tasks"));
    assert.equal(paths.exports, path.join("/tmp/pdfsaas-test", "exports"));
  });
});

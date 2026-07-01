import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  isPageCacheComplete,
  loadPageCacheFiles,
  pageCacheFilePath,
  savePageToCache,
} from "./pageImageCache.js";

describe("pageImageCache", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfsaas-cache-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("saves and loads page PNGs in order", () => {
    savePageToCache(tempDir, "batch-1", 1, Buffer.from([1, 2]));
    savePageToCache(tempDir, "batch-1", 2, Buffer.from([3, 4]));

    assert.ok(isPageCacheComplete(tempDir, "batch-1", 2));
    const pages = loadPageCacheFiles(tempDir, "batch-1", 2);
    assert.deepEqual(pages, [Buffer.from([1, 2]), Buffer.from([3, 4])]);
  });

  it("reports incomplete cache when pages are missing", () => {
    savePageToCache(tempDir, "batch-2", 1, Buffer.from([1]));
    assert.equal(isPageCacheComplete(tempDir, "batch-2", 2), false);
    assert.equal(loadPageCacheFiles(tempDir, "batch-2", 2), null);
  });

  it("uses zero-padded filenames", () => {
    const filePath = pageCacheFilePath(tempDir, "batch-3", 12);
    assert.ok(filePath.endsWith(`${path.sep}page-0012.png`));
  });
});

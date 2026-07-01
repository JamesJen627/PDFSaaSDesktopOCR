import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  defaultOcrDpiForLang,
  defaultOcrModeForLang,
  normalizeOcrLang,
  resolveOcrRunOptions,
} from "./ocrLang.js";

describe("ocrLang", () => {
  it("normalizes supported OCR language codes", () => {
    assert.equal(normalizeOcrLang("en"), "en");
    assert.equal(normalizeOcrLang("ch"), "ch");
    assert.equal(normalizeOcrLang("ch+en"), "ch+en");
    assert.equal(normalizeOcrLang("invalid"), "en");
    assert.equal(normalizeOcrLang(undefined), "en");
  });

  it("applies Chinese scan defaults", () => {
    assert.equal(defaultOcrModeForLang("ch"), "high-quality");
    assert.equal(defaultOcrDpiForLang("ch"), 250);
    assert.equal(defaultOcrModeForLang("en"), "balanced");
    assert.equal(defaultOcrDpiForLang("en"), 150);
  });

  it("resolves run options from partial input", () => {
    assert.deepEqual(resolveOcrRunOptions({ lang: "ch" }), {
      lang: "ch",
      mode: "high-quality",
      dpi: 250,
      contentRegion: { contentTop: 0.06, contentBottom: 0.87 },
    });
    assert.deepEqual(resolveOcrRunOptions({ lang: "en" }), {
      lang: "en",
      mode: "balanced",
      dpi: 150,
      contentRegion: { contentTop: 0.06, contentBottom: 0.87 },
    });
    assert.deepEqual(
      resolveOcrRunOptions({ lang: "en", contentTop: 0.1, contentBottom: 0.85 }).contentRegion,
      { contentTop: 0.1, contentBottom: 0.85 },
    );
  });
});

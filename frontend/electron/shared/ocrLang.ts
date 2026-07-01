import {
  normalizeOcrContentRegion,
  type OcrContentRegion,
} from "./ocrContentRegion.js";

/** OCR language codes accepted by Java backend and Python OCR service. */
export type OcrLang = "en" | "ch" | "ch+en";

export type OcrMode = "fast" | "balanced" | "high-quality";

export const OCR_LANGS: readonly OcrLang[] = ["en", "ch", "ch+en"] as const;

export const OCR_LANG_STORAGE_KEY = "pdfsaas.ocrLang";

export interface OcrRunOptions {
  lang?: OcrLang;
  mode?: OcrMode;
  dpi?: number;
  contentTop?: number;
  contentBottom?: number;
}

export interface ResolvedOcrRunOptions {
  lang: OcrLang;
  mode: OcrMode;
  dpi: number;
  contentRegion: OcrContentRegion;
}

export function defaultOcrModeForLang(lang: OcrLang): OcrMode {
  return lang === "en" ? "balanced" : "high-quality";
}

export function defaultOcrDpiForLang(lang: OcrLang): number {
  return lang === "en" ? 150 : 250;
}

export function normalizeOcrMode(value: unknown): OcrMode {
  if (value === "fast" || value === "balanced" || value === "high-quality") {
    return value;
  }
  return "balanced";
}

export function resolveOcrRunOptions(value: unknown): ResolvedOcrRunOptions {
  const raw = value && typeof value === "object" ? (value as OcrRunOptions) : {};
  const lang = normalizeOcrLang(raw.lang);
  const contentRegion = normalizeOcrContentRegion({
    contentTop: raw.contentTop,
    contentBottom: raw.contentBottom,
  });
  return {
    lang,
    mode: raw.mode ? normalizeOcrMode(raw.mode) : defaultOcrModeForLang(lang),
    dpi: typeof raw.dpi === "number" && raw.dpi > 0 ? raw.dpi : defaultOcrDpiForLang(lang),
    contentRegion,
  };
}

export function normalizeOcrLang(value: unknown): OcrLang {
  if (value === "en" || value === "ch" || value === "ch+en") {
    return value;
  }
  return "en";
}

export function readStoredOcrLang(): OcrLang {
  if (typeof localStorage === "undefined") {
    return "en";
  }
  return normalizeOcrLang(localStorage.getItem(OCR_LANG_STORAGE_KEY));
}

export function writeStoredOcrLang(lang: OcrLang): void {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(OCR_LANG_STORAGE_KEY, lang);
}

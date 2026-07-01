import fs from "node:fs";
import path from "node:path";

import type { FetchLike } from "./healthCheck.js";
import type { OcrProcessResult, OcrProxyHealth } from "../shared/types.js";

interface BackendOcrHealthJson {
  status?: string;
  engine?: string;
  modelsLoaded?: boolean;
  models_loaded?: boolean;
  loadError?: string | null;
  load_error?: string | null;
}

interface OcrProcessJson {
  text?: string;
  page_index?: number;
  page_confidence?: number;
  language?: string;
  detail?: string;
}

/** GET /api/v1/ocr/health via Java backend (Phase 3B). */
export async function fetchBackendOcrProxyHealth(
  backendBaseUrl: string,
  fetchImpl: FetchLike = fetch,
): Promise<OcrProxyHealth> {
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/ocr/health`;

  try {
    const response = await fetchImpl(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
      return {
        status: "DOWN",
        message: `HTTP ${response.status}`,
      };
    }

    const body = (await response.json()) as BackendOcrHealthJson;
    return {
      status: body.status === "UP" ? "UP" : "DOWN",
      engine: body.engine ?? null,
      modelsLoaded: body.modelsLoaded ?? body.models_loaded,
      message: body.loadError ?? body.load_error ?? null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: "unknown",
      message,
    };
  }
}

export interface ProcessOcrImageOptions {
  pageIndex?: number;
  mode?: string;
  lang?: string;
  fetchImpl?: FetchLike;
}

/** POST /api/v1/ocr/process via Java backend multipart proxy. */
export async function processOcrImageFile(
  backendBaseUrl: string,
  imagePath: string,
  options: ProcessOcrImageOptions = {},
): Promise<OcrProcessResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const absolutePath = path.resolve(imagePath);

  if (!fs.existsSync(absolutePath)) {
    return {
      ok: false,
      httpStatus: 0,
      body: "",
      error: `File not found: ${absolutePath}`,
    };
  }

  const fileName = path.basename(absolutePath);
  const fileBytes = fs.readFileSync(absolutePath);
  const mimeType = guessImageMime(fileName);
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/ocr/process`;

  const form = new FormData();
  form.append("file", new Blob([fileBytes], { type: mimeType }), fileName);
  form.append("page_index", String(options.pageIndex ?? 1));
  form.append("mode", options.mode ?? "balanced");
  form.append("lang", options.lang ?? "en");

  try {
    const response = await fetchImpl(url, {
      method: "POST",
      headers: { Accept: "application/json" },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });

    const bodyText = await response.text();
    let parsed: OcrProcessResult["parsed"];
    let detail: string | undefined;

    try {
      const json = JSON.parse(bodyText) as OcrProcessJson;
      if (typeof json.detail === "string") {
        detail = json.detail;
      } else {
        parsed = {
          text: json.text,
          page_index: json.page_index,
          page_confidence: json.page_confidence,
          language: json.language,
        };
      }
    } catch {
      // Non-JSON body — return raw text.
    }

    const ok = response.ok;
    return {
      ok,
      httpStatus: response.status,
      body: bodyText,
      parsed,
      detail,
      error: ok ? null : detail ?? bodyText.slice(0, 500),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      httpStatus: 0,
      body: "",
      error: message,
    };
  }
}

export function guessImageMime(fileName: string): string {
  switch (path.extname(fileName).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".tif":
    case ".tiff":
      return "image/tiff";
    default:
      return "application/octet-stream";
  }
}

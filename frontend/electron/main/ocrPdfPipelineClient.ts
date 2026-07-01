import fs from "node:fs";
import path from "node:path";

import type { FetchLike } from "./healthCheck.js";
import { loadPageCacheFiles } from "./pageImageCache.js";
import type { OcrBatchSubmitResponse, PdfPagePreviewResult } from "../shared/types.js";
import { isFullPageRegion, normalizeOcrContentRegion } from "../shared/ocrContentRegion.js";

export async function submitOcrBatchFromPdf(
  backendBaseUrl: string,
  pdfPath: string,
  options: {
    dpi?: number;
    mode?: string;
    lang?: string;
    contentTop?: number;
    contentBottom?: number;
    fetchImpl?: FetchLike;
  } = {},
): Promise<OcrBatchSubmitResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/ocr/batch-from-pdf`;
  const absolutePath = path.resolve(pdfPath);
  const fileName = path.basename(absolutePath);
  const bytes = fs.readFileSync(absolutePath);

  const region = normalizeOcrContentRegion({
    contentTop: options.contentTop,
    contentBottom: options.contentBottom,
  });

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  form.append("dpi", String(options.dpi ?? 150));
  form.append("mode", options.mode ?? "balanced");
  form.append("lang", options.lang ?? "en");
  if (!isFullPageRegion(region)) {
    form.append("contentTop", String(region.contentTop));
    form.append("contentBottom", String(region.contentBottom));
  }

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(300_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OCR batch-from-pdf failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return (await response.json()) as OcrBatchSubmitResponse;
}

export async function fetchPdfPagePreview(
  backendBaseUrl: string,
  pdfPath: string,
  options: { pageIndex?: number; dpi?: number; fetchImpl?: FetchLike } = {},
): Promise<PdfPagePreviewResult> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/pdf/preview-page`;
  const absolutePath = path.resolve(pdfPath);
  const fileName = path.basename(absolutePath);
  const bytes = fs.readFileSync(absolutePath);
  const pageIndex = options.pageIndex ?? 1;
  const dpi = options.dpi ?? 150;

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  form.append("pageIndex", String(pageIndex));
  form.append("dpi", String(dpi));

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`PDF preview failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const payload = (await response.json()) as {
    imageBase64: string;
    width: number;
    height: number;
    pageIndex: number;
    dpi: number;
    contentTop: number;
    contentBottom: number;
  };

  return {
    imageBase64: payload.imageBase64,
    width: payload.width,
    height: payload.height,
    pageIndex: payload.pageIndex,
    dpi: payload.dpi,
    contentTop: payload.contentTop,
    contentBottom: payload.contentBottom,
  };
}

export async function fetchDoubleLayerPdf(
  backendBaseUrl: string,
  pdfPath: string,
  batchId: string,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
    batchResultJson?: string;
    pageCacheDir?: string;
    pageCount?: number;
  } = {},
): Promise<Uint8Array> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/pdf/double-layer`;
  const absolutePath = path.resolve(pdfPath);
  const fileName = path.basename(absolutePath);
  const bytes = fs.readFileSync(absolutePath);

  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "application/pdf" }), fileName);
  form.append("batchId", batchId);
  if (options.batchResultJson) {
    form.append("batchResultJson", options.batchResultJson);
  }

  if (options.pageCacheDir && options.pageCount && options.pageCount > 0) {
    const cachedPages = loadPageCacheFiles(
      options.pageCacheDir,
      batchId,
      options.pageCount,
    );
    if (cachedPages) {
      for (let index = 0; index < cachedPages.length; index++) {
        const pageBytes = cachedPages[index]!;
        form.append(
          "pageImages",
          new Blob([new Uint8Array(pageBytes)], { type: "image/png" }),
          `page-${String(index + 1).padStart(4, "0")}.png`,
        );
      }
    }
  }

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "application/pdf" },
    body: form,
    signal: AbortSignal.timeout(options.timeoutMs ?? 1_800_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Double-layer PDF failed (${response.status}): ${body.slice(0, 500)}`);
  }

  const buffer = await response.arrayBuffer();
  return new Uint8Array(buffer);
}

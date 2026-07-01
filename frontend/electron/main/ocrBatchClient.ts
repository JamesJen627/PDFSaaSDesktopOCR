import fs from "node:fs";
import path from "node:path";

import type { FetchLike } from "./healthCheck.js";
import type { OcrBatchResultResponse, OcrBatchSubmitResponse } from "../shared/types.js";
import { guessImageMime } from "./ocrProxyClient.js";

export async function submitOcrBatch(
  backendBaseUrl: string,
  imagePaths: string[],
  options: { mode?: string; lang?: string; fetchImpl?: FetchLike } = {},
): Promise<OcrBatchSubmitResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/ocr/batch`;
  const form = new FormData();

  for (const imagePath of imagePaths) {
    const absolutePath = path.resolve(imagePath);
    const fileName = path.basename(absolutePath);
    const bytes = fs.readFileSync(absolutePath);
    form.append("files", new Blob([bytes], { type: guessImageMime(fileName) }), fileName);
  }

  form.append("mode", options.mode ?? "balanced");
  form.append("lang", options.lang ?? "en");

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    body: form,
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OCR batch submit failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return (await response.json()) as OcrBatchSubmitResponse;
}

export async function fetchOcrBatchResult(
  backendBaseUrl: string,
  batchId: string,
  fetchImpl: FetchLike = fetch,
): Promise<OcrBatchResultResponse> {
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/ocr/result/${encodeURIComponent(batchId)}`;
  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OCR batch result failed (${response.status}): ${body.slice(0, 500)}`);
  }

  return (await response.json()) as OcrBatchResultResponse;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

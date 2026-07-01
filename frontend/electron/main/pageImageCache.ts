import fs from "node:fs";
import path from "node:path";

import type { FetchLike } from "./healthCheck.js";

export function pageCacheDir(cacheRoot: string, batchId: string): string {
  return path.join(cacheRoot, batchId);
}

export function pageCacheFilePath(
  cacheRoot: string,
  batchId: string,
  pageIndex: number,
): string {
  const padded = String(pageIndex).padStart(4, "0");
  return path.join(pageCacheDir(cacheRoot, batchId), `page-${padded}.png`);
}

export function isPageCacheComplete(
  cacheRoot: string,
  batchId: string,
  pageCount: number,
): boolean {
  if (pageCount <= 0) {
    return false;
  }
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    if (!fs.existsSync(pageCacheFilePath(cacheRoot, batchId, pageIndex))) {
      return false;
    }
  }
  return true;
}

export function savePageToCache(
  cacheRoot: string,
  batchId: string,
  pageIndex: number,
  pngBytes: Buffer,
): void {
  fs.mkdirSync(pageCacheDir(cacheRoot, batchId), { recursive: true });
  fs.writeFileSync(pageCacheFilePath(cacheRoot, batchId, pageIndex), pngBytes);
}

export function loadPageCacheFiles(
  cacheRoot: string,
  batchId: string,
  pageCount: number,
): Buffer[] | null {
  if (!isPageCacheComplete(cacheRoot, batchId, pageCount)) {
    return null;
  }

  const pages: Buffer[] = [];
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    pages.push(fs.readFileSync(pageCacheFilePath(cacheRoot, batchId, pageIndex)));
  }
  return pages;
}

export async function downloadRenderedPageFromBackend(
  backendBaseUrl: string,
  batchId: string,
  pageIndex: number,
  options: { fetchImpl?: FetchLike } = {},
): Promise<Buffer | null> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = `${backendBaseUrl.replace(/\/$/, "")}/api/v1/ocr/rendered-page/${batchId}/${pageIndex}`;

  const response = await fetchImpl(url, {
    method: "GET",
    headers: { Accept: "image/png" },
    signal: AbortSignal.timeout(120_000),
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Rendered page download failed (${response.status}) page ${pageIndex}: ${body.slice(0, 200)}`,
    );
  }

  return Buffer.from(await response.arrayBuffer());
}

/** Best-effort: persist OCR page PNGs while the backend batch is still in memory. */
export async function ensurePageImageCache(
  cacheRoot: string,
  backendBaseUrl: string,
  batchId: string,
  pageCount: number,
  options: { fetchImpl?: FetchLike } = {},
): Promise<boolean> {
  if (isPageCacheComplete(cacheRoot, batchId, pageCount)) {
    return true;
  }

  let savedAny = false;
  for (let pageIndex = 1; pageIndex <= pageCount; pageIndex++) {
    const existing = pageCacheFilePath(cacheRoot, batchId, pageIndex);
    if (fs.existsSync(existing)) {
      savedAny = true;
      continue;
    }

    const png = await downloadRenderedPageFromBackend(
      backendBaseUrl,
      batchId,
      pageIndex,
      options,
    );
    if (!png) {
      return savedAny && isPageCacheComplete(cacheRoot, batchId, pageCount);
    }

    savePageToCache(cacheRoot, batchId, pageIndex, png);
    savedAny = true;
  }

  return isPageCacheComplete(cacheRoot, batchId, pageCount);
}

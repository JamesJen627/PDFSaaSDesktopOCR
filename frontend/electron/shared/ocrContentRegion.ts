/** Vertical OCR bounds as ratios of page height (0 = top, 1 = bottom). */
export interface OcrContentRegion {
  contentTop: number;
  contentBottom: number;
}

export const OCR_CONTENT_REGION_MIN_BAND = 0.05;

export const DEFAULT_OCR_CONTENT_REGION: OcrContentRegion = {
  contentTop: 0.06,
  contentBottom: 0.87,
};

export function normalizeOcrContentRegion(
  value: Partial<OcrContentRegion> | null | undefined,
): OcrContentRegion {
  const top =
    typeof value?.contentTop === "number" && Number.isFinite(value.contentTop)
      ? value.contentTop
      : DEFAULT_OCR_CONTENT_REGION.contentTop;
  const bottom =
    typeof value?.contentBottom === "number" && Number.isFinite(value.contentBottom)
      ? value.contentBottom
      : DEFAULT_OCR_CONTENT_REGION.contentBottom;
  return clampOcrContentRegion({ contentTop: top, contentBottom: bottom });
}

export function clampOcrContentRegion(region: OcrContentRegion): OcrContentRegion {
  const top = Math.max(0, Math.min(region.contentTop, 0.45));
  const bottom = Math.max(top + OCR_CONTENT_REGION_MIN_BAND, Math.min(region.contentBottom, 1));
  return { contentTop: top, contentBottom: bottom };
}

export function isFullPageRegion(region: OcrContentRegion): boolean {
  return region.contentTop <= 0.001 && region.contentBottom >= 0.999;
}

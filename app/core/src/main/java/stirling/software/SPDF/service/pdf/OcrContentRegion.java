package stirling.software.SPDF.service.pdf;

/** Vertical OCR bounds as ratios of page height (0 = top, 1 = bottom). */
public record OcrContentRegion(float topRatio, float bottomRatio) {

    private static final float MIN_BAND = 0.05f;

    public static OcrContentRegion fullPage() {
        return new OcrContentRegion(0f, 1f);
    }

    public static OcrContentRegion defaultsForBooks() {
        return new OcrContentRegion(0.06f, 0.87f);
    }

    public static OcrContentRegion parse(Float topRatio, Float bottomRatio) {
        if (topRatio == null && bottomRatio == null) {
            return fullPage();
        }
        return new OcrContentRegion(
                        topRatio != null ? topRatio : 0f, bottomRatio != null ? bottomRatio : 1f)
                .normalized();
    }

    public OcrContentRegion normalized() {
        float top = clamp(topRatio, 0f, 0.45f);
        float bottom = clamp(bottomRatio, top + MIN_BAND, 1f);
        return new OcrContentRegion(top, bottom);
    }

    public boolean isFullPage() {
        return topRatio <= 0.001f && bottomRatio >= 0.999f;
    }

    private static float clamp(float value, float min, float max) {
        return Math.max(min, Math.min(max, value));
    }
}

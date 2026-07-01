package stirling.software.SPDF.service.pdf;

import java.awt.image.BufferedImage;

/**
 * Heuristic OCR bounds from page raster ink density. Detects isolated footer/header bands separated
 * from the main body by white gaps (typical book scans).
 */
public final class OcrRegionEstimator {

    private static final float INK_THRESHOLD = 0.012f;
    private static final float MIN_GAP_RATIO = 0.012f;
    private static final float MAX_BAND_RATIO = 0.06f;
    private static final float MIN_FOOTER_START_RATIO = 0.68f;
    private static final float MAX_HEADER_END_RATIO = 0.32f;
    private static final float EDGE_MARGIN_RATIO = 0.006f;

    private OcrRegionEstimator() {}

    public static OcrContentRegion estimate(BufferedImage image) {
        OcrContentRegion defaults = OcrContentRegion.defaultsForBooks();
        if (image == null || image.getWidth() <= 0 || image.getHeight() <= 0) {
            return defaults;
        }

        int width = image.getWidth();
        int height = image.getHeight();
        float[] rowInk = computeRowInk(image, width, height);

        float top = estimateTop(rowInk, height, defaults.topRatio());
        float bottom = estimateBottom(rowInk, height, defaults.bottomRatio());
        return new OcrContentRegion(top, bottom).normalized();
    }

    private static float[] computeRowInk(BufferedImage image, int width, int height) {
        int left = Math.round(width * 0.08f);
        int right = Math.round(width * 0.92f);
        float[] rowInk = new float[height];

        for (int y = 0; y < height; y++) {
            int dark = 0;
            int samples = 0;
            for (int x = left; x < right; x += 2) {
                int rgb = image.getRGB(x, y);
                int r = (rgb >> 16) & 0xFF;
                int g = (rgb >> 8) & 0xFF;
                int b = rgb & 0xFF;
                int luminance = (r * 299 + g * 587 + b * 114) / 1000;
                if (luminance < 210) {
                    dark++;
                }
                samples++;
            }
            rowInk[y] = samples == 0 ? 0f : (float) dark / samples;
        }
        return rowInk;
    }

    private static float estimateBottom(float[] rowInk, int height, float fallback) {
        int minGap = Math.max(4, Math.round(height * MIN_GAP_RATIO));
        int maxBandHeight = Math.max(3, Math.round(height * MAX_BAND_RATIO));
        int minFooterStart = Math.round(height * MIN_FOOTER_START_RATIO);
        int marginRows = Math.max(1, Math.round(height * EDGE_MARGIN_RATIO));

        int y = height - 1;
        while (y >= 0 && rowInk[y] < INK_THRESHOLD) {
            y--;
        }
        if (y < minFooterStart) {
            return fallback;
        }

        int bandEnd = y;
        int bandStart = y;
        while (bandStart > 0
                && rowInk[bandStart - 1] >= INK_THRESHOLD
                && bandEnd - bandStart + 1 < maxBandHeight) {
            bandStart--;
        }

        int gap = 0;
        int scan = bandStart - 1;
        while (scan >= 0 && gap < minGap) {
            if (rowInk[scan] < INK_THRESHOLD) {
                gap++;
            } else {
                break;
            }
            scan--;
        }

        if (gap >= minGap && bandEnd - bandStart + 1 <= maxBandHeight) {
            int cutRow = Math.max(0, bandStart - marginRows);
            float detected = cutRow / (float) height;
            return Math.min(detected, fallback);
        }

        return fallback;
    }

    private static float estimateTop(float[] rowInk, int height, float fallback) {
        int minGap = Math.max(4, Math.round(height * MIN_GAP_RATIO));
        int maxBandHeight = Math.max(3, Math.round(height * MAX_BAND_RATIO));
        int maxHeaderEnd = Math.round(height * MAX_HEADER_END_RATIO);
        int marginRows = Math.max(1, Math.round(height * EDGE_MARGIN_RATIO));

        int y = 0;
        while (y < height && rowInk[y] < INK_THRESHOLD) {
            y++;
        }
        if (y > maxHeaderEnd) {
            return fallback;
        }

        int bandStart = y;
        int bandEnd = y;
        while (bandEnd + 1 < height
                && rowInk[bandEnd + 1] >= INK_THRESHOLD
                && bandEnd - bandStart + 1 < maxBandHeight) {
            bandEnd++;
        }

        int gap = 0;
        int scan = bandEnd + 1;
        while (scan < height && gap < minGap) {
            if (rowInk[scan] < INK_THRESHOLD) {
                gap++;
            } else {
                break;
            }
            scan++;
        }

        if (gap >= minGap && bandEnd - bandStart + 1 <= maxBandHeight) {
            int cutRow = Math.min(height - 1, bandEnd + marginRows + 1);
            float detected = cutRow / (float) height;
            return Math.max(detected, fallback);
        }

        return fallback;
    }
}

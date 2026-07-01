package stirling.software.SPDF.service.pdf;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

import javax.imageio.ImageIO;

public final class OcrImageCrop {

    private OcrImageCrop() {}

    public static byte[] cropPng(byte[] pngBytes, OcrContentRegion region) throws IOException {
        OcrContentRegion bounds =
                region != null ? region.normalized() : OcrContentRegion.fullPage();
        if (bounds.isFullPage()) {
            return pngBytes;
        }

        BufferedImage full = ImageIO.read(new ByteArrayInputStream(pngBytes));
        if (full == null) {
            throw new IOException("Failed to decode PNG for OCR crop");
        }

        int height = full.getHeight();
        int y0 = Math.round(height * bounds.topRatio());
        int y1 = Math.round(height * bounds.bottomRatio());
        y0 = Math.max(0, Math.min(y0, height - 1));
        y1 = Math.max(y0 + 1, Math.min(y1, height));

        BufferedImage cropped = full.getSubimage(0, y0, full.getWidth(), y1 - y0);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        ImageIO.write(cropped, "png", out);
        return out.toByteArray();
    }
}

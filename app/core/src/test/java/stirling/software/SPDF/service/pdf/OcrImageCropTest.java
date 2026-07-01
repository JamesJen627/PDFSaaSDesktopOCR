package stirling.software.SPDF.service.pdf;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;

import javax.imageio.ImageIO;

import org.junit.jupiter.api.Test;

class OcrImageCropTest {

    @Test
    void cropPngReducesHeightForContentRegion() throws Exception {
        BufferedImage image = new BufferedImage(100, 200, BufferedImage.TYPE_INT_RGB);
        for (int y = 0; y < 200; y++) {
            for (int x = 0; x < 100; x++) {
                image.setRGB(x, y, Color.WHITE.getRGB());
            }
        }
        ByteArrayOutputStream png = new ByteArrayOutputStream();
        ImageIO.write(image, "png", png);

        byte[] cropped = OcrImageCrop.cropPng(png.toByteArray(), new OcrContentRegion(0.1f, 0.9f));
        BufferedImage result = ImageIO.read(new java.io.ByteArrayInputStream(cropped));

        assertTrue(result.getHeight() < 200);
        assertTrue(result.getHeight() >= 140 && result.getHeight() <= 170);
    }
}

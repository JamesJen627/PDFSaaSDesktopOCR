package stirling.software.SPDF.service.pdf;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.awt.Color;
import java.awt.Graphics2D;
import java.awt.image.BufferedImage;

import org.junit.jupiter.api.Test;

class OcrRegionEstimatorTest {

    @Test
    void estimateExcludesIsolatedFooterBand() {
        int width = 800;
        int height = 1200;
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setColor(Color.WHITE);
        g.fillRect(0, 0, width, height);

        g.setColor(Color.BLACK);
        g.fillRect(80, 200, 640, 700);

        g.fillRect(80, 1050, 640, 28);

        g.dispose();

        OcrContentRegion region = OcrRegionEstimator.estimate(image);

        assertTrue(region.bottomRatio() < 0.88f, "Footer band should raise cut above 0.88");
        assertTrue(region.bottomRatio() > 0.75f, "Cut should stay below main body");
    }
}

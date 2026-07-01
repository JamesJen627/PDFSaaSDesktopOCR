package stirling.software.SPDF.service.pdf;

import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.stereotype.Service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.common.service.CustomPDFDocumentFactory;

@Slf4j
@Service
@RequiredArgsConstructor
public class PdfPageRenderService {

    public static final int DEFAULT_OCR_DPI = 150;

    private final CustomPDFDocumentFactory pdfDocumentFactory;

    public record RenderedPage(int pageIndex, byte[] pngBytes, int width, int height) {}

    public List<RenderedPage> renderPages(byte[] pdfBytes, int dpi) throws IOException {
        if (dpi <= 0) {
            dpi = DEFAULT_OCR_DPI;
        }

        try (PDDocument document = pdfDocumentFactory.load(pdfBytes)) {
            PDFRenderer renderer = new PDFRenderer(document);
            int pageCount = document.getNumberOfPages();
            List<RenderedPage> pages = new ArrayList<>(pageCount);

            for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                BufferedImage image = renderer.renderImageWithDPI(pageIndex, dpi);
                ByteArrayOutputStream png = new ByteArrayOutputStream();
                ImageIO.write(image, "png", png);
                pages.add(
                        new RenderedPage(
                                pageIndex + 1,
                                png.toByteArray(),
                                image.getWidth(),
                                image.getHeight()));
            }

            log.debug("Rendered {} PDF page(s) at {} DPI", pageCount, dpi);
            return pages;
        }
    }

    public byte[] renderPagePreview(byte[] pdfBytes, int pageIndex, int dpi) throws IOException {
        if (dpi <= 0) {
            dpi = DEFAULT_OCR_DPI;
        }
        if (pageIndex < 1) {
            throw new IllegalArgumentException("pageIndex must be >= 1");
        }

        try (PDDocument document = pdfDocumentFactory.load(pdfBytes)) {
            int pageCount = document.getNumberOfPages();
            if (pageIndex > pageCount) {
                throw new IllegalArgumentException(
                        "pageIndex " + pageIndex + " exceeds page count " + pageCount);
            }
            PDFRenderer renderer = new PDFRenderer(document);
            BufferedImage image = renderer.renderImageWithDPI(pageIndex - 1, dpi);
            ByteArrayOutputStream png = new ByteArrayOutputStream();
            ImageIO.write(image, "png", png);
            return png.toByteArray();
        }
    }
}

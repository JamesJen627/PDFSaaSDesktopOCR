package stirling.software.SPDF.service.pdf;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.when;

import java.io.IOException;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class PdfPageRenderServiceTest {

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;

    private PdfPageRenderService service;

    @BeforeEach
    void setUp() {
        service = new PdfPageRenderService(pdfDocumentFactory);
    }

    @Test
    void renderPagesProducesPngForEachPage() throws IOException {
        byte[] pdfBytes = createTwoPagePdf();
        when(pdfDocumentFactory.load(pdfBytes)).thenReturn(Loader.loadPDF(pdfBytes));

        var pages = service.renderPages(pdfBytes, 72);

        assertEquals(2, pages.size());
        assertEquals(1, pages.get(0).pageIndex());
        assertEquals(2, pages.get(1).pageIndex());
        assertTrue(pages.get(0).width() > 0);
        assertTrue(pages.get(0).height() > 0);
        assertFalse(pages.get(0).pngBytes().length == 0);
    }

    private static byte[] createTwoPagePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.LETTER));
            document.addPage(new PDPage(PDRectangle.A4));
            var out = new java.io.ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}

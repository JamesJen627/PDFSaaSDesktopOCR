package stirling.software.SPDF.service.pdf;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.io.InputStream;
import java.util.List;

import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.DefaultResourceLoader;

import stirling.software.SPDF.service.PdfJsonFallbackFontService;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchPageResult;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchResultResponse;
import stirling.software.common.service.CustomPDFDocumentFactory;

@ExtendWith(MockitoExtension.class)
class PdfDoubleLayerServiceTest {

    private static final String NOTO_SANS = "classpath:/static/fonts/NotoSans-Regular.ttf";

    @Mock private CustomPDFDocumentFactory pdfDocumentFactory;
    @Mock private PdfJsonFallbackFontService fallbackFontService;

    private PdfDoubleLayerService service;

    @BeforeEach
    void setUp() throws IOException {
        service = new PdfDoubleLayerService(pdfDocumentFactory, fallbackFontService);
        when(fallbackFontService.loadFallbackPdfFont(any(PDDocument.class)))
                .thenAnswer(invocation -> loadFont(invocation.getArgument(0)));
        lenient()
                .when(fallbackFontService.loadFallbackPdfFont(any(PDDocument.class), anyString()))
                .thenAnswer(invocation -> loadFont(invocation.getArgument(0)));
    }

    @Test
    void buildDoubleLayerEmbedsExtractableText() throws IOException {
        byte[] sourcePdf = createSinglePagePdf();
        when(pdfDocumentFactory.load(sourcePdf)).thenReturn(Loader.loadPDF(sourcePdf));

        OcrBatchResultResponse batchResult =
                new OcrBatchResultResponse(
                        "batch-1",
                        "completed",
                        100,
                        1,
                        1,
                        0,
                        List.of(
                                new OcrBatchPageResult(
                                        1,
                                        "completed",
                                        "hello world",
                                        1.0,
                                        "en",
                                        null,
                                        """
                                        {"text":"hello world","page_index":1,"boxes":[{"x":50,"y":100,"w":400,"h":40,"text":"hello world","confidence":1.0}]}
                                        """)),
                        null,
                        72,
                        null,
                        null);

        byte[] output = service.buildDoubleLayer(sourcePdf, batchResult);

        try (PDDocument document = Loader.loadPDF(output)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String extracted = stripper.getText(document);
            assertTrue(
                    extracted.contains("hello world")
                            || extracted.replaceAll("\\s+", " ").contains("hello world"),
                    () -> "Expected extractable text but got: " + extracted);
        }
    }

    @Test
    void buildDoubleLayerInsertsSpacesBetweenWordBoxes() throws IOException {
        byte[] sourcePdf = createSinglePagePdf();
        when(pdfDocumentFactory.load(sourcePdf)).thenReturn(Loader.loadPDF(sourcePdf));

        OcrBatchResultResponse batchResult =
                new OcrBatchResultResponse(
                        "batch-words",
                        "completed",
                        100,
                        1,
                        1,
                        0,
                        List.of(
                                new OcrBatchPageResult(
                                        1,
                                        "completed",
                                        "are built the lean",
                                        1.0,
                                        "en",
                                        null,
                                        """
                                        {"text":"are built the lean","page_index":1,"boxes":[
                                          {"x":100,"y":200,"w":30,"h":18,"text":"are","confidence":1.0},
                                          {"x":125,"y":200,"w":40,"h":18,"text":"built","confidence":1.0},
                                          {"x":180,"y":200,"w":35,"h":18,"text":"the","confidence":1.0},
                                          {"x":205,"y":200,"w":35,"h":18,"text":"lean","confidence":1.0}
                                        ]}
                                        """)),
                        null,
                        72,
                        null,
                        null);

        byte[] output = service.buildDoubleLayer(sourcePdf, batchResult);

        try (PDDocument document = Loader.loadPDF(output)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String extracted = stripper.getText(document).replaceAll("\\s+", " ").trim();
            assertTrue(
                    extracted.contains("are built the lean"),
                    () -> "Expected spaced words but got: " + extracted);
        }
    }

    @Test
    void buildDoubleLayerPlacesWideGapTocEntries() throws IOException {
        byte[] sourcePdf = createSinglePagePdf();
        when(pdfDocumentFactory.load(sourcePdf)).thenReturn(Loader.loadPDF(sourcePdf));

        OcrBatchResultResponse batchResult =
                new OcrBatchResultResponse(
                        "batch-toc",
                        "completed",
                        100,
                        1,
                        1,
                        0,
                        List.of(
                                new OcrBatchPageResult(
                                        1,
                                        "completed",
                                        "Chapter One 13",
                                        1.0,
                                        "en",
                                        null,
                                        """
                                        {"text":"Chapter One 13","page_index":1,"boxes":[
                                          {"x":80,"y":300,"w":420,"h":28,"text":"Chapter One","confidence":0.95},
                                          {"x":720,"y":300,"w":40,"h":28,"text":"13","confidence":0.94}
                                        ]}
                                        """)),
                        null,
                        72,
                        null,
                        null);

        byte[] output = service.buildDoubleLayer(sourcePdf, batchResult);

        try (PDDocument document = Loader.loadPDF(output)) {
            PDFTextStripper stripper = new PDFTextStripper();
            String extracted = stripper.getText(document).replaceAll("\\s+", " ");
            assertTrue(extracted.contains("Chapter One"));
            assertTrue(extracted.contains("13"));
        }
    }

    private static PDFont loadFont(PDDocument document) throws IOException {
        DefaultResourceLoader loader = new DefaultResourceLoader();
        try (InputStream stream = loader.getResource(NOTO_SANS).getInputStream()) {
            return PDType0Font.load(document, stream, false);
        }
    }

    private static byte[] createSinglePagePdf() throws IOException {
        try (PDDocument document = new PDDocument()) {
            document.addPage(new PDPage(PDRectangle.LETTER));
            var out = new java.io.ByteArrayOutputStream();
            document.save(out);
            return out.toByteArray();
        }
    }
}

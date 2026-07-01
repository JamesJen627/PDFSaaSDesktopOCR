package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.mock.web.MockMultipartFile;

import stirling.software.SPDF.service.pdf.PdfPageRenderService.RenderedPage;

@ExtendWith(MockitoExtension.class)
class OcrBatchJobServiceTest {

    @Mock private OcrServiceClient ocrServiceClient;

    private OcrBatchJobService service;

    @BeforeEach
    void setUp() {
        service = new OcrBatchJobService(ocrServiceClient);
    }

    @Test
    void submitProcessesAllPages() throws Exception {
        when(ocrServiceClient.process(any(), eq(1), eq("balanced"), eq("ch"), eq(null)))
                .thenReturn(new OcrServiceResponse(200, "{\"text\":\"p1\",\"page_index\":1}"));
        when(ocrServiceClient.process(any(), eq(2), eq("balanced"), eq("ch"), eq(null)))
                .thenReturn(new OcrServiceResponse(200, "{\"text\":\"p2\",\"page_index\":2}"));

        var submit =
                service.submit(
                        java.util.List.of(
                                new MockMultipartFile(
                                        "files", "p1.png", "image/png", new byte[] {1}),
                                new MockMultipartFile(
                                        "files", "p2.png", "image/png", new byte[] {2})),
                        "balanced",
                        "ch");

        assertEquals(2, submit.pageCount());
        assertEquals("pending", submit.status());

        OcrBatchModels.OcrBatchResultResponse result = null;
        for (int attempt = 0; attempt < 50; attempt++) {
            result = service.getResult(submit.batchId()).orElseThrow();
            if ("completed".equals(result.status())) {
                break;
            }
            TimeUnit.MILLISECONDS.sleep(20);
        }

        assertEquals("completed", result.status());
        assertEquals(2, result.completedCount());
        assertEquals("p1", result.pages().get(0).text());
        assertEquals("p2", result.pages().get(1).text());
    }

    @Test
    void getResultReturnsEmptyForUnknownBatch() {
        assertTrue(service.getResult("missing-id").isEmpty());
    }

    @Test
    void submitFromRenderedPagesRetainsCachedPageImages() throws Exception {
        when(ocrServiceClient.process(any(), eq(1), eq("balanced"), eq("en"), eq(null)))
                .thenReturn(new OcrServiceResponse(200, "{\"text\":\"p1\",\"page_index\":1}"));

        List<RenderedPage> rendered =
                List.of(new RenderedPage(1, new byte[] {(byte) 137, 80, 78, 71}, 100, 120));
        var submit = service.submitFromRenderedPages(rendered, "balanced", "en", 150);

        assertTrue(service.getRenderedPages(submit.batchId()).isPresent());
        assertEquals(1, service.getRenderedPages(submit.batchId()).orElseThrow().size());
    }

    @Test
    void getRenderedPagePngReturnsBytesForValidIndex() throws Exception {
        when(ocrServiceClient.process(any(), eq(1), eq("balanced"), eq("en"), eq(null)))
                .thenReturn(new OcrServiceResponse(200, "{\"text\":\"p1\",\"page_index\":1}"));

        byte[] png = new byte[] {(byte) 137, 80, 78, 71};
        List<RenderedPage> rendered = List.of(new RenderedPage(1, png, 100, 120));
        var submit = service.submitFromRenderedPages(rendered, "balanced", "en", 150);

        assertArrayEquals(png, service.getRenderedPagePng(submit.batchId(), 1).orElseThrow());
        assertTrue(service.getRenderedPagePng(submit.batchId(), 2).isEmpty());
    }
}

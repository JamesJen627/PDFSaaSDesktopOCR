package stirling.software.SPDF.controller.api.ocr;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.mockito.junit.jupiter.MockitoSettings;
import org.mockito.quality.Strictness;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.service.ocr.OcrBatchJobService;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchSubmitResponse;
import stirling.software.SPDF.service.ocr.OcrServiceClient;
import stirling.software.SPDF.service.ocr.OcrServiceResponse;

@ExtendWith(MockitoExtension.class)
@MockitoSettings(strictness = Strictness.LENIENT)
class OcrExtensionControllerTest {

    @Mock private OcrServiceClient ocrServiceClient;
    @Mock private OcrBatchJobService ocrBatchJobService;
    @Mock private stirling.software.SPDF.service.ocr.OcrPdfPipelineService ocrPdfPipelineService;
    @Mock private EndpointConfiguration endpointConfiguration;

    @InjectMocks private OcrExtensionController controller;

    @BeforeEach
    void enableEndpoints() {
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_HEALTH))
                .thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_PROCESS))
                .thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_WARMUP))
                .thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_BATCH))
                .thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_RESULT))
                .thenReturn(true);
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_RENDERED_PAGE))
                .thenReturn(true);
    }

    @Test
    void healthProxiesJsonBody() throws IOException {
        when(ocrServiceClient.getHealth()).thenReturn("{\"status\":\"UP\"}");

        var response = controller.health();

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.APPLICATION_JSON, response.getHeaders().getContentType());
        assertEquals("{\"status\":\"UP\"}", response.getBody());
    }

    @Test
    void processForwardsMultipartToClient() throws IOException {
        MockMultipartFile file =
                new MockMultipartFile("file", "page.png", "image/png", new byte[] {1, 2, 3});
        when(ocrServiceClient.process(file, 2, "fast", "en", "en-US"))
                .thenReturn(new OcrServiceResponse(200, "{\"text\":\"hi\"}"));

        var response = controller.process(file, 2, "fast", "en", "en-US");

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals("{\"text\":\"hi\"}", response.getBody());
        verify(ocrServiceClient).process(file, 2, "fast", "en", "en-US");
    }

    @Test
    void batchAcceptsMultipartFiles() {
        MockMultipartFile file =
                new MockMultipartFile("files", "page.png", "image/png", new byte[] {1, 2, 3});
        when(ocrBatchJobService.submit(List.of(file), "balanced", "ch"))
                .thenReturn(new OcrBatchSubmitResponse("batch-1", "pending", 1));

        var response = controller.batch(List.of(file), "balanced", "ch");

        assertEquals(HttpStatus.ACCEPTED, response.getStatusCode());
        assertEquals("batch-1", response.getBody().batchId());
    }

    @Test
    void resultReturnsNotFoundWhenMissing() {
        when(ocrBatchJobService.getResult("task-1")).thenReturn(java.util.Optional.empty());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.result("task-1"));

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }

    @Test
    void renderedPageReturnsPngBytes() {
        byte[] png = new byte[] {(byte) 137, 80, 78, 71};
        when(ocrBatchJobService.getRenderedPagePng("batch-1", 2))
                .thenReturn(java.util.Optional.of(png));

        var response = controller.renderedPage("batch-1", 2);

        assertEquals(HttpStatus.OK, response.getStatusCode());
        assertEquals(MediaType.IMAGE_PNG, response.getHeaders().getContentType());
        assertArrayEquals(png, response.getBody());
    }

    @Test
    void disabledEndpointReturnsNotFound() {
        when(endpointConfiguration.isEndpointEnabled(OcrExtensionController.ENDPOINT_HEALTH))
                .thenReturn(false);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> controller.health());

        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
    }
}

package stirling.software.SPDF.service.ocr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.io.IOException;
import java.net.ConnectException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.HttpStatus;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.web.server.ResponseStatusException;

import stirling.software.common.model.ApplicationProperties;

class OcrServiceClientTest {

    private ApplicationProperties applicationProperties;
    private HttpClient httpClient;
    private OcrServiceClient client;

    @BeforeEach
    void setUp() {
        applicationProperties = new ApplicationProperties();
        applicationProperties.getOcrService().setEnabled(true);
        applicationProperties.getOcrService().setUrl("http://localhost:5002");
        applicationProperties.getOcrService().setTimeoutSeconds(5);
        httpClient = mock(HttpClient.class);
        client = new OcrServiceClient(applicationProperties, httpClient);
    }

    @Test
    void getHealthWrapsConnectIOExceptionAsServiceUnavailable() throws Exception {
        ConnectException cause = new ConnectException("Connection refused");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.getHealth());

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
        assertSame(cause, ex.getCause());
    }

    @Test
    void getHealthWrapsTimeoutAsGatewayTimeout() throws Exception {
        HttpTimeoutException cause = new HttpTimeoutException("request timed out");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.getHealth());

        assertEquals(HttpStatus.GATEWAY_TIMEOUT, ex.getStatusCode());
        assertSame(cause, ex.getCause());
    }

    @Test
    void getHealthShortCircuitsWhenDisabled() {
        applicationProperties.getOcrService().setEnabled(false);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.getHealth());

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @Test
    void processRejectsEmptyFile() {
        MockMultipartFile empty = new MockMultipartFile("file", new byte[0]);

        ResponseStatusException ex =
                assertThrows(
                        ResponseStatusException.class,
                        () -> client.process(empty, 1, "balanced", "ch", null));

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void getHealthReturnsBodyOnSuccess() throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"status\":\"UP\"}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);

        assertEquals("{\"status\":\"UP\"}", client.getHealth());
    }

    @Test
    void getHealthSurfacesClientErrorStatus() throws Exception {
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(400);
        when(response.body()).thenReturn("bad request");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.getHealth());

        assertEquals(HttpStatus.BAD_REQUEST, ex.getStatusCode());
    }

    @Test
    void getHealthWrapsGenericIOExceptionAsServiceUnavailable() throws Exception {
        IOException cause = new IOException("socket reset");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenThrow(cause);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> client.getHealth());

        assertEquals(HttpStatus.SERVICE_UNAVAILABLE, ex.getStatusCode());
    }

    @Test
    void buildMultipartBodyIncludesFilePart() throws IOException {
        byte[] pngBytes = new byte[] {(byte) 0x89, 0x50, 0x4E, 0x47};

        byte[] body =
                OcrServiceClient.buildMultipartBody(
                        "test-boundary", "page.png", "image/png", pngBytes, 1, "balanced", "ch");

        String headerSection =
                new String(body, 0, Math.min(body.length, 512), StandardCharsets.UTF_8);
        assertTrue(headerSection.contains("name=\"file\""));
        assertTrue(headerSection.contains("filename=\"page.png\""));
        assertTrue(headerSection.contains("Content-Type: image/png"));
        assertTrue(indexOf(body, pngBytes) >= 0);
    }

    @Test
    void processForwardsUpstreamStatusWithoutThrowing() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile("file", "page.png", "image/png", new byte[] {1, 2, 3});
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(503);
        when(response.body()).thenReturn("{\"detail\":\"engine unavailable\"}");
        when(httpClient.send(any(), any(HttpResponse.BodyHandler.class))).thenReturn(response);

        OcrServiceResponse result = client.process(file, 1, "balanced", "ch", null);

        assertEquals(503, result.statusCode());
        assertEquals("{\"detail\":\"engine unavailable\"}", result.body());
    }

    @Test
    void processUsesHttp11MultipartRequest() throws Exception {
        MockMultipartFile file =
                new MockMultipartFile("file", "page.png", "image/png", new byte[] {1, 2, 3});
        ArgumentCaptor<HttpRequest> requestCaptor = ArgumentCaptor.forClass(HttpRequest.class);
        HttpResponse<String> response = mock(HttpResponse.class);
        when(response.statusCode()).thenReturn(200);
        when(response.body()).thenReturn("{\"text\":\"ok\"}");
        when(httpClient.send(requestCaptor.capture(), any(HttpResponse.BodyHandler.class)))
                .thenReturn(response);

        client.process(file, 1, "balanced", "ch", null);

        HttpRequest request = requestCaptor.getValue();
        assertTrue(
                request.headers()
                        .firstValue("Content-Type")
                        .orElse("")
                        .startsWith("multipart/form-data; boundary=----pdfsaas-ocr-"));
        assertEquals("/api/ocr/process", request.uri().getPath());
    }

    private static int indexOf(byte[] haystack, byte[] needle) {
        outer:
        for (int i = 0; i <= haystack.length - needle.length; i++) {
            for (int j = 0; j < needle.length; j++) {
                if (haystack[i + j] != needle[j]) {
                    continue outer;
                }
            }
            return i;
        }
        return -1;
    }
}

package stirling.software.SPDF.service.ocr;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Duration;
import java.util.UUID;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.common.model.ApplicationProperties;

@Slf4j
@Service
public class OcrServiceClient {

    private final ApplicationProperties applicationProperties;
    private final HttpClient httpClient;

    @Autowired
    public OcrServiceClient(ApplicationProperties applicationProperties) {
        this(applicationProperties, buildHttpClient(applicationProperties));
    }

    /** Package-private constructor that accepts an HttpClient directly; intended for tests. */
    OcrServiceClient(ApplicationProperties applicationProperties, HttpClient httpClient) {
        this.applicationProperties = applicationProperties;
        this.httpClient = httpClient;
    }

    private static HttpClient buildHttpClient(ApplicationProperties applicationProperties) {
        return HttpClient.newBuilder()
                .version(HttpClient.Version.HTTP_1_1)
                .connectTimeout(
                        Duration.ofSeconds(
                                applicationProperties.getOcrService().getTimeoutSeconds()))
                .build();
    }

    public String getHealth() throws IOException {
        requireEnabled();
        return sendJsonRequest(buildUrl("/health"), HttpRequest.Builder::GET, null).body();
    }

    public String warmup() throws IOException {
        requireEnabled();
        return sendJsonRequest(
                        buildUrl("/api/ocr/warmup"),
                        builder -> builder.POST(HttpRequest.BodyPublishers.noBody()),
                        null)
                .body();
    }

    public OcrServiceResponse process(
            MultipartFile file, int pageIndex, String mode, String lang, String acceptLanguage)
            throws IOException {
        requireEnabled();
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing OCR image file");
        }

        byte[] fileBytes = readUploadBytes(file);
        if (fileBytes.length == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Empty OCR image file");
        }

        String uploadFilename = sanitizeFilename(file.getOriginalFilename());
        String contentType =
                file.getContentType() != null && !file.getContentType().isBlank()
                        ? file.getContentType()
                        : "application/octet-stream";

        String boundary = "----pdfsaas-ocr-" + UUID.randomUUID().toString().replace("-", "");
        byte[] body =
                buildMultipartBody(
                        boundary,
                        uploadFilename,
                        contentType,
                        fileBytes,
                        pageIndex,
                        mode != null ? mode : "balanced",
                        lang != null ? lang : "en");

        HttpRequest.Builder builder =
                HttpRequest.newBuilder()
                        .uri(URI.create(buildUrl("/api/ocr/process")))
                        .header(
                                "Content-Type",
                                MediaType.MULTIPART_FORM_DATA_VALUE + "; boundary=" + boundary)
                        .header("Accept", "application/json")
                        .timeout(timeout())
                        .POST(HttpRequest.BodyPublishers.ofByteArray(body));

        if (acceptLanguage != null && !acceptLanguage.isBlank()) {
            builder.header("Accept-Language", acceptLanguage);
        }

        log.debug(
                "Proxying OCR process request to {} (file {} bytes, body {} bytes)",
                buildUrl("/api/ocr/process"),
                fileBytes.length,
                body.length);
        return sendRequestAllowUpstreamErrors(builder.build());
    }

    static byte[] readUploadBytes(MultipartFile file) throws IOException {
        try (InputStream input = file.getInputStream()) {
            return input.readAllBytes();
        }
    }

    static String sanitizeFilename(String originalFilename) {
        if (originalFilename == null || originalFilename.isBlank()) {
            return "page.png";
        }
        String base = Path.of(originalFilename).getFileName().toString();
        if (base.isBlank()) {
            return "page.png";
        }
        return base.replace("\"", "_");
    }

    static byte[] buildMultipartBody(
            String boundary,
            String filename,
            String contentType,
            byte[] fileBytes,
            int pageIndex,
            String mode,
            String lang)
            throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream();
        writeFilePart(output, boundary, "file", filename, contentType, fileBytes);
        writeTextPart(output, boundary, "page_index", String.valueOf(pageIndex));
        writeTextPart(output, boundary, "mode", mode);
        writeTextPart(output, boundary, "lang", lang);
        writeLine(output, "--" + boundary + "--");
        writeLine(output, "");
        return output.toByteArray();
    }

    private static void writeTextPart(
            ByteArrayOutputStream output, String boundary, String name, String value)
            throws IOException {
        writeLine(output, "--" + boundary);
        writeLine(output, "Content-Disposition: form-data; name=\"" + name + "\"");
        writeLine(output, "");
        writeLine(output, value);
    }

    private static void writeFilePart(
            ByteArrayOutputStream output,
            String boundary,
            String name,
            String filename,
            String contentType,
            byte[] fileBytes)
            throws IOException {
        writeLine(output, "--" + boundary);
        writeLine(
                output,
                "Content-Disposition: form-data; name=\""
                        + name
                        + "\"; filename=\""
                        + filename
                        + "\"");
        writeLine(output, "Content-Type: " + contentType);
        writeLine(output, "");
        output.write(fileBytes);
        writeLine(output, "");
    }

    private static void writeLine(ByteArrayOutputStream output, String value) throws IOException {
        output.write(value.getBytes(StandardCharsets.UTF_8));
        output.write("\r\n".getBytes(StandardCharsets.UTF_8));
    }

    private void requireEnabled() {
        ApplicationProperties.OcrService config = applicationProperties.getOcrService();
        if (!config.isEnabled()) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "OCR service integration is disabled");
        }
    }

    private String buildUrl(String path) {
        return resolveBaseUrl() + path;
    }

    private String resolveBaseUrl() {
        String envUrl = System.getenv("OCR_SERVICE_URL");
        if (envUrl != null && !envUrl.isBlank()) {
            return envUrl.strip().replaceAll("/+$", "");
        }
        return applicationProperties.getOcrService().getUrl().strip().replaceAll("/+$", "");
    }

    private Duration timeout() {
        return Duration.ofSeconds(applicationProperties.getOcrService().getTimeoutSeconds());
    }

    private OcrServiceResponse sendJsonRequest(
            String url,
            java.util.function.Function<HttpRequest.Builder, HttpRequest.Builder> method,
            String acceptLanguage)
            throws IOException {
        HttpRequest.Builder builder =
                HttpRequest.newBuilder().uri(URI.create(url)).header("Accept", "application/json");
        if (acceptLanguage != null && !acceptLanguage.isBlank()) {
            builder.header("Accept-Language", acceptLanguage);
        }
        builder = method.apply(builder.timeout(timeout()));
        return sendRequestExpectSuccess(builder.build());
    }

    private OcrServiceResponse sendRequestExpectSuccess(HttpRequest request) throws IOException {
        OcrServiceResponse response = sendRequestAllowUpstreamErrors(request);
        if (response.statusCode() >= 400) {
            throw new ResponseStatusException(
                    HttpStatus.valueOf(response.statusCode()),
                    response.body() != null ? response.body() : "");
        }
        return response;
    }

    private OcrServiceResponse sendRequestAllowUpstreamErrors(HttpRequest request)
            throws IOException {
        log.debug("Proxying OCR service request to {}", request.uri());
        HttpResponse<String> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        } catch (HttpTimeoutException e) {
            throw new ResponseStatusException(
                    HttpStatus.GATEWAY_TIMEOUT, "OCR service timed out", e);
        } catch (IOException e) {
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE,
                    "OCR service unreachable: " + e.getMessage(),
                    e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(
                    HttpStatus.SERVICE_UNAVAILABLE, "OCR service request was interrupted");
        }

        log.debug("OCR service responded with status {}", response.statusCode());
        return new OcrServiceResponse(response.statusCode(), response.body());
    }
}

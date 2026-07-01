package stirling.software.SPDF.controller.api.ocr;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.service.ocr.OcrBatchJobService;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchResultResponse;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchSubmitResponse;
import stirling.software.SPDF.service.ocr.OcrPdfPipelineService;
import stirling.software.SPDF.service.ocr.OcrServiceClient;
import stirling.software.SPDF.service.ocr.OcrServiceResponse;
import stirling.software.common.annotations.api.OcrApi;

@OcrApi
@Slf4j
@RequiredArgsConstructor
public class OcrExtensionController {

    static final String ENDPOINT_HEALTH = "ocr-health";
    static final String ENDPOINT_PROCESS = "ocr-process";
    static final String ENDPOINT_WARMUP = "ocr-warmup";
    static final String ENDPOINT_BATCH = "ocr-batch";
    static final String ENDPOINT_BATCH_FROM_PDF = "ocr-batch-from-pdf";
    static final String ENDPOINT_RESULT = "ocr-result";
    static final String ENDPOINT_RENDERED_PAGE = "ocr-rendered-page";

    private final OcrServiceClient ocrServiceClient;
    private final OcrBatchJobService ocrBatchJobService;
    private final OcrPdfPipelineService ocrPdfPipelineService;
    private final EndpointConfiguration endpointConfiguration;

    @GetMapping("/health")
    @Operation(
            summary = "OCR service health",
            description = "Proxies to the local PaddleOCR Python service GET /health.")
    public ResponseEntity<String> health() throws IOException {
        requireEndpoint(ENDPOINT_HEALTH);
        return jsonResponse(ocrServiceClient.getHealth());
    }

    @PostMapping("/warmup")
    @Operation(
            summary = "Warm up OCR models",
            description = "Proxies to POST /api/ocr/warmup on the Python OCR service.")
    public ResponseEntity<String> warmup() throws IOException {
        requireEndpoint(ENDPOINT_WARMUP);
        return jsonResponse(ocrServiceClient.warmup());
    }

    @PostMapping(value = "/process", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "OCR a single page image",
            description =
                    """
                    Proxies multipart OCR to the local PaddleOCR service. Accepts PNG/JPG/TIFF page
                    images and returns structured text + bounding boxes (OER-021 subset).
                    """)
    public ResponseEntity<String> process(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "page_index", defaultValue = "1") int pageIndex,
            @RequestParam(value = "mode", defaultValue = "balanced") String mode,
            @RequestParam(value = "lang", defaultValue = "en") String lang,
            @RequestHeader(value = "Accept-Language", required = false) String acceptLanguage)
            throws IOException {
        requireEndpoint(ENDPOINT_PROCESS);
        OcrServiceResponse upstream =
                ocrServiceClient.process(file, pageIndex, mode, lang, acceptLanguage);
        return ResponseEntity.status(upstream.statusCode())
                .contentType(MediaType.APPLICATION_JSON)
                .body(upstream.body());
    }

    @PostMapping(value = "/batch", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Batch OCR (async)",
            description =
                    """
                    Accepts multiple page images as `files`, queues an async OCR batch job, and
                    returns a batch id. Poll GET /result/{id} for progress and per-page results.
                    """)
    public ResponseEntity<OcrBatchSubmitResponse> batch(
            @RequestParam("files") List<MultipartFile> files,
            @RequestParam(value = "mode", defaultValue = "balanced") String mode,
            @RequestParam(value = "lang", defaultValue = "en") String lang) {
        requireEndpoint(ENDPOINT_BATCH);
        OcrBatchSubmitResponse response = ocrBatchJobService.submit(files, mode, lang);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @PostMapping(value = "/batch-from-pdf", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Batch OCR from PDF (async)",
            description =
                    """
                    Renders each PDF page to PNG at the given DPI, queues an async OCR batch job,
                    and returns a batch id. Poll GET /result/{id} for progress.
                    """)
    public ResponseEntity<OcrBatchSubmitResponse> batchFromPdf(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "dpi", defaultValue = "150") int dpi,
            @RequestParam(value = "mode", defaultValue = "balanced") String mode,
            @RequestParam(value = "lang", defaultValue = "en") String lang,
            @RequestParam(value = "contentTop", required = false) Float contentTop,
            @RequestParam(value = "contentBottom", required = false) Float contentBottom)
            throws IOException {
        requireEndpoint(ENDPOINT_BATCH_FROM_PDF);
        OcrBatchSubmitResponse response =
                ocrPdfPipelineService.submitPdf(file, dpi, mode, lang, contentTop, contentBottom);
        return ResponseEntity.status(HttpStatus.ACCEPTED).body(response);
    }

    @GetMapping("/result/{id}")
    @Operation(
            summary = "Fetch async OCR batch result",
            description = "Returns batch status, progress, and per-page OCR output.")
    public ResponseEntity<OcrBatchResultResponse> result(@PathVariable("id") String id) {
        requireEndpoint(ENDPOINT_RESULT);
        return ocrBatchJobService
                .getResult(id)
                .map(ResponseEntity::ok)
                .orElseThrow(
                        () ->
                                new ResponseStatusException(
                                        HttpStatus.NOT_FOUND, "OCR batch not found: " + id));
    }

    @GetMapping("/rendered-page/{batchId}/{pageIndex}")
    @Operation(
            summary = "Download OCR-rendered page PNG",
            description =
                    """
                    Returns the PNG rendered during POST /batch-from-pdf for the given page (1-based).
                    Available only while the batch job remains in backend memory.
                    """)
    public ResponseEntity<byte[]> renderedPage(
            @PathVariable("batchId") String batchId, @PathVariable("pageIndex") int pageIndex) {
        requireEndpoint(ENDPOINT_RENDERED_PAGE);
        if (pageIndex < 1) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "pageIndex must be >= 1");
        }
        byte[] png =
                ocrBatchJobService
                        .getRenderedPagePng(batchId, pageIndex)
                        .orElseThrow(
                                () ->
                                        new ResponseStatusException(
                                                HttpStatus.NOT_FOUND,
                                                "Rendered page not found: "
                                                        + batchId
                                                        + " page "
                                                        + pageIndex));
        return ResponseEntity.ok().contentType(MediaType.IMAGE_PNG).body(png);
    }

    private void requireEndpoint(String endpointKey) {
        if (!endpointConfiguration.isEndpointEnabled(endpointKey)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "OCR endpoint disabled");
        }
    }

    private static ResponseEntity<String> jsonResponse(String body) {
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(body);
    }
}

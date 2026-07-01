package stirling.software.SPDF.controller.api.pdf;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.List;
import java.util.Optional;

import javax.imageio.ImageIO;

import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import io.swagger.v3.oas.annotations.Operation;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.config.EndpointConfiguration;
import stirling.software.SPDF.service.ocr.OcrBatchJobService;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchResultResponse;
import stirling.software.SPDF.service.pdf.OcrContentRegion;
import stirling.software.SPDF.service.pdf.OcrRegionEstimator;
import stirling.software.SPDF.service.pdf.PdfDoubleLayerService;
import stirling.software.SPDF.service.pdf.PdfPageRenderService;
import stirling.software.SPDF.service.pdf.PdfPageRenderService.RenderedPage;
import stirling.software.SPDF.service.pdf.PdfPreviewPageResponse;
import stirling.software.common.annotations.api.PdfSaasApi;

import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@PdfSaasApi
@Slf4j
@RequiredArgsConstructor
public class PdfExtensionController {

    static final String ENDPOINT_DOUBLE_LAYER = "pdf-double-layer";
    static final String ENDPOINT_PREVIEW_PAGE = "pdf-preview-page";

    private final PdfDoubleLayerService pdfDoubleLayerService;
    private final PdfPageRenderService pdfPageRenderService;
    private final OcrBatchJobService ocrBatchJobService;
    private final EndpointConfiguration endpointConfiguration;
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    @PostMapping(value = "/double-layer", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Build searchable double-layer PDF",
            description =
                    """
                    Combines the source PDF raster with invisible OCR text from a completed batch job.
                    Requires the same PDF used for POST /api/v1/ocr/batch-from-pdf and a completed batch id.
                    When the in-memory batch is gone (e.g. backend restart), pass batchResultJson from a
                    persisted task file instead. Optionally pass pageImages (PNG, in page order) from
                    a local cache to skip re-rendering the source PDF.
                    """)
    public ResponseEntity<byte[]> doubleLayer(
            @RequestParam("file") MultipartFile file,
            @RequestParam("batchId") String batchId,
            @RequestParam(value = "batchResultJson", required = false) String batchResultJson,
            @RequestParam(value = "pageImages", required = false) List<MultipartFile> pageImages)
            throws IOException {
        requireEndpoint(ENDPOINT_DOUBLE_LAYER);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing PDF file");
        }

        OcrBatchResultResponse batchResult = resolveBatchResult(batchId, batchResultJson);

        List<RenderedPage> cachedPages = resolveRenderedPages(batchId, pageImages);
        byte[] pdfBytes =
                pdfDoubleLayerService.buildDoubleLayer(file.getBytes(), batchResult, cachedPages);
        return ResponseEntity.ok()
                .header(
                        HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"double-layer.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(pdfBytes);
    }

    @PostMapping(value = "/preview-page", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @Operation(
            summary = "Render a PDF page preview for OCR region setup",
            description =
                    """
                    Renders a single PDF page to PNG at the given DPI and suggests vertical OCR bounds
                    by detecting isolated header/footer bands. Returns JSON with base64 PNG and ratios.
                    """)
    public ResponseEntity<PdfPreviewPageResponse> previewPage(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "pageIndex", defaultValue = "1") int pageIndex,
            @RequestParam(value = "dpi", defaultValue = "150") int dpi)
            throws IOException {
        requireEndpoint(ENDPOINT_PREVIEW_PAGE);
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing PDF file");
        }
        byte[] png = pdfPageRenderService.renderPagePreview(file.getBytes(), pageIndex, dpi);
        BufferedImage image = ImageIO.read(new ByteArrayInputStream(png));
        if (image == null) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Failed to decode preview PNG");
        }

        OcrContentRegion suggested = OcrRegionEstimator.estimate(image);
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_JSON)
                .body(
                        new PdfPreviewPageResponse(
                                Base64.getEncoder().encodeToString(png),
                                image.getWidth(),
                                image.getHeight(),
                                pageIndex,
                                dpi,
                                suggested.topRatio(),
                                suggested.bottomRatio()));
    }

    private OcrBatchResultResponse resolveBatchResult(String batchId, String batchResultJson)
            throws IOException {
        if (batchId != null && !batchId.isBlank()) {
            Optional<OcrBatchResultResponse> fromMemory = ocrBatchJobService.getResult(batchId);
            if (fromMemory.isPresent()) {
                return fromMemory.get();
            }
        }

        if (batchResultJson != null && !batchResultJson.isBlank()) {
            OcrBatchResultResponse parsed =
                    objectMapper.readValue(batchResultJson, OcrBatchResultResponse.class);
            if (parsed == null || !"completed".equals(parsed.status())) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Persisted OCR batch is not completed");
            }
            return parsed;
        }

        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "OCR batch not found: " + batchId);
    }

    private List<RenderedPage> resolveRenderedPages(String batchId, List<MultipartFile> pageImages)
            throws IOException {
        Optional<List<RenderedPage>> fromMemory = ocrBatchJobService.getRenderedPages(batchId);
        if (fromMemory.isPresent()) {
            return fromMemory.get();
        }

        if (pageImages == null || pageImages.isEmpty()) {
            return null;
        }

        List<RenderedPage> cached = new ArrayList<>(pageImages.size());
        for (int index = 0; index < pageImages.size(); index++) {
            MultipartFile image = pageImages.get(index);
            if (image == null || image.isEmpty()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Empty page image at index " + (index + 1));
            }
            cached.add(new RenderedPage(index + 1, image.getBytes(), 0, 0));
        }
        return cached;
    }

    private void requireEndpoint(String endpointKey) {
        if (!endpointConfiguration.isEndpointEnabled(endpointKey)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "PDF endpoint disabled");
        }
    }
}

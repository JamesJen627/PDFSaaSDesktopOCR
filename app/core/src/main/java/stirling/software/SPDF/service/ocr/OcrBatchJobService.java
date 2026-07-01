package stirling.software.SPDF.service.ocr;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchPageResult;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchResultResponse;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchSubmitResponse;
import stirling.software.SPDF.service.pdf.OcrContentRegion;
import stirling.software.SPDF.service.pdf.OcrImageCrop;
import stirling.software.SPDF.service.pdf.PdfPageRenderService.RenderedPage;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Service
public class OcrBatchJobService {

    static final int MAX_PAGES = 100;

    private final OcrServiceClient ocrServiceClient;
    private final ObjectMapper objectMapper;
    private final ConcurrentHashMap<String, BatchJob> jobs = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor();

    public OcrBatchJobService(OcrServiceClient ocrServiceClient) {
        this.ocrServiceClient = ocrServiceClient;
        this.objectMapper = JsonMapper.builder().build();
    }

    public OcrBatchSubmitResponse submit(List<MultipartFile> files, String mode, String lang) {
        if (files == null || files.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing OCR batch files");
        }
        if (files.size() > MAX_PAGES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Batch exceeds maximum page count: " + MAX_PAGES);
        }

        List<PageInput> pages = new ArrayList<>();
        for (int index = 0; index < files.size(); index++) {
            MultipartFile file = files.get(index);
            if (file == null || file.isEmpty()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Empty file at batch index " + (index + 1));
            }
            try {
                pages.add(PageInput.fromMultipart(file));
            } catch (IOException e) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST, "Failed to read batch file: " + e.getMessage(), e);
            }
        }

        return enqueue(pages, mode, lang, null, List.of(), OcrContentRegion.fullPage());
    }

    public OcrBatchSubmitResponse submitFromRenderedPages(
            List<RenderedPage> renderedPages, String mode, String lang, int renderDpi) {
        return submitFromRenderedPages(
                renderedPages, mode, lang, renderDpi, OcrContentRegion.fullPage());
    }

    public OcrBatchSubmitResponse submitFromRenderedPages(
            List<RenderedPage> renderedPages,
            String mode,
            String lang,
            int renderDpi,
            OcrContentRegion region) {
        if (renderedPages == null || renderedPages.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "PDF has no pages");
        }
        if (renderedPages.size() > MAX_PAGES) {
            throw new ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "Batch exceeds maximum page count: " + MAX_PAGES);
        }

        OcrContentRegion bounds =
                region != null ? region.normalized() : OcrContentRegion.fullPage();
        List<PageInput> pages = new ArrayList<>(renderedPages.size());
        for (RenderedPage page : renderedPages) {
            byte[] ocrBytes = page.pngBytes();
            if (!bounds.isFullPage()) {
                try {
                    ocrBytes = OcrImageCrop.cropPng(page.pngBytes(), bounds);
                } catch (IOException e) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Failed to crop page "
                                    + page.pageIndex()
                                    + " for OCR: "
                                    + e.getMessage(),
                            e);
                }
            }
            pages.add(new PageInput("page-" + page.pageIndex() + ".png", "image/png", ocrBytes));
        }

        return enqueue(pages, mode, lang, renderDpi, renderedPages, bounds);
    }

    public Optional<List<RenderedPage>> getRenderedPages(String batchId) {
        BatchJob job = jobs.get(batchId);
        if (job == null) {
            return Optional.empty();
        }
        List<RenderedPage> pages = job.renderedPages();
        return pages.isEmpty() ? Optional.empty() : Optional.of(pages);
    }

    public Optional<byte[]> getRenderedPagePng(String batchId, int pageIndex) {
        Optional<List<RenderedPage>> pages = getRenderedPages(batchId);
        if (pages.isEmpty() || pageIndex < 1 || pageIndex > pages.get().size()) {
            return Optional.empty();
        }
        return Optional.of(pages.get().get(pageIndex - 1).pngBytes());
    }

    public Optional<OcrBatchResultResponse> getResult(String batchId) {
        BatchJob job = jobs.get(batchId);
        if (job == null) {
            return Optional.empty();
        }
        return Optional.of(job.toResponse());
    }

    private OcrBatchSubmitResponse enqueue(
            List<PageInput> pages,
            String mode,
            String lang,
            Integer renderDpi,
            List<RenderedPage> renderedPages,
            OcrContentRegion contentRegion) {
        String batchId = UUID.randomUUID().toString();
        OcrContentRegion region =
                contentRegion != null ? contentRegion.normalized() : OcrContentRegion.fullPage();
        BatchJob job =
                new BatchJob(
                        batchId,
                        pages.size(),
                        mode != null ? mode : "balanced",
                        lang != null ? lang : "en",
                        pages,
                        renderDpi,
                        renderedPages,
                        region);
        jobs.put(batchId, job);
        executor.submit(() -> runJob(job));
        log.info("Submitted OCR batch {} ({} pages)", batchId, pages.size());
        return new OcrBatchSubmitResponse(batchId, "pending", pages.size());
    }

    private void runJob(BatchJob job) {
        job.markRunning();
        for (int pageIndex = 1; pageIndex <= job.pageCount(); pageIndex++) {
            job.markPageProcessing(pageIndex);
            PageInput input = job.pageInput(pageIndex);
            try {
                OcrServiceResponse upstream =
                        ocrServiceClient.process(
                                input.toMultipartFile(), pageIndex, job.mode(), job.lang(), null);
                if (upstream.statusCode() >= 400) {
                    job.markPageFailed(pageIndex, extractError(upstream.body()));
                    continue;
                }
                job.markPageCompleted(pageIndex, parseSuccess(upstream.body(), pageIndex));
            } catch (Exception e) {
                log.warn("OCR batch {} page {} failed", job.batchId(), pageIndex, e);
                job.markPageFailed(pageIndex, e.getMessage());
            }
        }
        job.markFinished();
        log.info(
                "OCR batch {} finished: {} completed, {} failed",
                job.batchId(),
                job.completedCount(),
                job.failedCount());
    }

    private OcrBatchPageResult parseSuccess(String body, int pageIndex) {
        try {
            JsonNode node = objectMapper.readTree(body);
            return new OcrBatchPageResult(
                    node.path("page_index").asInt(pageIndex),
                    "completed",
                    textOrNull(node.path("text")),
                    node.path("page_confidence").isNumber()
                            ? node.path("page_confidence").asDouble()
                            : null,
                    textOrNull(node.path("language")),
                    null,
                    body);
        } catch (Exception e) {
            return new OcrBatchPageResult(pageIndex, "completed", body, null, null, null, body);
        }
    }

    private static String extractError(String body) {
        if (body == null || body.isBlank()) {
            return "OCR upstream error";
        }
        return body.length() > 500 ? body.substring(0, 500) : body;
    }

    private static String textOrNull(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asString(null);
        return value != null && !value.isBlank() ? value : null;
    }

    private record PageInput(String filename, String contentType, byte[] bytes) {
        static PageInput fromMultipart(MultipartFile file) throws IOException {
            String name = file.getOriginalFilename();
            if (name == null || name.isBlank()) {
                name = "page.png";
            }
            String contentType =
                    file.getContentType() != null && !file.getContentType().isBlank()
                            ? file.getContentType()
                            : "application/octet-stream";
            return new PageInput(name, contentType, file.getBytes());
        }

        MultipartFile toMultipartFile() {
            return new InMemoryMultipartFile("file", filename, contentType, bytes);
        }
    }

    private static final class BatchJob {
        private final String batchId;
        private final int pageCount;
        private final String mode;
        private final String lang;
        private final List<PageInput> inputs;
        private final Integer renderDpi;
        private final List<RenderedPage> renderedPages;
        private final OcrContentRegion contentRegion;
        private final List<OcrBatchPageResult> pages;
        private volatile String status = "pending";
        private volatile String error;

        BatchJob(
                String batchId,
                int pageCount,
                String mode,
                String lang,
                List<PageInput> inputs,
                Integer renderDpi,
                List<RenderedPage> renderedPages,
                OcrContentRegion contentRegion) {
            this.batchId = batchId;
            this.pageCount = pageCount;
            this.mode = mode;
            this.lang = lang;
            this.inputs = List.copyOf(inputs);
            this.renderDpi = renderDpi;
            this.renderedPages =
                    renderedPages == null || renderedPages.isEmpty()
                            ? List.of()
                            : List.copyOf(renderedPages);
            this.contentRegion =
                    contentRegion != null
                            ? contentRegion.normalized()
                            : OcrContentRegion.fullPage();
            this.pages = new ArrayList<>();
            for (int i = 1; i <= pageCount; i++) {
                pages.add(new OcrBatchPageResult(i, "pending", null, null, null, null, null));
            }
        }

        String batchId() {
            return batchId;
        }

        int pageCount() {
            return pageCount;
        }

        String mode() {
            return mode;
        }

        String lang() {
            return lang;
        }

        List<RenderedPage> renderedPages() {
            return renderedPages;
        }

        PageInput pageInput(int pageIndex) {
            return inputs.get(pageIndex - 1);
        }

        synchronized void markRunning() {
            status = "running";
        }

        synchronized void markPageProcessing(int pageIndex) {
            pages.set(pageIndex - 1, pendingPage(pageIndex, "processing"));
        }

        synchronized void markPageCompleted(int pageIndex, OcrBatchPageResult result) {
            pages.set(pageIndex - 1, result);
        }

        synchronized void markPageFailed(int pageIndex, String message) {
            pages.set(pageIndex - 1, pendingPage(pageIndex, "failed", message));
        }

        synchronized void markFinished() {
            int failed = failedCount();
            status = failed == pageCount ? "failed" : "completed";
            if (failed == pageCount) {
                error = "All pages failed OCR";
            }
        }

        synchronized int completedCount() {
            return (int) pages.stream().filter(p -> "completed".equals(p.status())).count();
        }

        synchronized int failedCount() {
            return (int) pages.stream().filter(p -> "failed".equals(p.status())).count();
        }

        synchronized OcrBatchResultResponse toResponse() {
            int completed = completedCount();
            int failed = failedCount();
            int progress =
                    pageCount == 0 ? 0 : Math.round(((completed + failed) * 100f) / pageCount);
            return new OcrBatchResultResponse(
                    batchId,
                    status,
                    progress,
                    pageCount,
                    completed,
                    failed,
                    List.copyOf(pages),
                    error,
                    renderDpi,
                    contentRegion.isFullPage() ? null : contentRegion.topRatio(),
                    contentRegion.isFullPage() ? null : contentRegion.bottomRatio());
        }

        private static OcrBatchPageResult pendingPage(int pageIndex, String pageStatus) {
            return pendingPage(pageIndex, pageStatus, null);
        }

        private static OcrBatchPageResult pendingPage(
                int pageIndex, String pageStatus, String message) {
            return new OcrBatchPageResult(pageIndex, pageStatus, null, null, null, message, null);
        }
    }
}

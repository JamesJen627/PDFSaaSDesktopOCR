package stirling.software.SPDF.service.ocr;

import java.util.List;

public final class OcrBatchModels {

    private OcrBatchModels() {}

    public record OcrBatchSubmitResponse(String batchId, String status, int pageCount) {}

    public record OcrBatchPageResult(
            int pageIndex,
            String status,
            String text,
            Double pageConfidence,
            String language,
            String error,
            String rawJson) {}

    public record OcrBatchResultResponse(
            String batchId,
            String status,
            int progress,
            int pageCount,
            int completedCount,
            int failedCount,
            List<OcrBatchPageResult> pages,
            String error,
            Integer renderDpi,
            Float contentTopRatio,
            Float contentBottomRatio) {}
}

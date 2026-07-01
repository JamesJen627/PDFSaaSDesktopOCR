package stirling.software.SPDF.service.ocr;

import java.io.IOException;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;

import stirling.software.SPDF.service.pdf.OcrContentRegion;
import stirling.software.SPDF.service.pdf.PdfPageRenderService;
import stirling.software.SPDF.service.pdf.PdfPageRenderService.RenderedPage;

@Service
@RequiredArgsConstructor
public class OcrPdfPipelineService {

    private final PdfPageRenderService pdfPageRenderService;
    private final OcrBatchJobService ocrBatchJobService;

    public OcrBatchModels.OcrBatchSubmitResponse submitPdf(
            MultipartFile pdf, int dpi, String mode, String lang) throws IOException {
        return submitPdf(pdf, dpi, mode, lang, null, null);
    }

    public OcrBatchModels.OcrBatchSubmitResponse submitPdf(
            MultipartFile pdf,
            int dpi,
            String mode,
            String lang,
            Float contentTop,
            Float contentBottom)
            throws IOException {
        if (pdf == null || pdf.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing PDF file");
        }
        OcrContentRegion region = OcrContentRegion.parse(contentTop, contentBottom);
        List<RenderedPage> renderedPages = pdfPageRenderService.renderPages(pdf.getBytes(), dpi);
        return ocrBatchJobService.submitFromRenderedPages(renderedPages, mode, lang, dpi, region);
    }
}

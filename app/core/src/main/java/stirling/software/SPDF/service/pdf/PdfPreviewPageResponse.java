package stirling.software.SPDF.service.pdf;

public record PdfPreviewPageResponse(
        String imageBase64,
        int width,
        int height,
        int pageIndex,
        int dpi,
        float contentTop,
        float contentBottom) {}

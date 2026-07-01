package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/**
 * Combined annotation for PDFSaaS PaddleOCR extension API controllers.
 *
 * <p>Maps both Stirling-style {@code /api/v1/ocr} and PRD {@code /api/ocr} prefixes.
 */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping({"/api/v1/ocr", "/api/ocr"})
@Tag(
        name = "OCR Extension",
        description =
                """
                PDFSaaS Desktop OCR extension — proxies page-level OCR requests to the local
                PaddleOCR Python service (port 5002). Distinct from legacy {@code /misc/ocr-pdf}
                (OCRmyPDF / Tesseract full-document OCR).
                """)
public @interface OcrApi {}

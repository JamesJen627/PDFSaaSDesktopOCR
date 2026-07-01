package stirling.software.common.annotations.api;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.tags.Tag;

/** PDFSaaS PDF reconstruction APIs ({@code /api/v1/pdf} and PRD {@code /api/pdf}). */
@Target(ElementType.TYPE)
@Retention(RetentionPolicy.RUNTIME)
@RestController
@RequestMapping({"/api/v1/pdf", "/api/pdf"})
@Tag(
        name = "PDF Extension",
        description = "PDFSaaS Desktop PDF reconstruction — double-layer PDF and related outputs.")
public @interface PdfSaasApi {}

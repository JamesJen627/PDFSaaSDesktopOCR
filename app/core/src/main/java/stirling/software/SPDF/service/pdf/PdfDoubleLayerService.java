package stirling.software.SPDF.service.pdf;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

import javax.imageio.ImageIO;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDFontDescriptor;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import org.apache.pdfbox.pdmodel.graphics.state.PDExtendedGraphicsState;
import org.apache.pdfbox.pdmodel.graphics.state.RenderingMode;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

import stirling.software.SPDF.pdf.parser.PageColumnLayout;
import stirling.software.SPDF.service.PdfJsonFallbackFontService;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchPageResult;
import stirling.software.SPDF.service.ocr.OcrBatchModels.OcrBatchResultResponse;
import stirling.software.SPDF.service.pdf.PdfPageRenderService.RenderedPage;
import stirling.software.common.service.CustomPDFDocumentFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import tools.jackson.databind.json.JsonMapper;

@Slf4j
@Service
@RequiredArgsConstructor
public class PdfDoubleLayerService {

    private static final float MIN_FONT_SIZE = 4f;

    /**
     * CJK text-layer sizing learned from professionally converted double-layer PDFs (SimSun,
     * 黄帝内经参考样本): fontSize equals OCR box height (median fs/h = 1.0); baseline sits ~14% above box
     * bottom (|descender|/em ≈ 0.14).
     */
    private static final float CJK_FONT_HEIGHT_RATIO = 1.0f;

    private static final float LATIN_FONT_HEIGHT_RATIO = 0.85f;

    /** Fallback baseline offset when the font descriptor is unavailable (SimSun-like). */
    private static final float CJK_BASELINE_FROM_BOTTOM = 0.14f;

    private static final float LATIN_BASELINE_FROM_BOTTOM = 0.15f;

    /** Overlap tolerance (image px) — boxes closer than this are treated as same-line neighbors. */
    private static final float LINE_Y_TOLERANCE_FACTOR = 0.5f;

    private static final Pattern CJK_PATTERN =
            Pattern.compile(
                    "\\p{Script=Han}|\\p{Script=Hiragana}|\\p{Script=Katakana}|\\p{Script=Hangul}");
    private static final Pattern LATIN_WORD_CHAR = Pattern.compile("[\\p{IsLatin}\\p{N}]");

    private final CustomPDFDocumentFactory pdfDocumentFactory;
    private final PdfJsonFallbackFontService fallbackFontService;
    private final ObjectMapper objectMapper = JsonMapper.builder().build();

    public byte[] buildDoubleLayer(byte[] sourcePdfBytes, OcrBatchResultResponse batchResult)
            throws IOException {
        return buildDoubleLayer(sourcePdfBytes, batchResult, null);
    }

    public byte[] buildDoubleLayer(
            byte[] sourcePdfBytes,
            OcrBatchResultResponse batchResult,
            List<RenderedPage> cachedRenderedPages)
            throws IOException {
        if (batchResult == null || !"completed".equals(batchResult.status())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "OCR batch is not completed");
        }

        int renderDpi =
                batchResult.renderDpi() != null && batchResult.renderDpi() > 0
                        ? batchResult.renderDpi()
                        : PdfPageRenderService.DEFAULT_OCR_DPI;

        try (PDDocument source = pdfDocumentFactory.load(sourcePdfBytes);
                PDDocument output = new PDDocument()) {
            int pageCount = source.getNumberOfPages();
            if (pageCount != batchResult.pageCount()) {
                throw new ResponseStatusException(
                        HttpStatus.BAD_REQUEST,
                        "PDF page count ("
                                + pageCount
                                + ") does not match OCR batch ("
                                + batchResult.pageCount()
                                + ")");
            }

            boolean useCachedPages =
                    cachedRenderedPages != null && cachedRenderedPages.size() == pageCount;
            PDFRenderer renderer = useCachedPages ? null : new PDFRenderer(source);
            if (useCachedPages) {
                log.info(
                        "Building double-layer PDF using {} cached OCR page image(s)",
                        cachedRenderedPages.size());
            }

            PDFont latinFont = fallbackFontService.loadFallbackPdfFont(output);
            PDFont cjkFont =
                    fallbackFontService.loadFallbackPdfFont(
                            output, PdfJsonFallbackFontService.FALLBACK_FONT_CJK_ID);

            for (int pageIndex = 0; pageIndex < pageCount; pageIndex++) {
                log.info("Building double-layer page {}/{}", pageIndex + 1, pageCount);
                PDPage sourcePage = source.getPage(pageIndex);
                PDRectangle mediaBox = sourcePage.getMediaBox();
                float pageWidth = mediaBox.getWidth();
                float pageHeight = mediaBox.getHeight();

                var image =
                        useCachedPages
                                ? ImageIO.read(
                                        new ByteArrayInputStream(
                                                cachedRenderedPages.get(pageIndex).pngBytes()))
                                : renderer.renderImageWithDPI(pageIndex, renderDpi);
                if (image == null) {
                    throw new ResponseStatusException(
                            HttpStatus.BAD_REQUEST,
                            "Failed to decode OCR page image for page " + (pageIndex + 1));
                }

                PDPage outPage = new PDPage(new PDRectangle(pageWidth, pageHeight));
                output.addPage(outPage);

                PDImageXObject imageXObject = embedPageImage(output, image, pageIndex);
                try (PDPageContentStream imageStream = new PDPageContentStream(output, outPage)) {
                    imageStream.drawImage(imageXObject, 0, 0, pageWidth, pageHeight);
                }

                OcrBatchPageResult pageResult = batchResult.pages().get(pageIndex);
                if (pageResult.rawJson() == null || pageResult.rawJson().isBlank()) {
                    continue;
                }

                PDFont font =
                        selectFont(latinFont, cjkFont, pageResult.language(), pageResult.rawJson());
                boolean cjkTextLayer =
                        font == cjkFont
                                || containsCjk(pageResult.language())
                                || containsCjk(pageResult.rawJson());

                appendInvisibleTextLayer(
                        output,
                        outPage,
                        font,
                        cjkTextLayer,
                        pageWidth,
                        pageHeight,
                        image.getWidth(),
                        image.getHeight(),
                        pageResult.rawJson(),
                        regionFromBatch(batchResult));
            }

            ByteArrayOutputStream bytes = new ByteArrayOutputStream();
            output.save(bytes);
            log.info(
                    "Built double-layer PDF ({} pages, {} DPI, cachedImages={})",
                    pageCount,
                    renderDpi,
                    useCachedPages);
            return bytes.toByteArray();
        }
    }

    private static PDImageXObject embedPageImage(
            PDDocument document, java.awt.image.BufferedImage image, int pageIndex)
            throws IOException {
        ByteArrayOutputStream jpegBytes = new ByteArrayOutputStream();
        ImageIO.write(image, "jpeg", jpegBytes);
        return PDImageXObject.createFromByteArray(
                document, jpegBytes.toByteArray(), "page-" + (pageIndex + 1));
    }

    private PDFont selectFont(PDFont latinFont, PDFont cjkFont, String language, String rawJson) {
        String lang = language != null ? language.toLowerCase(Locale.ROOT) : "";
        boolean needsCjk =
                lang.startsWith("ch")
                        || lang.contains("zh")
                        || lang.contains("ja")
                        || lang.contains("ko")
                        || containsCjk(rawJson);
        return needsCjk ? cjkFont : latinFont;
    }

    private static boolean containsCjk(String text) {
        return text != null && CJK_PATTERN.matcher(text).find();
    }

    private static OcrContentRegion regionFromBatch(OcrBatchResultResponse batchResult) {
        return OcrContentRegion.parse(
                batchResult.contentTopRatio(), batchResult.contentBottomRatio());
    }

    private static float cropOffsetY(OcrContentRegion region, int imageHeight) {
        if (region.isFullPage()) {
            return 0f;
        }
        return imageHeight * region.topRatio();
    }

    private void appendInvisibleTextLayer(
            PDDocument document,
            PDPage page,
            PDFont font,
            boolean cjkTextLayer,
            float pageWidth,
            float pageHeight,
            int imageWidth,
            int imageHeight,
            String rawJson,
            OcrContentRegion contentRegion)
            throws IOException {
        JsonNode root = objectMapper.readTree(rawJson);
        JsonNode boxes = root.path("boxes");
        if (!boxes.isArray() || boxes.isEmpty()) {
            return;
        }

        float scaleX = pageWidth / Math.max(imageWidth, 1);
        float scaleY = pageHeight / Math.max(imageHeight, 1);

        List<LayoutBox> layoutBoxes =
                parseLayoutBoxes(boxes, cropOffsetY(contentRegion, imageHeight));
        float contentWidth = inferContentWidth(layoutBoxes);
        PageColumnLayout layout = detectColumnLayout(layoutBoxes, contentWidth);
        List<List<LayoutBox>> lineGroups = groupIntoLines(layoutBoxes, layout);
        sortLineGroupsForReadingOrder(lineGroups, layout);

        try (PDPageContentStream textStream =
                new PDPageContentStream(
                        document, page, PDPageContentStream.AppendMode.APPEND, true, true)) {
            PDExtendedGraphicsState transparentText = new PDExtendedGraphicsState();
            transparentText.setNonStrokingAlphaConstant(0f);
            transparentText.setStrokingAlphaConstant(0f);
            textStream.setGraphicsStateParameters(transparentText);
            textStream.setRenderingMode(RenderingMode.FILL);

            for (List<LayoutBox> lineBoxes : lineGroups) {
                for (int index = 0; index < lineBoxes.size(); index++) {
                    LayoutBox box = lineBoxes.get(index);
                    LayoutBox next = index + 1 < lineBoxes.size() ? lineBoxes.get(index + 1) : null;
                    writeLayoutBox(
                            textStream, font, box, next, scaleX, scaleY, pageHeight, cjkTextLayer);
                }
            }
        }
    }

    /** Place each OCR box independently so PDF selection highlights match scan positions. */
    private static void writeLayoutBox(
            PDPageContentStream textStream,
            PDFont font,
            LayoutBox box,
            LayoutBox next,
            float scaleX,
            float scaleY,
            float pageHeight,
            boolean cjkTextLayer)
            throws IOException {
        if (box.text.isBlank()) {
            return;
        }

        if (cjkTextLayer && shouldSplitIntoChars(box.text)) {
            writeCjkCharSlots(textStream, font, box, next, scaleX, scaleY, pageHeight);
            return;
        }

        writeSingleTextSlot(
                textStream,
                font,
                box.left,
                box.top,
                box.width,
                box.height,
                textForBox(box, next),
                scaleX,
                scaleY,
                pageHeight,
                cjkTextLayer);
    }

    /** Split multi-character CJK OCR boxes so each glyph gets its own selection rectangle. */
    private static void writeCjkCharSlots(
            PDPageContentStream textStream,
            PDFont font,
            LayoutBox box,
            LayoutBox next,
            float scaleX,
            float scaleY,
            float pageHeight)
            throws IOException {
        List<CharSlot> slots = splitIntoCharSlots(box, font);
        for (int index = 0; index < slots.size(); index++) {
            CharSlot slot = slots.get(index);
            String writeText = slot.text();
            if (index == slots.size() - 1 && next != null && needsWordSpace(box, next)) {
                writeText = slot.text() + " ";
            }
            writeSingleTextSlot(
                    textStream,
                    font,
                    slot.left(),
                    slot.top(),
                    slot.width(),
                    slot.height(),
                    writeText,
                    scaleX,
                    scaleY,
                    pageHeight,
                    true);
        }
    }

    static boolean shouldSplitIntoChars(String text) {
        return text != null && text.codePointCount(0, text.length()) > 1 && containsCjk(text);
    }

    static List<CharSlot> splitIntoCharSlots(LayoutBox box) throws IOException {
        return splitIntoCharSlots(box, null);
    }

    static List<CharSlot> splitIntoCharSlots(LayoutBox box, PDFont font) throws IOException {
        if (box.text.isBlank()) {
            return List.of();
        }
        List<String> glyphs = splitGlyphs(box.text);
        if (glyphs.size() <= 1) {
            return List.of(new CharSlot(box.left, box.top, box.width, box.height, box.text));
        }

        float[] weights = new float[glyphs.size()];
        for (int index = 0; index < glyphs.size(); index++) {
            weights[index] = glyphWidthWeight(font, glyphs.get(index));
        }
        return layoutCharSlots(box, glyphs, weights);
    }

    static List<CharSlot> layoutCharSlots(LayoutBox box, List<String> glyphs, float[] weights) {
        if (glyphs.isEmpty()) {
            return List.of();
        }
        if (glyphs.size() == 1) {
            return List.of(new CharSlot(box.left, box.top, box.width, box.height, glyphs.get(0)));
        }

        float totalWeight = 0f;
        for (float weight : weights) {
            totalWeight += Math.max(weight, 0.01f);
        }
        if (totalWeight <= 0f) {
            totalWeight = glyphs.size();
        }

        List<CharSlot> slots = new ArrayList<>(glyphs.size());
        float cursor = box.left;
        for (int index = 0; index < glyphs.size(); index++) {
            float weight = Math.max(weights[index], 0.01f);
            float slotWidth = box.width * weight / totalWeight;
            slots.add(new CharSlot(cursor, box.top, slotWidth, box.height, glyphs.get(index)));
            cursor += slotWidth;
        }
        return slots;
    }

    /**
     * Relative horizontal advance for one glyph (em units). Learned from reference double-layer
     * PDF: Han ≈ 0.94, full-width punctuation ≈ 0.93, half-width punctuation ≈ 0.47.
     */
    static float glyphWidthWeight(PDFont font, String glyph) throws IOException {
        if (glyph == null || glyph.isBlank()) {
            return 0.01f;
        }
        if (font != null) {
            try {
                float emWidth = font.getStringWidth(glyph) / 1000f;
                if (emWidth > 0f) {
                    return Math.max(0.25f, emWidth);
                }
            } catch (IllegalArgumentException | IOException ignored) {
                // Missing glyph — fall through to Unicode heuristics.
            }
        }
        return fallbackGlyphWidthWeight(glyph.codePointAt(0));
    }

    static float fallbackGlyphWidthWeight(int codePoint) {
        if (containsCjk(new String(Character.toChars(codePoint))) || isCjkUnified(codePoint)) {
            return 0.94f;
        }
        if (isFullWidthPunctuation(codePoint)) {
            return 0.93f;
        }
        if (isHalfWidthPunctuation(codePoint)) {
            return 0.47f;
        }
        if (Character.isWhitespace(codePoint)) {
            return 0.35f;
        }
        return 0.55f;
    }

    private static boolean isCjkUnified(int codePoint) {
        Character.UnicodeScript script = Character.UnicodeScript.of(codePoint);
        return script == Character.UnicodeScript.HAN
                || script == Character.UnicodeScript.HIRAGANA
                || script == Character.UnicodeScript.KATAKANA
                || script == Character.UnicodeScript.HANGUL;
    }

    private static boolean isFullWidthPunctuation(int codePoint) {
        return codePoint >= 0x3000 && codePoint <= 0x303F
                || codePoint >= 0xFF01 && codePoint <= 0xFF0F
                || codePoint >= 0xFF1A && codePoint <= 0xFF20
                || codePoint >= 0xFF3B && codePoint <= 0xFF40
                || codePoint >= 0xFF5B && codePoint <= 0xFF65;
    }

    private static boolean isHalfWidthPunctuation(int codePoint) {
        return switch (codePoint) {
            case ',', '.', ';', ':', '!', '?', '(', ')', '[', ']', '-', '"', '\'', '…' -> true;
            default ->
                    codePoint <= 0x007F
                            && !Character.isLetterOrDigit(codePoint)
                            && !Character.isWhitespace(codePoint);
        };
    }

    private static List<String> splitGlyphs(String text) {
        List<String> glyphs = new ArrayList<>();
        for (int offset = 0; offset < text.length(); ) {
            int codePoint = text.codePointAt(offset);
            glyphs.add(new String(Character.toChars(codePoint)));
            offset += Character.charCount(codePoint);
        }
        return glyphs;
    }

    private static void writeSingleTextSlot(
            PDPageContentStream textStream,
            PDFont font,
            float left,
            float top,
            float width,
            float height,
            String writeText,
            float scaleX,
            float scaleY,
            float pageHeight,
            boolean cjkTextLayer)
            throws IOException {
        if (writeText.isBlank()) {
            return;
        }

        float boxLeft = left * scaleX;
        float boxTopPdf = pageHeight - top * scaleY;
        float boxBottomPdf = pageHeight - (top + height) * scaleY;
        float boxWidthPdf = width * scaleX;
        float boxHeightPdf = boxTopPdf - boxBottomPdf;

        if (boxWidthPdf <= 0 || boxHeightPdf <= 0) {
            return;
        }

        float fontSize =
                fitFontSize(font, writeText.strip(), boxWidthPdf, boxHeightPdf, cjkTextLayer);
        float baselineY = baselineInBox(font, fontSize, boxBottomPdf, cjkTextLayer);
        writeTextInBox(textStream, font, writeText, boxLeft, baselineY, fontSize);
    }

    static void sortLineGroupsForReadingOrder(
            List<List<LayoutBox>> lineGroups, PageColumnLayout layout) {
        Comparator<List<LayoutBox>> comparator =
                Comparator.<List<LayoutBox>>comparingDouble(group -> group.get(0).top())
                        .thenComparingDouble(group -> group.get(0).left);
        if (layout.columnCount() > 1) {
            comparator =
                    Comparator.<List<LayoutBox>>comparingInt(
                                    group -> {
                                        LayoutBox first = group.get(0);
                                        return layout.columnOf(first.left, first.right());
                                    })
                            .thenComparingDouble(group -> group.get(0).top())
                            .thenComparingDouble(group -> group.get(0).left);
        }
        lineGroups.sort(comparator);
    }

    /** Per-box text plus trailing space when the next box starts a new Latin word. */
    private static String textForBox(LayoutBox box, LayoutBox next) {
        if (next != null && needsWordSpace(box, next)) {
            return box.text + " ";
        }
        return box.text;
    }

    private static List<LayoutBox> parseLayoutBoxes(JsonNode boxes) {
        return parseLayoutBoxes(boxes, 0f);
    }

    private static List<LayoutBox> parseLayoutBoxes(JsonNode boxes, float yOffset) {
        List<LayoutBox> layoutBoxes = new ArrayList<>();
        for (JsonNode box : boxes) {
            String text = normalizeOcrText(textOrEmpty(box.path("text")));
            if (text.isBlank()) {
                continue;
            }
            layoutBoxes.add(
                    new LayoutBox(
                            (float) box.path("x").asDouble(0),
                            (float) box.path("y").asDouble(0) + yOffset,
                            (float) box.path("w").asDouble(0),
                            (float) box.path("h").asDouble(0),
                            text));
        }
        return layoutBoxes;
    }

    /** Merge OCR boxes into reading-order lines with word spaces for copy/search quality. */
    static List<TextLine> buildTextLines(List<LayoutBox> boxes) {
        return buildTextLines(boxes, inferContentWidth(boxes));
    }

    static List<TextLine> buildTextLines(List<LayoutBox> boxes, float contentWidth) {
        if (boxes.isEmpty()) {
            return List.of();
        }

        PageColumnLayout layout = detectColumnLayout(boxes, contentWidth);
        List<List<LayoutBox>> lineGroups = groupIntoLines(boxes, layout);
        List<TextLine> textLines = new ArrayList<>();

        for (List<LayoutBox> lineBoxes : lineGroups) {
            String joined = joinLineText(lineBoxes);
            if (joined.isBlank()) {
                continue;
            }
            textLines.add(TextLine.fromBoxes(lineBoxes, joined));
        }

        if (layout.columnCount() > 1) {
            textLines.sort(columnThenVerticalOrder(layout));
        }

        return textLines;
    }

    private static float inferContentWidth(List<LayoutBox> boxes) {
        return boxes.stream().map(LayoutBox::right).max(Float::compare).orElse(1f);
    }

    private static PageColumnLayout detectColumnLayout(List<LayoutBox> boxes, float contentWidth) {
        float minLineWidth = Math.max(80f, contentWidth * 0.08f);
        float minFragment = Math.max(40f, contentWidth * 0.04f);
        List<float[]> lineSpans = new ArrayList<>(boxes.size());
        for (LayoutBox box : boxes) {
            if (box.width >= minLineWidth || box.width >= minFragment) {
                lineSpans.add(new float[] {box.left, 0f, box.right(), 0f});
            }
        }
        return PageColumnLayout.fromLineBoxes(lineSpans, contentWidth, minLineWidth, 3);
    }

    private static Comparator<TextLine> columnThenVerticalOrder(PageColumnLayout layout) {
        return Comparator.comparingInt(
                        (TextLine line) -> layout.columnOf(line.left, line.left + line.width))
                .thenComparingDouble(TextLine::top)
                .thenComparingDouble(TextLine::left);
    }

    static List<List<LayoutBox>> groupIntoLines(List<LayoutBox> boxes) {
        return groupIntoLines(boxes, singleColumnLayout(inferContentWidth(boxes)));
    }

    static List<List<LayoutBox>> groupIntoLines(List<LayoutBox> boxes, PageColumnLayout layout) {
        if (boxes.isEmpty()) {
            return List.of();
        }

        List<LayoutBox> sorted =
                boxes.stream()
                        .sorted(
                                Comparator.comparing(LayoutBox::centerY)
                                        .thenComparing(LayoutBox::left))
                        .toList();

        List<List<LayoutBox>> lineGroups = new ArrayList<>();
        List<LayoutBox> currentLine = new ArrayList<>();
        LayoutBox previous = null;

        for (LayoutBox box : sorted) {
            if (previous != null && !sameLineGroup(previous, box, layout)) {
                lineGroups.add(finishLine(currentLine));
                currentLine = new ArrayList<>();
            }
            currentLine.add(box);
            previous = box;
        }
        if (!currentLine.isEmpty()) {
            lineGroups.add(finishLine(currentLine));
        }
        return lineGroups;
    }

    private static PageColumnLayout singleColumnLayout(float contentWidth) {
        return PageColumnLayout.fromLineBoxes(List.of(), contentWidth);
    }

    private static boolean sameLineGroup(LayoutBox left, LayoutBox right, PageColumnLayout layout) {
        if (!sameLine(left, right)) {
            return false;
        }
        if (layout.columnCount() <= 1) {
            return true;
        }
        return layout.columnOf(left.left, left.right())
                == layout.columnOf(right.left, right.right());
    }

    private static List<LayoutBox> finishLine(List<LayoutBox> line) {
        return line.stream().sorted(Comparator.comparing(LayoutBox::left)).toList();
    }

    private static boolean sameLine(LayoutBox left, LayoutBox right) {
        float lineHeight = Math.min(left.height, right.height);
        float tolerance = Math.max(lineHeight * LINE_Y_TOLERANCE_FACTOR, 1f);
        return Math.abs(left.centerY() - right.centerY()) <= tolerance;
    }

    private static String joinLineText(List<LayoutBox> lineBoxes) {
        StringBuilder joined = new StringBuilder();

        for (int index = 0; index < lineBoxes.size(); index++) {
            LayoutBox box = lineBoxes.get(index);
            LayoutBox next = index + 1 < lineBoxes.size() ? lineBoxes.get(index + 1) : null;
            joined.append(textForBox(box, next));
        }

        return joined.toString().strip();
    }

    /**
     * Decide whether a space belongs between two same-line OCR boxes. Latin boxes that touch or
     * overlap still get a space so copy/paste preserves word boundaries.
     */
    static boolean needsWordSpace(LayoutBox previous, LayoutBox next) {
        if (previous == null || next == null) {
            return false;
        }

        String prevText = previous.text;
        String nextText = next.text;
        if (prevText.isBlank() || nextText.isBlank()) {
            return false;
        }
        if (endsWithWhitespace(prevText) || startsWithWhitespace(nextText)) {
            return false;
        }

        char prevLast = lastMeaningfulChar(prevText);
        char nextFirst = firstMeaningfulChar(nextText);
        if (prevLast == 0 || nextFirst == 0) {
            return false;
        }

        // Hyphenation / apostrophe continuations: "10-person", "who've"
        if (prevLast == '-'
                || nextFirst == '-'
                || prevLast == '\''
                || nextFirst == '\''
                || prevLast == '\u2019'
                || nextFirst == '\u2019') {
            return false;
        }

        // Punctuation attaches to the following token without a leading space.
        if (nextFirst == ','
                || nextFirst == '.'
                || nextFirst == ';'
                || nextFirst == ':'
                || nextFirst == '!'
                || nextFirst == '?'
                || nextFirst == ')'
                || nextFirst == ']'
                || nextFirst == '%') {
            return false;
        }

        if (prevLast == '(' || prevLast == '[') {
            return false;
        }

        if ((prevLast == ','
                        || prevLast == '.'
                        || prevLast == ';'
                        || prevLast == ':'
                        || prevLast == '!'
                        || prevLast == '?')
                && isLatinWordChar(nextFirst)) {
            return true;
        }

        if (containsCjk(prevText) || containsCjk(nextText)) {
            float gap = next.left - previous.right();
            return gap > Math.max(1f, Math.min(previous.height, next.height) * 0.15f);
        }

        if (isLatinWordChar(prevLast) && isLatinWordChar(nextFirst)) {
            return true;
        }

        float gap = next.left - previous.right();
        return gap > Math.max(1f, Math.min(previous.height, next.height) * 0.10f);
    }

    private static boolean isLatinWordChar(char value) {
        return LATIN_WORD_CHAR.matcher(String.valueOf(value)).matches();
    }

    private static char lastMeaningfulChar(String value) {
        for (int index = value.length() - 1; index >= 0; index--) {
            char character = value.charAt(index);
            if (!Character.isWhitespace(character)) {
                return character;
            }
        }
        return 0;
    }

    private static char firstMeaningfulChar(String value) {
        for (int index = 0; index < value.length(); index++) {
            char character = value.charAt(index);
            if (!Character.isWhitespace(character)) {
                return character;
            }
        }
        return 0;
    }

    /** NFKC normalizes compatibility ligatures (e.g. ﬁ → fi) for cleaner copy/paste. */
    static String normalizeOcrText(String text) {
        if (text == null || text.isBlank()) {
            return "";
        }
        return Normalizer.normalize(text, Normalizer.Form.NFKC).strip();
    }

    private static boolean endsWithWhitespace(CharSequence value) {
        return !value.isEmpty() && Character.isWhitespace(value.charAt(value.length() - 1));
    }

    private static boolean startsWithWhitespace(String value) {
        return !value.isEmpty() && Character.isWhitespace(value.charAt(0));
    }

    record LayoutBox(float left, float top, float width, float height, String text) {
        float right() {
            return left + width;
        }

        float bottom() {
            return top + height;
        }

        float centerY() {
            return top + height / 2f;
        }
    }

    /** One glyph slot derived from a multi-character OCR box. */
    record CharSlot(float left, float top, float width, float height, String text) {}

    record TextLine(String text, float left, float top, float width, float bottom) {
        static TextLine fromBoxes(List<LayoutBox> boxes, String text) {
            float left = boxes.stream().map(LayoutBox::left).min(Float::compare).orElse(0f);
            float top = boxes.stream().map(LayoutBox::top).min(Float::compare).orElse(0f);
            float right = boxes.stream().map(LayoutBox::right).max(Float::compare).orElse(0f);
            float bottom = boxes.stream().map(LayoutBox::bottom).max(Float::compare).orElse(0f);
            return new TextLine(text, left, top, right - left, bottom);
        }
    }

    private static float fitFontSize(
            PDFont font, String text, float boxWidthPdf, float boxHeightPdf, boolean cjkTextLayer)
            throws IOException {
        float heightRatio = cjkTextLayer ? CJK_FONT_HEIGHT_RATIO : LATIN_FONT_HEIGHT_RATIO;
        float fromHeight = Math.max(MIN_FONT_SIZE, boxHeightPdf * heightRatio);
        if (cjkTextLayer) {
            // Pro double-layer PDFs size CJK to box height; width follows per-glyph advance.
            return fromHeight;
        }
        float textWidthPerEm = font.getStringWidth(text) / 1000f;
        if (textWidthPerEm <= 0) {
            return fromHeight;
        }
        float fromWidth = boxWidthPdf / textWidthPerEm;
        return Math.max(MIN_FONT_SIZE, Math.min(fromHeight, fromWidth));
    }

    private static float baselineInBox(
            PDFont font, float fontSize, float boxBottomPdf, boolean cjkTextLayer) {
        PDFontDescriptor descriptor = font.getFontDescriptor();
        if (descriptor != null) {
            float descent = Math.abs(descriptor.getDescent() / 1000f * fontSize);
            return boxBottomPdf + descent;
        }
        float fraction = cjkTextLayer ? CJK_BASELINE_FROM_BOTTOM : LATIN_BASELINE_FROM_BOTTOM;
        return boxBottomPdf + fontSize * fraction;
    }

    private static void writeTextInBox(
            PDPageContentStream textStream,
            PDFont font,
            String text,
            float boxLeft,
            float baselineY,
            float fontSize)
            throws IOException {
        textStream.beginText();
        textStream.setFont(font, fontSize);
        // Do not horizontally scale — scaling breaks word selection in many PDF viewers.
        textStream.newLineAtOffset(boxLeft, baselineY);
        textStream.showText(text);
        textStream.endText();
    }

    private static String textOrEmpty(JsonNode node) {
        if (node.isMissingNode() || node.isNull()) {
            return "";
        }
        String value = node.asString("");
        return value != null ? value : "";
    }
}

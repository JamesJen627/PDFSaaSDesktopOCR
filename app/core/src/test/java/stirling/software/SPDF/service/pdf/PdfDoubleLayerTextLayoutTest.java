package stirling.software.SPDF.service.pdf;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

class PdfDoubleLayerTextLayoutTest {

    @Test
    void joinLineTextInsertsSpacesBetweenAdjacentBoxes() {
        List<PdfDoubleLayerService.LayoutBox> line =
                List.of(
                        new PdfDoubleLayerService.LayoutBox(10, 100, 40, 20, "In"),
                        new PdfDoubleLayerService.LayoutBox(60, 100, 50, 20, "2026,"),
                        new PdfDoubleLayerService.LayoutBox(120, 100, 30, 20, "AI"),
                        new PdfDoubleLayerService.LayoutBox(160, 100, 80, 20, "can"));

        List<PdfDoubleLayerService.TextLine> lines = PdfDoubleLayerService.buildTextLines(line);

        assertEquals(1, lines.size());
        assertEquals("In 2026, AI can", lines.get(0).text());
    }

    @Test
    void joinLineTextInsertsSpacesWhenBoxesOverlap() {
        List<PdfDoubleLayerService.LayoutBox> line =
                List.of(
                        new PdfDoubleLayerService.LayoutBox(100, 200, 30, 18, "are"),
                        new PdfDoubleLayerService.LayoutBox(125, 200, 40, 18, "built"),
                        new PdfDoubleLayerService.LayoutBox(180, 200, 35, 18, "the"),
                        new PdfDoubleLayerService.LayoutBox(205, 200, 35, 18, "lean"));

        assertEquals(
                "are built the lean", PdfDoubleLayerService.buildTextLines(line).get(0).text());
    }

    @Test
    void needsWordSpaceSkipsHyphenatedTokens() {
        var tenPerson = new PdfDoubleLayerService.LayoutBox(100, 200, 25, 18, "10");
        var hyphenPerson = new PdfDoubleLayerService.LayoutBox(120, 200, 60, 18, "-person");
        var unicorn = new PdfDoubleLayerService.LayoutBox(175, 200, 55, 18, "unicorn");

        assertEquals(false, PdfDoubleLayerService.needsWordSpace(tenPerson, hyphenPerson));
        assertEquals(true, PdfDoubleLayerService.needsWordSpace(hyphenPerson, unicorn));
    }

    @Test
    void normalizeOcrTextExpandsCompatibilityLigatures() {
        assertEquals("workflows", PdfDoubleLayerService.normalizeOcrText("work\uFB02ows"));
        assertEquals("playingfield", PdfDoubleLayerService.normalizeOcrText("playing\uFB01eld"));
    }

    @Test
    void splitIntoCharSlotsDividesCjkBoxEvenly() throws IOException {
        var box = new PdfDoubleLayerService.LayoutBox(100, 200, 300, 24, "给青年");

        List<PdfDoubleLayerService.CharSlot> slots = PdfDoubleLayerService.splitIntoCharSlots(box);

        assertEquals(3, slots.size());
        assertEquals("给", slots.get(0).text());
        assertEquals(100f, slots.get(0).left(), 0.01f);
        assertEquals(100f, slots.get(0).width(), 1f);
        assertEquals("青", slots.get(1).text());
        assertEquals(200f, slots.get(1).left(), 0.01f);
        assertEquals("年", slots.get(2).text());
        assertEquals(300f, slots.get(2).left(), 0.01f);
    }

    @Test
    void layoutCharSlotsAssignsNarrowerWidthToPunctuation() {
        var box = new PdfDoubleLayerService.LayoutBox(0, 0, 243, 20, "你，好");
        List<PdfDoubleLayerService.CharSlot> slots =
                PdfDoubleLayerService.layoutCharSlots(
                        box, List.of("你", "，", "好"), new float[] {0.94f, 0.55f, 0.94f});

        assertEquals(3, slots.size());
        assertTrue(slots.get(1).width() < slots.get(0).width());
        assertEquals(0f, slots.get(0).left(), 0.01f);
        float total = 0.94f + 0.55f + 0.94f;
        assertEquals(243f * 0.55f / total, slots.get(1).width(), 0.5f);
    }

    @Test
    void fallbackGlyphWidthWeightTreatsHalfWidthPunctuationAsNarrow() {
        assertEquals(0.47f, PdfDoubleLayerService.fallbackGlyphWidthWeight(','));
        assertEquals(0.93f, PdfDoubleLayerService.fallbackGlyphWidthWeight('\uFF0C'));
        assertEquals(0.94f, PdfDoubleLayerService.fallbackGlyphWidthWeight('\u4F60'));
    }

    @Test
    void splitIntoCharSlotsKeepsSingleGlyphBox() throws IOException {
        var box = new PdfDoubleLayerService.LayoutBox(50, 100, 40, 20, "信");

        List<PdfDoubleLayerService.CharSlot> slots = PdfDoubleLayerService.splitIntoCharSlots(box);

        assertEquals(1, slots.size());
        assertEquals(box.left(), slots.get(0).left());
        assertEquals(box.width(), slots.get(0).width());
    }

    @Test
    void shouldSplitIntoCharsOnlyForMultiGlyphCjk() {
        assertTrue(PdfDoubleLayerService.shouldSplitIntoChars("建筑与"));
        assertEquals(false, PdfDoubleLayerService.shouldSplitIntoChars("A"));
        assertEquals(false, PdfDoubleLayerService.shouldSplitIntoChars("hello"));
    }

    @Test
    void buildTextLinesOrdersTwoColumnsLeftThenRight() {
        float pageWidth = 1000f;
        List<PdfDoubleLayerService.LayoutBox> boxes =
                List.of(
                        new PdfDoubleLayerService.LayoutBox(50, 100, 300, 20, "左一"),
                        new PdfDoubleLayerService.LayoutBox(50, 200, 300, 20, "左二"),
                        new PdfDoubleLayerService.LayoutBox(50, 300, 300, 20, "左三"),
                        new PdfDoubleLayerService.LayoutBox(600, 100, 300, 20, "右一"),
                        new PdfDoubleLayerService.LayoutBox(600, 200, 300, 20, "右二"),
                        new PdfDoubleLayerService.LayoutBox(600, 300, 300, 20, "右三"));

        List<PdfDoubleLayerService.TextLine> lines =
                PdfDoubleLayerService.buildTextLines(boxes, pageWidth);

        assertEquals(6, lines.size());
        assertEquals("左一", lines.get(0).text());
        assertEquals("左二", lines.get(1).text());
        assertEquals("左三", lines.get(2).text());
        assertEquals("右一", lines.get(3).text());
        assertEquals("右二", lines.get(4).text());
        assertEquals("右三", lines.get(5).text());
    }

    @Test
    void buildTextLinesGroupsByVerticalPosition() {
        List<PdfDoubleLayerService.LayoutBox> boxes =
                List.of(
                        new PdfDoubleLayerService.LayoutBox(10, 50, 100, 20, "Line"),
                        new PdfDoubleLayerService.LayoutBox(120, 50, 60, 20, "one"),
                        new PdfDoubleLayerService.LayoutBox(10, 100, 100, 20, "Line"),
                        new PdfDoubleLayerService.LayoutBox(120, 100, 60, 20, "two"));

        List<PdfDoubleLayerService.TextLine> lines = PdfDoubleLayerService.buildTextLines(boxes);

        assertEquals(2, lines.size());
        assertEquals("Line one", lines.get(0).text());
        assertEquals("Line two", lines.get(1).text());
        assertTrue(lines.get(0).top() < lines.get(1).top());
    }

    @Test
    void sortLineGroupsOrdersTwoColumnsLeftThenRight() {
        var layout =
                stirling.software.SPDF.pdf.parser.PageColumnLayout.fromLineBoxes(
                        List.of(
                                new float[] {50, 0, 350, 0},
                                new float[] {50, 0, 350, 0},
                                new float[] {600, 0, 900, 0},
                                new float[] {600, 0, 900, 0}),
                        1000f,
                        80f,
                        2);

        List<List<PdfDoubleLayerService.LayoutBox>> groups =
                new ArrayList<>(
                        List.of(
                                List.of(
                                        new PdfDoubleLayerService.LayoutBox(
                                                600, 100, 300, 20, "右一")),
                                List.of(
                                        new PdfDoubleLayerService.LayoutBox(
                                                50, 100, 300, 20, "左一")),
                                List.of(
                                        new PdfDoubleLayerService.LayoutBox(
                                                50, 200, 300, 20, "左二"))));

        PdfDoubleLayerService.sortLineGroupsForReadingOrder(groups, layout);

        assertEquals("左一", groups.get(0).get(0).text());
        assertEquals("左二", groups.get(1).get(0).text());
        assertEquals("右一", groups.get(2).get(0).text());
    }
}

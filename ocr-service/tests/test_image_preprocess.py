from __future__ import annotations

from PIL import Image

from pdfsaas_ocr.config.settings import ScanPreprocessStrength
from pdfsaas_ocr.services.image_preprocess import (
    is_cjk_lang,
    preprocess_scan_image,
    remove_highlight_overlay,
)


def test_is_cjk_lang() -> None:
    assert is_cjk_lang("ch") is True
    assert is_cjk_lang("ch+en") is True
    assert is_cjk_lang("en") is False


def test_preprocess_scan_image_preserves_size() -> None:
    image = Image.new("RGB", (120, 80), color=(240, 240, 240))
    for strength in ScanPreprocessStrength:
        result = preprocess_scan_image(image, strength=strength)
        assert result.size == image.size
        assert result.mode == "RGB"


def test_aggressive_preprocess_reduces_salt_pepper() -> None:
    import random

    random.seed(0)
    image = Image.new("L", (160, 120), color=255)
    pixels = image.load()
    assert pixels is not None
    for _ in range(400):
        x = random.randint(0, image.width - 1)
        y = random.randint(0, image.height - 1)
        pixels[x, y] = 0

    rgb = image.convert("RGB")
    light = preprocess_scan_image(rgb, strength=ScanPreprocessStrength.LIGHT)
    aggressive = preprocess_scan_image(rgb, strength=ScanPreprocessStrength.AGGRESSIVE)

    def dark_pixels(img: Image.Image) -> int:
        gray = img.convert("L")
        data = list(gray.getdata())
        return sum(1 for value in data if value < 128)

    assert dark_pixels(aggressive) <= dark_pixels(light)


def test_remove_highlight_overlay_recovers_dark_strokes() -> None:
    from PIL import ImageDraw

    image = Image.new("RGB", (200, 80), color=(255, 255, 255))
    draw = ImageDraw.Draw(image)
    for y in (20, 40, 60):
        draw.line((20, y, 180, y), fill=(0, 0, 0), width=2)

    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    overlay_draw = ImageDraw.Draw(overlay)
    overlay_draw.rectangle((10, 30, 190, 70), fill=(120, 160, 255, 140))
    highlighted = Image.alpha_composite(image.convert("RGBA"), overlay).convert("RGB")

    def stroke_score(img: Image.Image) -> int:
        gray = img.convert("L")
        count = 0
        for y in (20, 40, 60):
            for x in range(20, 180):
                if gray.getpixel((x, y)) < 80:
                    count += 1
        return count

    before = stroke_score(highlighted)
    restored = remove_highlight_overlay(highlighted)
    after = stroke_score(restored)

    assert before < 30
    assert after > before
    assert after >= 120

from __future__ import annotations

from pdfsaas_ocr.config.settings import ScanPreprocessStrength
from PIL import Image, ImageEnhance, ImageFilter


def is_cjk_lang(lang: str) -> bool:
    normalized = lang.strip().lower()
    return normalized in {"ch", "zh", "zh-cn", "zh-tw", "ch+en", "ch_en"}


def normalize_scan_strength(value: str | ScanPreprocessStrength) -> ScanPreprocessStrength:
    if isinstance(value, ScanPreprocessStrength):
        return value
    normalized = value.strip().lower()
    for strength in ScanPreprocessStrength:
        if strength.value == normalized:
            return strength
    return ScanPreprocessStrength.NORMAL


def preprocess_scan_image(
    image: Image.Image,
    *,
    strength: ScanPreprocessStrength | str = ScanPreprocessStrength.NORMAL,
    remove_highlights: bool = True,
) -> Image.Image:
    """Denoise + contrast boost tuned for scanned pages before OCR."""
    level = normalize_scan_strength(strength)
    working = remove_highlight_overlay(image) if remove_highlights else image
    try:
        import cv2
        import numpy as np

        return _preprocess_with_cv2(working, cv2, np, level)
    except ImportError:
        return _preprocess_with_pil(working, level)


def remove_highlight_overlay(image: Image.Image) -> Image.Image:
    """Recover dark text strokes obscured by colored highlighter overlays."""
    try:
        import cv2
        import numpy as np

        return _remove_highlights_cv2(image, cv2, np)
    except ImportError:
        return _remove_highlights_pil(image)


def _remove_highlights_cv2(image: Image.Image, cv2: object, np: object) -> Image.Image:
    rgb = np.array(image.convert("RGB"))
    hsv = cv2.cvtColor(rgb, cv2.COLOR_RGB2HSV)

    blue = cv2.inRange(hsv, (85, 35, 40), (135, 255, 255))
    yellow = cv2.inRange(hsv, (12, 35, 40), (48, 255, 255))
    green = cv2.inRange(hsv, (42, 35, 40), (88, 255, 255))
    pink = cv2.inRange(hsv, (128, 35, 40), (175, 255, 255))
    highlight = cv2.bitwise_or(cv2.bitwise_or(blue, yellow), cv2.bitwise_or(green, pink))

    if int(np.count_nonzero(highlight)) == 0:
        return image

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    highlight = cv2.dilate(highlight, kernel, iterations=1)

    red, green_ch, blue_ch = cv2.split(rgb)
    text_like = cv2.min(cv2.min(red, green_ch), blue_ch)
    mask = highlight > 0
    restored = rgb.copy()
    for channel in (restored[:, :, 0], restored[:, :, 1], restored[:, :, 2]):
        channel[mask] = text_like[mask]

    return Image.fromarray(restored)


def _remove_highlights_pil(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    pixels = rgb.load()
    if pixels is None:
        return rgb

    width, height = rgb.size
    for y in range(height):
        for x in range(width):
            r, g, b = pixels[x, y]
            max_c = max(r, g, b)
            min_c = min(r, g, b)
            if max_c - min_c < 25 or max_c < 80:
                continue
            dominant = max_c - min_c
            is_blue = b == max_c and b > r + 15 and b > g + 10
            is_yellow = r > 160 and g > 140 and b < min(r, g) - 10
            is_green = g == max_c and g > r + 15 and g > b + 10
            is_pink = r == max_c and b > g + 10 and dominant > 30
            if is_blue or is_yellow or is_green or is_pink:
                gray = min_c
                pixels[x, y] = (gray, gray, gray)
    return rgb


def _preprocess_with_cv2(
    image: Image.Image,
    cv2: object,
    np: object,
    strength: ScanPreprocessStrength,
) -> Image.Image:
    rgb = np.array(image.convert("RGB"))
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    if strength is not ScanPreprocessStrength.LIGHT:
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (2, 2))
        l_channel = cv2.morphologyEx(l_channel, cv2.MORPH_OPEN, kernel)
        l_channel = cv2.medianBlur(l_channel, 3)

    if strength is ScanPreprocessStrength.AGGRESSIVE:
        l_channel = cv2.bilateralFilter(l_channel, 5, 60, 60)
        clip_limit = 3.0
        tile_size = (8, 8)
    elif strength is ScanPreprocessStrength.NORMAL:
        clip_limit = 2.0
        tile_size = (8, 8)
    else:
        clip_limit = 1.5
        tile_size = (12, 12)

    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_size)
    l_channel = clahe.apply(l_channel)
    merged = cv2.merge((l_channel, a_channel, b_channel))
    enhanced = cv2.cvtColor(merged, cv2.COLOR_LAB2RGB)
    return Image.fromarray(enhanced)


def _preprocess_with_pil(image: Image.Image, strength: ScanPreprocessStrength) -> Image.Image:
    gray = image.convert("L")
    if strength is not ScanPreprocessStrength.LIGHT:
        gray = gray.filter(ImageFilter.MedianFilter(size=3))
    contrast = 1.2 if strength is ScanPreprocessStrength.LIGHT else 1.35
    if strength is ScanPreprocessStrength.AGGRESSIVE:
        contrast = 1.5
        gray = gray.filter(ImageFilter.ModeFilter(size=3))
    gray = ImageEnhance.Contrast(gray).enhance(contrast)
    return gray.convert("RGB")

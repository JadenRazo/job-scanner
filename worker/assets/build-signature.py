#!/usr/bin/env python3
"""Pre-render the signature PNG at image-build time.

Renders "Jaden S. Razo" in URW Chancery L Medium Italic (Z003) onto a
transparent RGBA canvas sized to the glyph bounding box plus padding.
"""
from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/opentype/urw-base35/Z003-MediumItalic.otf"
TEXT = "Jaden S. Razo"
FONT_SIZE = 80
PADDING = 60
COLOR = (27, 42, 74, 255)
OUTPUT = "/app/assets/signature.png"


def main() -> None:
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    # getbbox returns (x0, y0, x1, y1) relative to baseline origin.
    bbox = font.getbbox(TEXT)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]

    canvas_w = text_w + PADDING * 2
    canvas_h = text_h + PADDING * 2

    img = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    # Offset so the glyph bbox sits inside the padded area.
    draw.text((PADDING - bbox[0], PADDING - bbox[1]), TEXT, font=font, fill=COLOR)
    img.save(OUTPUT, "PNG")
    print(f"wrote {OUTPUT} ({canvas_w}x{canvas_h})")


if __name__ == "__main__":
    main()

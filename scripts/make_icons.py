#!/usr/bin/env python3
"""Raster icon set from the WC26 favicon SVG if cairosvg is available; fallback to Pillow drawing."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")
SVG = os.path.join(PUBLIC, "favicon.svg")

sizes = [32, 180, 192, 512]

def draw_icon(size):
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    def s(v): return int(v * size / 64)
    d.rounded_rectangle([0, 0, size-1, size-1], radius=s(16), fill=(7,20,18,255))
    d.rounded_rectangle([s(4), s(4), s(60), s(60)], radius=s(14), fill=(15,118,110,255))
    # top highlight
    d.rounded_rectangle([s(4), s(4), s(60), s(28)], radius=s(14), fill=(95,208,197,215))
    d.pieslice([s(18), s(17), s(46), s(45)], 0, 360, fill=(239,255,251,255))
    star = [(32,18.4),(36.5,26.6),(45.7,28.3),(39.3,35.1),(40.5,44.4),(32,40.4),(23.5,44.4),(24.7,35.1),(18.3,28.3),(27.5,26.6)]
    d.polygon([(s(x), s(y)) for x,y in star], fill=(7,84,78,255))
    d.arc([s(11), s(26), s(53), s(66)], 202, 338, fill=(232,255,248,235), width=max(2, s(3)))
    return im

for size in sizes:
    out = os.path.join(PUBLIC, "apple-touch-icon.png" if size == 180 else f"icon-{size}.png")
    draw_icon(size).save(out, "PNG")
    print("OK", out)

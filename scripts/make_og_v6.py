#!/usr/bin/env python3
"""Build OG v6: festive World Cup 2026 background + broadcast Vietnamese overlay.
Lighter left scrim than v5 to keep the celebratory mood; no timezone subline."""
import os
from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "cf_flux_v6_raw.png")
OUT = os.path.join(ROOT, "public", "og-v6.jpg")

W, H = 1200, 630
ACCENT = (95, 208, 197)    # frost teal
ACCENT2 = (41, 151, 140)
WHITE = (246, 250, 249)
MUTED = (200, 214, 211)
NAVY = (4, 12, 15)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def font(size, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

def cover(src, size=(W, H), y_bias=0.32):
    sw, sh = src.size
    scale = max(size[0] / sw, size[1] / sh)
    nw, nh = round(sw * scale), round(sh * scale)
    src = src.resize((nw, nh), Image.LANCZOS)
    left = (nw - size[0]) // 2
    top = round((nh - size[1]) * y_bias)
    return src.crop((left, top, left + size[0], top + size[1]))

def rounded_rect(draw, xy, radius, fill, outline=None, width=1):
    draw.rounded_rectangle(xy, radius=radius, fill=fill, outline=outline, width=width)

def text_shadow(draw, xy, text, fnt, fill, shadow=(0, 0, 0), off=3):
    x, y = xy
    draw.text((x + off, y + off), text, font=fnt, fill=shadow)
    draw.text((x, y), text, font=fnt, fill=fill)

img = cover(Image.open(SRC).convert("RGB"))

# left scrim: lighter than v5 (cap 196 vs 232, narrower falloff) so the festive
# stadium stays bright while the title area keeps enough contrast.
grad = Image.new("L", (W, 1), 0)
for x in range(W):
    t = max(0.0, 1.0 - x / (W * 0.60))
    grad.putpixel((x, 0), int(196 * (t ** 1.05)))
grad = grad.resize((W, H))
img = Image.composite(Image.new("RGB", (W, H), NAVY), img, grad)

# soft bottom vignette for the domain pill legibility
bot = Image.new("L", (1, H), 0)
for y in range(H):
    t = max(0.0, (y - H * 0.74) / (H * 0.26))
    bot.putpixel((0, y), int(120 * t))
bot = bot.resize((W, H))
img = Image.composite(Image.new("RGB", (W, H), (2, 8, 10)), img, bot)

d = ImageDraw.Draw(img)
PAD = 70

# logo mark
logo_x, logo_y = PAD, 78
rounded_rect(d, [logo_x, logo_y, logo_x + 56, logo_y + 56], 14, ACCENT2)
d.ellipse([logo_x + 14, logo_y + 13, logo_x + 42, logo_y + 41], fill=WHITE)
star = [(32,18.4),(36.5,26.6),(45.7,28.3),(39.3,35.1),(40.5,44.4),(32,40.4),(23.5,44.4),(24.7,35.1),(18.3,28.3),(27.5,26.6)]
star = [(logo_x + (x * 56 / 64), logo_y + (y * 56 / 64)) for x, y in star]
d.polygon(star, fill=(6, 78, 72))

# kicker (single line — no timezone subline)
d.text((logo_x + 72, logo_y + 14), "WC26 · MEOWBITER", font=font(26, True), fill=ACCENT)

# title block
title_font = font(78, True)
text_shadow(d, (PAD, 190), "Lịch thi đấu", title_font, WHITE, off=3)
text_shadow(d, (PAD, 276), "World Cup 2026", title_font, WHITE, off=3)

# subtitle
subtitle = "104 trận · 48 đội · 12 bảng · sơ đồ knockout"
text_shadow(d, (PAD, 378), subtitle, font(30, False), MUTED, off=2)

# stat chips
chips = [("104", "trận"), ("48", "đội"), ("12", "bảng"), ("16", "sân")]
cx, cy = PAD, 462
for num, label in chips:
    box_w = 116
    rounded_rect(d, [cx, cy, cx + box_w, cy + 72], 16, (8, 30, 33), outline=ACCENT2, width=2)
    d.text((cx + 18, cy + 11), num, font=font(31, True), fill=WHITE)
    d.text((cx + 20, cy + 43), label.upper(), font=font(15, True), fill=ACCENT)
    cx += box_w + 14

# domain pill
url = "worldcup.meowbiter.me"
uf = font(24, True)
tw = d.textlength(url, font=uf)
ux, uy = W - PAD - tw - 30, H - 74
rounded_rect(d, [ux, uy, W - PAD, uy + 44], 22, (4, 16, 18), outline=ACCENT, width=1)
d.text((ux + 15, uy + 8), url, font=uf, fill=ACCENT)

img.save(OUT, "JPEG", quality=90, optimize=True)
print("OK ->", OUT, os.path.getsize(OUT), "bytes", img.size)

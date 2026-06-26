#!/usr/bin/env python3
"""Build OG v5: Cloudflare Flux background + broadcast-style Vietnamese overlay."""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "cf_flux_v5_raw.jpg")
OUT = os.path.join(ROOT, "public", "og-v5.jpg")

W, H = 1200, 630
ACCENT = (95, 208, 197)    # frost teal
ACCENT2 = (41, 151, 140)
WHITE = (246, 250, 249)
MUTED = (188, 205, 201)
NAVY = (4, 12, 15)
PANEL = (7, 23, 25)

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

# left broadcast scrim: readable but leaves stadium detail visible
grad = Image.new("L", (W, 1), 0)
for x in range(W):
    t = max(0.0, 1.0 - x / (W * 0.72))
    grad.putpixel((x, 0), int(232 * (t ** 0.9)))
grad = grad.resize((W, H))
img = Image.composite(Image.new("RGB", (W, H), NAVY), img, grad)

# bottom vignette
bot = Image.new("L", (1, H), 0)
for y in range(H):
    t = max(0.0, (y - H * 0.68) / (H * 0.32))
    bot.putpixel((0, y), int(160 * t))
bot = bot.resize((W, H))
img = Image.composite(Image.new("RGB", (W, H), (2, 8, 10)), img, bot)

# subtle teal line-work for a broadcast identity layer
line_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
ld = ImageDraw.Draw(line_layer)
for i, alpha in enumerate([90, 58, 34]):
    y = 494 + i * 22
    ld.line([(72, y), (540, y + 28)], fill=(*ACCENT, alpha), width=2)
ld.arc([710, 140, 1160, 590], 205, 310, fill=(*ACCENT, 45), width=3)
img = Image.alpha_composite(img.convert("RGBA"), line_layer).convert("RGB")

d = ImageDraw.Draw(img)
PAD = 70

# logo mark
logo_x, logo_y = PAD, 74
rounded_rect(d, [logo_x, logo_y, logo_x + 56, logo_y + 56], 14, ACCENT2)
d.ellipse([logo_x + 14, logo_y + 13, logo_x + 42, logo_y + 41], fill=WHITE)
star = [(32,18.4),(36.5,26.6),(45.7,28.3),(39.3,35.1),(40.5,44.4),(32,40.4),(23.5,44.4),(24.7,35.1),(18.3,28.3),(27.5,26.6)]
star = [(logo_x + (x * 56 / 64), logo_y + (y * 56 / 64)) for x, y in star]
d.polygon(star, fill=(6, 78, 72))

# kicker
kicker_font = font(24, True)
d.text((logo_x + 72, logo_y + 2), "WC26 · MEOWBITER", font=kicker_font, fill=ACCENT)
d.text((logo_x + 72, logo_y + 32), "Tỉ số trực tiếp · giờ địa phương", font=font(22, False), fill=MUTED)

# title block
title_font = font(76, True)
text_shadow(d, (PAD, 174), "Lịch thi đấu", title_font, WHITE, off=3)
text_shadow(d, (PAD, 258), "World Cup 2026", title_font, WHITE, off=3)

# subtitle
subtitle = "104 trận · 48 đội · 12 bảng · sơ đồ knockout"
text_shadow(d, (PAD, 358), subtitle, font(31, False), MUTED, off=2)

# stat chips, tighter and more visual
chips = [("104", "trận"), ("48", "đội"), ("12", "bảng"), ("16", "sân")]
cx, cy = PAD, 456
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
rounded_rect(d, [ux, uy, W - PAD, uy + 44], 22, (4, 16, 18), outline=(95, 208, 197), width=1)
d.text((ux + 15, uy + 8), url, font=uf, fill=ACCENT)

img.save(OUT, "JPEG", quality=90, optimize=True)
print("OK ->", OUT, os.path.getsize(OUT), "bytes", img.size)

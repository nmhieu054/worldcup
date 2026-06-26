#!/usr/bin/env python3
"""Build OG image v4: Cloudflare Flux stadium background + Vietnamese title overlay.
Background generated via cf/@cf/black-forest-labs/flux-1-schnell (9router).
Cover-fit 1024x1024 -> 1200x630, then composite text.
"""
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "cf_flux_raw.jpg")
OUT = os.path.join(ROOT, "public", "og-v4.jpg")

W, H = 1200, 630
ACCENT = (95, 208, 197)   # #5fd0c5 frost-teal brand accent
WHITE = (245, 248, 248)
MUTED = (200, 214, 213)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def load(sz, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, sz)

# --- cover-fit base (crop to 1200x630 keeping center, bias toward top for sky/lights) ---
src = Image.open(SRC).convert("RGB")
sw, sh = src.size
scale = max(W / sw, H / sh)
nw, nh = int(sw * scale + 0.5), int(sh * scale + 0.5)
src = src.resize((nw, nh), Image.LANCZOS)
# crop center horizontally, bias toward top third (keep upper-left negative space)
left = (nw - W) // 2
top = int((nh - H) * 0.35)
img = src.crop((left, top, left + W, top + H))

# --- left-side darken gradient for text legibility ---
grad = Image.new("L", (W, 1), 0)
for x in range(W):
    t = max(0.0, 1.0 - x / (W * 0.70))
    grad.putpixel((x, 0), int(215 * t))
grad = grad.resize((W, H))
overlay = Image.new("RGB", (W, H), (6, 18, 22))
img = Image.composite(overlay, img, grad)

# bottom vignette for meta strip
bot = Image.new("L", (1, H), 0)
for y in range(H):
    t = max(0.0, (y - H * 0.76) / (H * 0.24))
    bot.putpixel((0, y), int(160 * t))
bot = bot.resize((W, H))
img = Image.composite(Image.new("RGB", (W, H), (4, 12, 16)), img, bot)

draw = ImageDraw.Draw(img)
PAD = 70

def text_shadow(xy, s, font, fill, shadow=(0, 0, 0), off=2):
    x, y = xy
    draw.text((x + off, y + off), s, font=font, fill=shadow)
    draw.text((x, y), s, font=font, fill=fill)

# kicker
kf = load(26, bold=True)
kicker = "WORLD CUP 2026"
draw.text((PAD, 96), kicker, font=kf, fill=ACCENT)
kw = draw.textlength(kicker, font=kf)
draw.rectangle([PAD, 134, PAD + kw, 138], fill=ACCENT)

# title
tf = load(72, bold=True)
text_shadow((PAD, 168), "Lịch thi đấu", tf, WHITE, off=3)
text_shadow((PAD, 252), "World Cup 2026", tf, WHITE, off=3)

# subtitle
sf = load(34, bold=False)
text_shadow((PAD, 352), "Giờ Việt Nam · Bảng xếp hạng trực tiếp", sf, MUTED, off=2)

# chips
cf = load(28, bold=True)
chips = ["104 trận", "12 bảng", "16 sân vận động"]
cx, cy = PAD, 470
for c in chips:
    cw = draw.textlength(c, font=cf)
    box_w = cw + 36
    draw.rounded_rectangle([cx, cy, cx + box_w, cy + 52], radius=12,
                           fill=(12, 30, 34), outline=ACCENT, width=2)
    draw.text((cx + 18, cy + 10), c, font=cf, fill=WHITE)
    cx += box_w + 18

# domain tag
df = load(24, bold=True)
dom = "worldcup.meowbiter.me"
dw = draw.textlength(dom, font=df)
draw.text((W - PAD - dw, H - 56), dom, font=df, fill=ACCENT)

img.save(OUT, "JPEG", quality=88, optimize=True)
print("OK ->", OUT, os.path.getsize(OUT), "bytes", img.size)

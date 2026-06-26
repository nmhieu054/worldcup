#!/usr/bin/env python3
"""Build OG image: stadium background + Vietnamese title overlay.
No AI generation needed - composites text onto existing og-v2 background.
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
SRC = os.path.join(ROOT, "public", "og-v2.jpg")
OUT = os.path.join(ROOT, "public", "og-v3.jpg")

W, H = 1200, 630
ACCENT = (95, 208, 197)   # #5fd0c5 frost-teal brand accent
WHITE = (245, 248, 248)
MUTED = (200, 214, 213)

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG  = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def load(sz, bold=True):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, sz)

# --- base ---
img = Image.open(SRC).convert("RGB").resize((W, H), Image.LANCZOS)

# --- left-side darken gradient for text legibility ---
# build an alpha mask: dark on left, transparent on right
grad = Image.new("L", (W, 1), 0)
for x in range(W):
    # full dark (210) at x=0 -> 0 at ~62% width
    t = max(0.0, 1.0 - x / (W * 0.62))
    grad.putpixel((x, 0), int(210 * t))
grad = grad.resize((W, H))
overlay = Image.new("RGB", (W, H), (6, 18, 22))  # deep teal-navy
img = Image.composite(overlay, img, grad)

# subtle top-to-bottom vignette at very bottom for the meta strip
bot = Image.new("L", (1, H), 0)
for y in range(H):
    t = max(0.0, (y - H * 0.78) / (H * 0.22))
    bot.putpixel((0, y), int(150 * t))
bot = bot.resize((W, H))
img = Image.composite(Image.new("RGB", (W, H), (4, 12, 16)), img, bot)

draw = ImageDraw.Draw(img)

PAD = 70

def text_shadow(xy, s, font, fill, shadow=(0, 0, 0), off=2, blur=False):
    x, y = xy
    # crisp dark shadow for legibility on busy bg
    draw.text((x + off, y + off), s, font=font, fill=shadow)
    draw.text((x, y), s, font=font, fill=fill)

# --- accent kicker (top) ---
kf = load(26, bold=True)
kicker = "WORLD CUP 2026"
draw.text((PAD, 96), kicker, font=kf, fill=ACCENT)
# small rule under kicker
kw = draw.textlength(kicker, font=kf)
draw.rectangle([PAD, 134, PAD + kw, 138], fill=ACCENT)

# --- main title (two lines) ---
tf = load(72, bold=True)
line1 = "Lịch thi đấu"
line2 = "World Cup 2026"
text_shadow((PAD, 168), line1, tf, WHITE, off=3)
text_shadow((PAD, 252), line2, tf, WHITE, off=3)

# --- subtitle ---
sf = load(34, bold=False)
text_shadow((PAD, 352), "Giờ Việt Nam · Bảng xếp hạng trực tiếp", sf, MUTED, off=2)

# --- bottom meta chips ---
cf = load(28, bold=True)
chips = ["104 trận", "12 bảng", "16 sân vận động"]
cx = PAD
cy = 470
for c in chips:
    cw = draw.textlength(c, font=cf)
    box_w = cw + 36
    draw.rounded_rectangle([cx, cy, cx + box_w, cy + 52], radius=12,
                           fill=(12, 30, 34), outline=ACCENT, width=2)
    draw.text((cx + 18, cy + 10), c, font=cf, fill=WHITE)
    cx += box_w + 18

# --- domain tag bottom-right ---
df = load(24, bold=True)
dom = "worldcup.meowbiter.me"
dw = draw.textlength(dom, font=df)
draw.text((W - PAD - dw, H - 56), dom, font=df, fill=ACCENT)

img.save(OUT, "JPEG", quality=88, optimize=True)
print("OK ->", OUT, os.path.getsize(OUT), "bytes", img.size)

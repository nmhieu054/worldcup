#!/usr/bin/env python3
"""Download real stadium photos (Wikimedia) and write optimized webp into
public/assets/stadiums/<id>.webp. Source URLs in /tmp/stadium_imgs.json."""
import json, time, subprocess, sys, urllib.request
from pathlib import Path
from io import BytesIO
from PIL import Image

SRC = Path("/tmp/stadium_imgs.json")
OUT = Path(__file__).resolve().parent.parent / "public" / "assets" / "stadiums"
OUT.mkdir(parents=True, exist_ok=True)

UA = "Mozilla/5.0 (WC26 personal project; contact meowbiter) Python-urllib"
TARGET_W = 1100

data = json.loads(SRC.read_text())
ok = 0
for sid, info in data.items():
    url = info["img"]
    dst = OUT / f"{sid}.webp"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": UA})
        raw = urllib.request.urlopen(req, timeout=30).read()
        im = Image.open(BytesIO(raw)).convert("RGB")
        if im.width > TARGET_W:
            h = round(im.height * TARGET_W / im.width)
            im = im.resize((TARGET_W, h), Image.LANCZOS)
        im.save(dst, "WEBP", quality=80, method=6)
        kb = dst.stat().st_size // 1024
        print(f"OK {sid} {info['title']} -> {dst.name} {kb}KB")
        ok += 1
    except Exception as e:
        print(f"ERR {sid} {info['title']} {e}", file=sys.stderr)
    time.sleep(1.2)
print("total", ok)

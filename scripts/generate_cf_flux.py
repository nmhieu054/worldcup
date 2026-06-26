#!/usr/bin/env python3
"""Generate a square background image through 9router -> Cloudflare Workers AI Flux.
Requires local 9router running at 127.0.0.1:20128 and apiKey in ~/.openclaw/openclaw.json.
"""
import base64
import json
import os
import sys
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "cf_flux_v5_raw.jpg")
PROMPT = " ".join(sys.argv[2:]) if len(sys.argv) > 2 else """
Premium cinematic football schedule social-card background for World Cup 2026. Night stadium from a low broadcast angle, bright floodlights, packed crowd silhouettes, emerald pitch line in lower third, deep navy and black atmosphere with one frost-teal accent glow (#5fd0c5). Right side has dramatic stadium detail and light beams, left side remains darker with clean negative space for large Vietnamese title overlay. Subtle geometric pitch-line pattern, premium sports broadcast package feel, crisp, high contrast, not cartoon. No text, no letters, no numbers, no logos, no watermark, no official FIFA emblem.
""".strip()

with open(os.path.expanduser("~/.openclaw/openclaw.json"), "r", encoding="utf-8") as f:
    cfg = json.load(f)
api_key = cfg.get("models", {}).get("providers", {}).get("9router", {}).get("apiKey", "")

payload = {
    "model": "cf/@cf/black-forest-labs/flux-1-schnell",
    "prompt": PROMPT,
    "n": 1,
}
req = urllib.request.Request(
    "http://127.0.0.1:20128/v1/images/generations",
    data=json.dumps(payload).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    },
    method="POST",
)
with urllib.request.urlopen(req, timeout=180) as res:
    body = json.load(res)
raw = base64.b64decode(body["data"][0]["b64_json"])
with open(OUT, "wb") as f:
    f.write(raw)
print(f"OK -> {OUT} ({len(raw)} bytes)")

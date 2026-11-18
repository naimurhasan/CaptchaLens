import sys
from PIL import Image, ImageDraw, ImageFont

W = 1180
HEADER = 74
INNER_H = 920
H = INNER_H + HEADER
OUT_W = 720

def font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except Exception:
        return ImageFont.load_default()

def browser_frame(page_img, caption, accent=(0x34, 0xA8, 0x53)):
    frame = Image.new("RGB", (W, H), (0x14, 0x15, 0x19))
    d = ImageDraw.Draw(frame)
    d.rectangle([40, HEADER - 10, W - 40, HEADER - 7], fill=(0x0B, 0x0C, 0x0F))
    d.ellipse([62, 27, 76, 41], fill=(0xFF, 0x5F, 0x57))
    d.ellipse([86, 27, 100, 41], fill=(0xFE, 0xBC, 0x2E))
    d.ellipse([110, 27, 124, 41], fill=(0x28, 0xC8, 0x40))
    d.text((144, 24), "CaptchaLens — live reCAPTCHA v2", font=font(16), fill=(0xDA, 0xDC, 0xE0))
    d.text((146, 46), "2captcha.com/demo/recaptcha-v2", font=font(13), fill=(0x80, 0x86, 0x8B))
    frame.paste(page_img, (0, HEADER))

    strip_h = 46
    strip = Image.new("RGBA", (W, strip_h), (11, 12, 15, 235))
    frame.paste(strip, (0, H - strip_h), strip)
    d2 = ImageDraw.Draw(frame)
    d2.rectangle([0, H - strip_h, 6, H - 1], fill=accent)
    d2.text((20, H - strip_h + 12), caption, font=font(17), fill=(0xE8, 0xEA, 0xED))

    ratio = OUT_W / W
    return frame.resize((OUT_W, int(H * ratio)), Image.LANCZOS)

T = "/Users/md.naimurhasan/Development/Web/captcha-analysis/.tmp/"
frames = []
timeline = [
    (40,  "1 — detection: reCAPTCHA v2 found on the page (sitekey + variant)", (0x8A, 0xAB, 0xD4), 2200),
    (70,  "2 — challenge served: 'select all bicycles' — 3x3 grid", (0x8A, 0xAB, 0xD4), 2200),
    (80,  "3 — ensemble (jev + gemini) picked 4 tiles — clicked", (0x8A, 0xAB, 0xD4), 2500),
    (84,  "4 — CHECKBOX GREEN — Google accepted the answer", (0x34, 0xA8, 0x53), 3200),
    (88,  "5 — clicking the demo's Check button with the token…", (0x8A, 0xAB, 0xD4), 1800),
    (92,  "SOLVED — demo confirms the token", (0x34, 0xA8, 0x53), 4200),
]
durations = []
for t, caption, accent, dur in timeline:
    page = Image.open(f"{T}kf-{t}.jpg").convert("RGB")
    frames.append(browser_frame(page, caption, accent))
    durations.append(dur)

frames[0].save(
    "/Users/md.naimurhasan/Development/Web/captcha-analysis/assets/recaptcha-solved.gif",
    save_all=True,
    append_images=frames[1:],
    duration=durations,
    loop=0,
    optimize=True,
)
import os
print("GIF written:", os.path.getsize("/Users/md.naimurhasan/Development/Web/captcha-analysis/assets/recaptcha-solved.gif"), "bytes,", len(frames), "beats")

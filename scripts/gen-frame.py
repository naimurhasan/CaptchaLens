import sys
from PIL import Image, ImageDraw, ImageFont

def font(size):
    try:
        return ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", size)
    except Exception:
        return ImageFont.load_default()

W = int(sys.argv[1])
INNER_H = int(sys.argv[2])
HEADER = 74
H = INNER_H + HEADER
bg_path = sys.argv[3]
cap_path = sys.argv[4]
solved = sys.argv[5] == "1"

img = Image.new("RGB", (W, H), (0x14, 0x15, 0x19))
d = ImageDraw.Draw(img)

d.rectangle([40, HEADER - 10, W - 40, HEADER - 7], fill=(0x0B, 0x0C, 0x0F))
d.ellipse([62, 27, 76, 41], fill=(0xFF, 0x5F, 0x57))
d.ellipse([86, 27, 100, 41], fill=(0xFE, 0xBC, 0x2E))
d.ellipse([110, 27, 124, 41], fill=(0x28, 0xC8, 0x40))
d.text((144, 24), "CaptchaLens — live reCAPTCHA v2", font=font(16), fill=(0xDA, 0xDC, 0xE0))
d.text((146, 46), "2captcha.com/demo/recaptcha-v2", font=font(13), fill=(0x80, 0x86, 0x8B))
ens = "jev-1.14 + gemini-decision-1 ensemble"
ew = d.textlength(ens, font=font(13))
d.text((W - 50 - ew, 46), ens, font=font(13), fill=(0x80, 0x86, 0x8B))
img.save(bg_path)

cap_w, cap_h = 620, 52
cap = Image.new("RGBA", (cap_w, cap_h), (0, 0, 0, 0))
cd = ImageDraw.Draw(cap)
cd.rounded_rectangle([0, 0, cap_w - 1, cap_h - 1], radius=12, fill=(0x34, 0xA8, 0x53) if solved else (0x3C, 0x40, 0x43))
msg = "SOLVED — Google accepted the token" if solved else "attempt recorded — solve not confirmed"
tw = cd.textlength(msg, font=font(20))
cd.text(((cap_w - tw) / 2, (cap_h - 26) / 2), msg, font=font(20), fill=(0x0B, 0x0C, 0x0F) if solved else (0xE8, 0xEA, 0xED))
cap.save(cap_path)
print(f"frame overlays: bg {W}x{H}, caption {cap_w}x{cap_h}")

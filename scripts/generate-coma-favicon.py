#!/usr/bin/env python3
"""
Generate Coma favicon variants from the source PNG downloaded from
joincoma.com/assets/coma_trans.png.

Creates:
  - favicon.ico (multi-size: 16, 32, 48, 64)
  - favicon-32.png
  - favicon-192.png  (Android/PWA)
  - apple-touch-icon.png (180×180 with white background — PNG has alpha)

Source PNG is 605×415 RGBA. We center-crop to a square (415×415) then
resize down. We keep alpha for the .ico and .png variants (the
browser will composite over its tab background).
"""

from PIL import Image
from pathlib import Path

SRC = Path("/home/z/my-project/public/brand/coma/favicon-source.png")
OUT_DIR = Path("/home/z/my-project/public/brand/coma")

img = Image.open(SRC).convert("RGBA")
print(f"Source: {img.size[0]}x{img.size[1]}")

# Center-crop to a square (take the 415×415 middle).
w, h = img.size
side = min(w, h)
left = (w - side) // 2
top = (h - side) // 2
square = img.crop((left, top, left + side, top + side))
print(f"Cropped to: {square.size[0]}x{square.size[1]}")

# Generate favicon.ico (multi-resolution)
ico_sizes = [(16, 16), (32, 32), (48, 48), (64, 64)]
ico_path = OUT_DIR / "favicon.ico"
square.save(ico_path, format="ICO", sizes=ico_sizes)
print(f"  Wrote {ico_path} ({ico_path.stat().st_size} bytes)")

# Generate PNG variants
for size, name in [(32, "favicon-32.png"), (192, "favicon-192.png"), (180, "apple-touch-icon.png")]:
    out_path = OUT_DIR / name
    # For apple-touch-icon, composite over white (iOS doesn't preserve alpha on home screen).
    if name == "apple-touch-icon.png":
        bg = Image.new("RGBA", (size, size), (255, 255, 255, 255))
        resized = square.resize((size, size), Image.LANCZOS)
        bg.paste(resized, (0, 0), resized)
        bg.convert("RGB").save(out_path, "PNG")
    else:
        square.resize((size, size), Image.LANCZOS).save(out_path, "PNG")
    print(f"  Wrote {out_path} ({out_path.stat().st_size} bytes)")

# Also generate a "logo.png" — same source, larger, with alpha preserved,
# suitable for use in headers/emails (the coma wordmark uses the
# text-based BrandLogo component, but a fallback PNG is useful for
# contexts where the text mark doesn't render correctly, e.g. legacy
# email clients).
logo_path = OUT_DIR / "logo.png"
square.resize((256, 256), Image.LANCZOS).save(logo_path, "PNG")
print(f"  Wrote {logo_path} ({logo_path.stat().st_size} bytes)")

print("\nAll Coma favicon variants generated in public/brand/coma/")

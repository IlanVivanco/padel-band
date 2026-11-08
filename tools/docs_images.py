"""Builds the README images from the UI test screenshots.

Usage (after `npm run test:ui`, which writes test/screens/*.png):

    python3 tools/docs_images.py

Writes docs/preview.png (hero strip) and docs/screens/<state>.png (one
capsule per state, masked to the band's shape). Needs Pillow.
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOTS = os.path.join(ROOT, 'test', 'screens')
DOCS = os.path.join(ROOT, 'docs')
SCALE = 2
W, H = 212 * SCALE, 520 * SCALE
BG = (24, 24, 24)

STATES = ['00-ask', '01-start', '02-normal', '03-ad-us', '04-ad-them', '05-golden',
          '06-tiebreak', '07-win-us', '08-win-them', '09-menu']
HERO = ['02-normal', '03-ad-us', '06-tiebreak', '07-win-us']


def capsule(name):
    im = Image.open(os.path.join(SHOTS, name + '.png')).convert('RGB')
    im = im.resize((W, H), Image.NEAREST)
    mask = Image.new('L', (W, H), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, W - 1, H - 1), radius=W // 2, fill=255)
    out = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    out.paste(im, mask=mask)
    return out


def strip(names, pad):
    sheet = Image.new('RGB', (len(names) * (W + pad) + pad, H + 2 * pad), BG)
    for i, n in enumerate(names):
        c = capsule(n)
        sheet.paste(c, (pad + i * (W + pad), pad), c)
    return sheet.resize((sheet.width // SCALE, sheet.height // SCALE), Image.LANCZOS)


def main():
    os.makedirs(os.path.join(DOCS, 'screens'), exist_ok=True)
    strip(HERO, 30 * SCALE).save(os.path.join(DOCS, 'preview.png'))
    for n in STATES:
        c = capsule(n)
        c.resize((W // SCALE, H // SCALE), Image.LANCZOS).save(os.path.join(DOCS, 'screens', n + '.png'))
    print('wrote docs/preview.png and', len(STATES), 'screens')


if __name__ == '__main__':
    main()

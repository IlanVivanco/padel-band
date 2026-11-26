"""Draws the app's small PNG icons into src/common/.

Usage: python3 tools/icons.py   (needs Pillow)

Vela has no icon font and no SVG, so icons are bitmaps drawn at the exact
size they're shown (supersampled, then reduced for smooth edges).
"""
import math
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'src', 'common')
SS = 8  # supersampling

LIME = (217, 242, 18, 255)
WHITE = (255, 255, 255, 255)
BLACK = (0, 0, 0, 255)


def canvas(size):
    im = Image.new('RGBA', (size * SS, size * SS), (0, 0, 0, 0))
    return im, ImageDraw.Draw(im), size * SS


def save(im, size, name):
    im.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name))


def ball(size, name):
    im, d, S = canvas(size)
    d.ellipse((0, 0, S - 1, S - 1), fill=LIME)
    # the seam: two arcs facing each other
    w = max(1, S // 14)
    seam = (0, 0, 0, 110)
    d.arc((-S * 0.55, S * 0.12, S * 0.42, S * 0.88), -60, 60, fill=seam, width=w)
    d.arc((S * 0.58, S * 0.12, S * 1.55, S * 0.88), 120, 240, fill=seam, width=w)
    save(im, size, name)


def plus(size, name, col=WHITE):
    im, d, S = canvas(size)
    t = S * 0.12
    d.rounded_rectangle((S * 0.12, S / 2 - t / 2, S * 0.88, S / 2 + t / 2), radius=t / 2, fill=col)
    d.rounded_rectangle((S / 2 - t / 2, S * 0.12, S / 2 + t / 2, S * 0.88), radius=t / 2, fill=col)
    save(im, size, name)


def history(size, name, col=WHITE):
    # a list: three bullets and lines
    im, d, S = canvas(size)
    t = S * 0.11
    for i, y in enumerate((0.22, 0.5, 0.78)):
        cy = S * y
        d.ellipse((S * 0.08, cy - t * 0.75, S * 0.08 + t * 1.5, cy + t * 0.75), fill=col)
        d.rounded_rectangle((S * 0.32, cy - t / 2, S * 0.92, cy + t / 2), radius=t / 2, fill=col)
    save(im, size, name)


def more(size, name, col=WHITE):
    im, d, S = canvas(size)
    r = S * 0.09
    for x in (0.2, 0.5, 0.8):
        d.ellipse((S * x - r, S / 2 - r, S * x + r, S / 2 + r), fill=col)
    save(im, size, name)


def star(size, name, col):
    im, d, S = canvas(size)
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5
        r = S * (0.48 if i % 2 == 0 else 0.2)
        pts.append((S / 2 + r * math.cos(a), S * 0.53 + r * math.sin(a)))
    d.polygon(pts, fill=col)
    save(im, size, name)


def sun(size, name, col):
    im, d, S = canvas(size)
    c = S / 2
    r = S * 0.2
    d.ellipse((c - r, c - r, c + r, c + r), fill=col)
    t = S * 0.09
    for i in range(8):
        a = i * math.pi / 4
        x0, y0 = c + S * 0.32 * math.cos(a), c + S * 0.32 * math.sin(a)
        x1, y1 = c + S * 0.46 * math.cos(a), c + S * 0.46 * math.sin(a)
        d.line((x0, y0, x1, y1), fill=col, width=int(t))
    save(im, size, name)


def check(size, name, col=WHITE):
    im, d, S = canvas(size)
    t = int(S * 0.12)
    d.line((S * 0.14, S * 0.52, S * 0.4, S * 0.78, S * 0.88, S * 0.24), fill=col, width=t, joint='curve')
    for x, y in ((S * 0.14, S * 0.52), (S * 0.4, S * 0.78), (S * 0.88, S * 0.24)):
        d.ellipse((x - t / 2, y - t / 2, x + t / 2, y + t / 2), fill=col)
    save(im, size, name)


def cross(size, name, col=WHITE):
    im, d, S = canvas(size)
    t = int(S * 0.12)
    for a, b in (((0.2, 0.2), (0.8, 0.8)), ((0.8, 0.2), (0.2, 0.8))):
        d.line((S * a[0], S * a[1], S * b[0], S * b[1]), fill=col, width=t)
        for x, y in (a, b):
            d.ellipse((S * x - t / 2, S * y - t / 2, S * x + t / 2, S * y + t / 2), fill=col)
    save(im, size, name)


def ball_line(size, name, col=WHITE):
    # the padel ball as a line icon, like the other panel icons
    im, d, S = canvas(size)
    w = int(S * 0.09)
    d.ellipse((w / 2, w / 2, S - w / 2, S - w / 2), outline=col, width=w)
    d.arc((-S * 0.55, S * 0.12, S * 0.42, S * 0.88), -60, 60, fill=col, width=w)
    d.arc((S * 0.58, S * 0.12, S * 1.55, S * 0.88), 120, 240, fill=col, width=w)
    save(im, size, name)


if __name__ == '__main__':
    # Sizes are Wear OS Material 3 dp x 1.5 (see the style notes in
    # src/pages/index/index.ux).
    ball(48, 'ball-48.png')  # who-serves screen (large icon, 32dp)
    # who serves, on the serving team's colour (panel buttons: extra large
    # icon, 36dp)
    ball_line(54, 'icon-serve.png')
    plus(54, 'icon-plus.png', BLACK)  # on New match's yellow
    history(54, 'icon-history.png')
    more(54, 'icon-more.png')
    check(42, 'icon-yes.png', BLACK)  # dialog buttons (28dp), on green
    cross(30, 'icon-close.png', (199, 199, 204, 255))  # the dialog's cancel (20dp)
    check(14, 'icon-tick.png')  # the switch's checked thumb

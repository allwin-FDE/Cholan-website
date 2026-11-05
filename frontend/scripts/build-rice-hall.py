# Joins the two storyline pictures into the 360° strip behind the home page's
# Rice Hall (pages/Home/RiceHall.jsx): the temple courtyard three times, where
# the bags stand, with one carved panel of the rotunda between each. The strip
# wraps, so its last column meets its first.
#
#   python scripts/build-rice-hall.py
import os

import numpy as np
from PIL import Image, ImageEnhance, ImageFilter

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCE = r'D:\Cholan Main Web\assets-source\storyline'
OUT = os.path.join(HERE, '..', 'public', 'images')

H = 1672
W = 6144
SLOT = W // 3  # one courtyard and one panel; the page's stops are a slot apart
OVERLAP = 90  # how far the courtyard's edge melts into the wall
SHADE = 150  # how far the shadow reaches either side of a join

court = Image.open(os.path.join(SOURCE, 'Golden Temple Courtyard at Sunset.png')).convert('RGB')
rotunda = Image.open(os.path.join(SOURCE, 'Chola Empire Stone Rotunda Relief.png')).convert('RGB')
court_w = round(court.width * H / court.height)
court = court.resize((court_w, H), Image.LANCZOS)

# The three carved panels, each with the pillars either side of it.
PANELS = ((0, 660), (535, 1190), (1060, 1672))
panel_w = SLOT - court_w + OVERLAP * 2


def panel(x0, x1):
    part = rotunda.crop((x0, 0, x1, rotunda.height)).resize((panel_w, H), Image.LANCZOS)
    return part.filter(ImageFilter.UnsharpMask(radius=2.5, percent=70, threshold=2))


# The same courtyard, but not looking like the same photograph three times:
# one is mirrored and one is a little deeper into the evening.
evening = ImageEnhance.Color(ImageEnhance.Brightness(court).enhance(0.94)).enhance(1.12)
courts = (court, court.transpose(Image.FLIP_LEFT_RIGHT), evening)

strip = np.zeros((H, W, 3), dtype=np.float32)
for i, (x0, x1) in enumerate(PANELS):
    # The wall that follows courtyard i.
    start = (i * SLOT + (SLOT + court_w) // 2 - OVERLAP) % W
    columns = (start + np.arange(panel_w)) % W
    strip[:, columns] = np.asarray(panel(x0, x1), dtype=np.float32)

for i, picture in enumerate(courts):
    left = i * SLOT + (SLOT - court_w) // 2
    columns = (left + np.arange(court_w)) % W
    pixels = np.asarray(picture, dtype=np.float32)
    edge = np.minimum(np.arange(court_w), np.arange(court_w)[::-1]) / OVERLAP
    alpha = np.clip(edge, 0, 1)
    alpha = (alpha * alpha * (3 - 2 * alpha))[None, :, None]
    strip[:, columns] = pixels * alpha + strip[:, columns] * (1 - alpha)

# Each join sits in deep shadow, so it reads as the recess beside a pillar.
shade = np.ones(W, dtype=np.float32)
for i in range(3):
    left = i * SLOT + (SLOT - court_w) // 2 + OVERLAP // 2
    for join in (left, left + court_w - OVERLAP):
        distance = np.abs((np.arange(W) - join + W // 2) % W - W // 2) / SHADE
        t = np.clip(distance, 0, 1)
        shade = np.minimum(shade, 0.36 + 0.64 * t * t * (3 - 2 * t))
strip *= shade[None, :, None]

result = Image.fromarray(np.clip(strip, 0, 255).astype(np.uint8))
result.save(os.path.join(OUT, 'rice-hall.webp'), quality=82, method=6)
small = result.resize((4096, round(H * 4096 / W)), Image.LANCZOS)
small.save(os.path.join(OUT, 'rice-hall-sm.webp'), quality=80, method=6)
# Shown before the strip arrives, and to browsers that cannot turn it.
court.resize((900, round(H * 900 / court_w)), Image.LANCZOS).save(os.path.join(OUT, 'rice-hall-poster.webp'), quality=76, method=6)
print('panel width', panel_w, 'courtyard width', court_w)

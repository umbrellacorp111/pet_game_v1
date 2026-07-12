"""Генератор пиксельных текстур блоков в стиле Minecraft (16x16) для Шахты Удачи."""
import random, os
from PIL import Image

W = H = 16
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "mc")
os.makedirs(OUT, exist_ok=True)

def px_set(img, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), (c[0], c[1], c[2], 255))

def shade(c, d):
    return (max(0, min(255, c[0] + d)), max(0, min(255, c[1] + d)), max(0, min(255, c[2] + d)))

def vignette(img, base, amt=18):
    """тёмные края -> блок выглядит объёмным, как в MC."""
    px = img.load()
    for y in range(H):
        for x in range(W):
            edge = min(x, y, W - 1 - x, H - 1 - y)
            d = -amt if edge == 0 else (amt // 3 if edge == 1 else 0)
            r, g, b, a = px[x, y]
            px[x, y] = (max(0, min(255, r + d)), max(0, min(255, g + d)), max(0, min(255, b + d)), a)

def stone(seed):
    random.seed(seed)
    img = Image.new("RGBA", (W, H))
    base = (127, 127, 127)
    for y in range(H):
        for x in range(W):
            v = base[0] + random.randint(-13, 13)
            img.putpixel((x, y), (v, v, v, 255))
    for _ in range(46):  # тёмные сколы
        x, y = random.randint(0, 15), random.randint(0, 15)
        px_set(img, x, y, shade(base, -random.randint(10, 24)))
    for _ in range(30):  # светлые блики
        x, y = random.randint(0, 15), random.randint(0, 15)
        px_set(img, x, y, shade(base, random.randint(6, 16)))
    return img

def dirt(seed):
    random.seed(seed)
    img = Image.new("RGBA", (W, H))
    base = (134, 96, 67)
    for y in range(H):
        for x in range(W):
            v = base[0] + random.randint(-11, 11)
            img.putpixel((x, y), (v, int(v * 0.71), int(v * 0.5), 255))
    for _ in range(38):  # тёмные комки
        x, y = random.randint(0, 15), random.randint(0, 15)
        px_set(img, x, y, (90, 64, 42))
    for _ in range(22):  # светлые песчинки
        x, y = random.randint(0, 15), random.randint(0, 15)
        px_set(img, x, y, (165, 124, 84))
    return img

def ore(seed, ore_color, blobs=5, size=5):
    img = stone(seed)
    px = img.load()
    random.seed(seed + 777)
    for _ in range(blobs):
        cx, cy = random.randint(3, 12), random.randint(3, 12)
        for _ in range(size):
            x = min(15, max(0, cx + random.randint(-1, 1)))
            y = min(15, max(0, cy + random.randint(-1, 1)))
            c = (ore_color[0] + random.randint(-14, 14),
                 ore_color[1] + random.randint(-14, 14),
                 ore_color[2] + random.randint(-14, 14))
            px[x, y] = (max(0, min(255, c[0])), max(0, min(255, c[1])), max(0, min(255, c[2])), 255)
    return img

# имена совпадают с классами .mCell.<name>
make = {
    "dirt":  lambda: dirt(11),
    "stone": lambda: stone(22),
    "coal":  lambda: ore(33, (24, 24, 28), blobs=6, size=5),
    "iron":  lambda: ore(44, (216, 168, 138), blobs=5, size=5),
    "gold":  lambda: ore(55, (250, 224, 104), blobs=5, size=4),
    "diam":  lambda: ore(66, (110, 230, 220), blobs=5, size=4),
}

for name, fn in make.items():
    img = fn()
    vignette(img, (0, 0, 0))
    img.save(os.path.join(OUT, name + ".png"))
    print("saved", name + ".png")

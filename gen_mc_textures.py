"""Генератор пиксельных текстур в стиле Minecraft (16x16) для Шахты Удачи:
блоки руды (dirt/stone/coal/iron/gold/diam), кирки (pick_*) и сундуки (chest_*)."""
import random, os
from PIL import Image

W = H = 16
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static", "mc")
os.makedirs(OUT, exist_ok=True)

def px(img, x, y, c):
    if 0 <= x < W and 0 <= y < H:
        img.putpixel((x, y), (c[0], c[1], c[2], 255))

def new():
    return Image.new("RGBA", (W, H))

def outline(img, col=(15, 15, 20)):
    mask = [[img.getpixel((x, y))[3] > 0 for x in range(W)] for y in range(H)]
    dst = img.copy(); d = dst.load()
    for y in range(H):
        for x in range(W):
            if not mask[y][x]:
                if (x > 0 and mask[y][x-1]) or (x < W-1 and mask[y][x+1]) \
                   or (y > 0 and mask[y-1][x]) or (y < H-1 and mask[y+1][x]):
                    d[x, y] = (col[0], col[1], col[2], 255)
    return dst

def vignette(img, amt=16):
    px_ = img.load()
    for y in range(H):
        for x in range(W):
            edge = min(x, y, W-1-x, H-1-y)
            d = -amt if edge == 0 else (amt//3 if edge == 1 else 0)
            r, g, b, a = px_[x, y]
            px_[x, y] = (max(0, min(255, r+d)), max(0, min(255, g+d)), max(0, min(255, b+d)), a)

# ---------- БАЗОВЫЕ БЛОКИ ----------
def stone(seed=22):
    random.seed(seed)
    img = new(); px_ = img.load(); base = (127, 127, 127)
    for y in range(H):
        for x in range(W):
            v = base[0] + random.randint(-13, 13)
            px_[x, y] = (v, v, v, 255)
    for _ in range(46): px(img, random.randint(0,15), random.randint(0,15), (107,107,107))
    for _ in range(30): px(img, random.randint(0,15), random.randint(0,15), (145,145,145))
    return img

def dirt(seed=11):
    random.seed(seed)
    img = new(); px_ = img.load(); base = (134, 96, 67)
    for y in range(H):
        for x in range(W):
            v = base[0] + random.randint(-11, 11)
            px_[x, y] = (v, int(v*0.71), int(v*0.5), 255)
    for _ in range(38): px(img, random.randint(0,15), random.randint(0,15), (90,64,42))
    for _ in range(22): px(img, random.randint(0,15), random.randint(0,15), (165,124,84))
    return img

def ore(seed, ore_color, blobs=5, size=5):
    img = stone(seed); px_ = img.load(); random.seed(seed + 777)
    for _ in range(blobs):
        cx, cy = random.randint(3, 12), random.randint(3, 12)
        for _ in range(size):
            x = min(15, max(0, cx + random.randint(-1, 1)))
            y = min(15, max(0, cy + random.randint(-1, 1)))
            c = (ore_color[0]+random.randint(-14,14), ore_color[1]+random.randint(-14,14), ore_color[2]+random.randint(-14,14))
            px_[x, y] = (max(0,min(255,c[0])), max(0,min(255,c[1])), max(0,min(255,c[2])), 255)
    return img

def planks():
    random.seed(3); img = new(); px_ = img.load(); base = (150, 105, 62)
    for y in range(H):
        for x in range(W):
            v = random.randint(-10, 10)
            px_[x, y] = (base[0]+v, base[1]+int(v*0.7), base[2]+int(v*0.5), 255)
    for x in (3, 7, 11):
        for y in range(H): px_[x, y] = (95, 62, 35, 255)
    for y in (5, 11):
        for x in range(W): px_[x, y] = (110, 72, 42, 255)
    return img

def metal_block(base, border, hi=None):
    random.seed(7); img = new(); px_ = img.load()
    for y in range(H):
        for x in range(W):
            v = random.randint(-6, 6)
            px_[x, y] = (base[0]+v, base[1]+v, base[2]+v, 255)
    for x in range(W):
        px_[x, 0] = border + (255,); px_[x, H-1] = border + (255,)
    for y in range(H):
        px_[0, y] = border + (255,); px_[W-1, y] = border + (255,)
    if hi:
        for x in range(2, 14, 4): px_[x, 2] = hi + (255,); px_[x, 13] = hi + (255,)
    return img

def iron_block():  return metal_block((223,223,229), (165,165,175), (240,240,245))
def gold_block():  return metal_block((250,223,95), (200,168,40), (255,240,160))
def diamond_block(): return metal_block((120,236,226), (70,182,172), (185,250,242))

# ---------- КИРКИ (блок материала + пиксельная кирка) ----------
def pick_layer(head, handle):
    img = new(); px_ = img.load()
    for y in range(7, 14):
        px_[8, y] = handle + (255,)
        px_[7, y] = (int(handle[0]*0.78), int(handle[1]*0.78), int(handle[2]*0.78), 255)
    for x in range(3, 13):
        px_[x, 5] = head + (255,); px_[x, 6] = head + (255,)
    for (x, y) in ((2,6),(13,6),(2,7),(13,7)):
        px_[x, y] = head + (255,)
    return outline(img)

def pick(mat):
    block = {"wood":planks, "stone":stone, "iron":iron_block, "gold":gold_block, "diamond":diamond_block}[mat]()
    head = {"wood":(95,62,35), "stone":(92,92,98), "iron":(185,187,196),
            "gold":(212,172,42), "diamond":(78,205,195)}[mat]
    handle = (125, 85, 48)
    pl = pick_layer(head, handle); plo = pl.load()
    out = block.copy(); o = out.load()
    for y in range(H):
        for x in range(W):
            if plo[x, y][3] > 0: o[x, y] = plo[x, y]
    vignette(out, 14)
    return out

# ---------- СУНДУКИ ----------
def chest(closed):
    img = new(); px_ = img.load()
    wood = (150, 100, 55); wood_d = (110, 72, 40); lid = (168, 114, 64); band = (62, 62, 70)
    if closed:
        for y in range(6, 15):
            for x in range(2, 14): px_[x, y] = wood + (255,)
        for y in range(3, 6):
            for x in range(2, 14): px_[x, y] = lid + (255,)
        for x in range(2, 14): px_[x, 6] = band + (255,)
        for x in (4, 5, 10, 11):
            for y in range(6, 15): px_[x, y] = band + (255,)
        for x in range(7, 9):
            for y in range(8, 12): px_[x, y] = (205, 205, 215, 255)
        px_[7, 9] = (40, 40, 48, 255); px_[8, 9] = (40, 40, 48, 255)
    else:
        for y in range(1, 4):
            for x in range(2, 14): px_[x, y] = lid + (255,)
        px_[2, 4] = band + (255,); px_[13, 4] = band + (255,)
        # внутренности (золото + алмазные искры)
        random.seed(5)
        for y in range(5, 14):
            for x in range(3, 13):
                col = (250, 220, 95) if random.random() > 0.25 else (255, 240, 150)
                px_[x, y] = col + (255,)
        for _ in range(6):
            px(img, random.randint(4, 11), random.randint(6, 12), (140, 245, 235, 255))
        for y in range(13, 15):
            for x in range(2, 14): px_[x, y] = wood + (255,)
        # передняя кромка
        for x in range(2, 14): px_[x, 12] = wood_d + (255,)
    return outline(img, (10, 8, 6))

# ---------- СОХРАНЕНИЕ ----------
jobs = {
    "dirt": dirt(), "stone": stone(),
    "coal": ore(33, (24, 24, 28), 6, 5), "iron": ore(44, (216, 168, 138), 5, 5),
    "gold": ore(55, (250, 224, 104), 5, 4), "diam": ore(66, (110, 230, 220), 5, 4),
    "pick_wood": pick("wood"), "pick_stone": pick("stone"), "pick_iron": pick("iron"),
    "pick_gold": pick("gold"), "pick_diamond": pick("diamond"),
    "chest_closed": chest(True), "chest_open": chest(False),
}
for name, img in jobs.items():
    img.save(os.path.join(OUT, name + ".png"))
    print("saved", name + ".png")

"""DEVELOPER TOOL - do not run inside Unreal. Generates the building facade + shopfront textures in SourceArt/facades (run with system Python + Pillow).
Each facade texture is one window bay: 4 m wide x 3.5 m tall. Writes _D (colour), _R (roughness),
_M (metallic) and _E (night window glow, 4 floors stacked) maps."""
import os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.join(os.path.dirname(__file__), "..", "SourceArt", "facades")
S = 512
random.seed(7)


def hexc(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


def noisy(size, colour, amp):
    img = Image.new("RGB", size, colour)
    px = img.load()
    for _ in range(size[0] * size[1] // 3):
        x, y = random.randrange(size[0]), random.randrange(size[1])
        d = random.randint(-amp, amp)
        px[x, y] = tuple(max(0, min(255, v + d)) for v in px[x, y])
    return img.filter(ImageFilter.GaussianBlur(0.6))


def glass_fill(d, box, top, bottom=(15, 23, 31)):
    x0, y0, x1, y1 = box
    for yy in range(int(y0), int(y1)):
        t = (yy - y0) / max(1, (y1 - y0))
        d.line([x0, yy, x1, yy], fill=tuple(int(top[k] * (1 - t) + bottom[k] * t) for k in range(3)))


# Each style: wall colour, trim colour, glass colour, noise, and a function returning window boxes (x0,y0,x1,y1)
def grid(cols, wfrac, y0f, hfrac):
    cw = S / cols
    return [(c * cw + cw * (1 - wfrac) / 2, S * y0f, c * cw + cw * (1 + wfrac) / 2, S * (y0f + hfrac)) for c in range(cols)]


STYLES = [
    # 0-5: the original six (same look as the browser version)
    dict(wall="#d8d2c6", trim="#b9b1a3", glass="#30404e", win=grid(2, 0.68, 0.14, 0.6), band=True),
    dict(wall="#9a5a44", trim="#7d4535", glass="#2a3540", win=grid(2, 0.68, 0.14, 0.6)),
    dict(wall="#6f7b86", trim="#59636d", glass="#1e2c3a", win=[(c * S / 3 + 6, 12, (c + 1) * S / 3 - 6, S * 0.8) for c in range(3)], glassy=True),
    dict(wall="#e9e6e0", trim="#cfcac0", glass="#34495a", win=grid(2, 0.68, 0.14, 0.6), band=True),
    dict(wall="#3c4148", trim="#2c3036", glass="#22323f", win=[(c * S / 4 + 6, 12, (c + 1) * S / 4 - 6, S * 0.8) for c in range(4)], glassy=True, band=True),
    dict(wall="#c49a6c", trim="#a37d55", glass="#2b3843", win=grid(2, 0.68, 0.14, 0.6)),
    # 6: ribbon windows (continuous horizontal glazing) on pale concrete
    dict(wall="#cfd2d2", trim="#9ea4a6", glass="#2a3b48", win=[(0, S * 0.22, S, S * 0.68)], mullions=6),
    # 7: classic stone, tall narrow windows with sills and lintels
    dict(wall="#ddd0b4", trim="#c2b293", glass="#26323c", win=grid(3, 0.42, 0.12, 0.66), sills=True),
    # 8: dark brick with arched windows
    dict(wall="#6e3b2e", trim="#c9b9a0", glass="#1f2a33", win=grid(2, 0.5, 0.18, 0.62), arch=True),
    # 9: full curtain wall, blue glass with spandrel bands
    dict(wall="#1d2b3a", trim="#8e9aa4", glass="#2f4e6b", win=[(c * S / 4 + 3, 4, (c + 1) * S / 4 - 3, S * 0.84) for c in range(4)], glassy=True, spandrel=True),
    # 10: residential with balconies (slab edge + railing) and sliding doors
    dict(wall="#efece6", trim="#bdb8ae", glass="#3a4e5c", win=[(S * 0.08, S * 0.1, S * 0.92, S * 0.78)], balcony=True, mullions=3),
    # 11: office grid, small punched windows on grey concrete
    dict(wall="#8d9196", trim="#73777c", glass="#1c2733", win=[(c * S / 4 + S / 16, y, (c + 1) * S / 4 - S / 16, y + S * 0.3) for c in range(4) for y in (S * 0.12, S * 0.55)]),
]


def facade(i, st):
    alb = noisy((S, S), hexc(st["wall"]), 18)
    d = ImageDraw.Draw(alb)
    rough = Image.new("L", (S, S), 235); dr = ImageDraw.Draw(rough)
    metal = Image.new("L", (S, S), 0); dm = ImageDraw.Draw(metal)
    trim, glass = hexc(st["trim"]), hexc(st["glass"])
    if st.get("band"):
        d.rectangle([0, int(S * 0.84), S, S], fill=trim)
    for (x0, y0, x1, y1) in st["win"]:
        if not st.get("glassy"):
            d.rectangle([x0 - 8, y0 - 8, x1 + 8, y1 + 8], fill=trim)
        if st.get("arch"):
            r = (x1 - x0) / 2
            d.pieslice([x0 - 8, y0 - r - 8, x1 + 8, y0 + r + 8], 180, 360, fill=trim)
            d.pieslice([x0, y0 - r, x1, y0 + r], 180, 360, fill=glass)
        glass_fill(d, (x0, y0, x1, y1), glass)
        if random.random() < 0.5:  # curtains / interiors
            d.rectangle([x0, y0, x0 + (x1 - x0) * random.random(), y0 + (y1 - y0) * 0.4], fill=(140, 132, 120))
        n = st.get("mullions", 1 if (x1 - x0) > S * 0.3 else 0)
        for k in range(1, n + 1):
            mx = x0 + (x1 - x0) * k / (n + 1)
            d.rectangle([mx - 3, y0, mx + 3, y1], fill=trim)
        if st.get("sills"):
            d.rectangle([x0 - 14, y1 + 6, x1 + 14, y1 + 18], fill=trim)
            d.rectangle([x0 - 10, y0 - 22, x1 + 10, y0 - 10], fill=trim)
        dr.rectangle([x0, y0, x1, y1], fill=18)
        dm.rectangle([x0, y0, x1, y1], fill=200)
        if st.get("arch"):
            r = (x1 - x0) / 2
            dr.pieslice([x0, y0 - r, x1, y0 + r], 180, 360, fill=18)
            dm.pieslice([x0, y0 - r, x1, y0 + r], 180, 360, fill=200)
    if st.get("spandrel"):
        d.rectangle([0, int(S * 0.84), S, S], fill=(40, 46, 54))
        dr.rectangle([0, int(S * 0.84), S, S], fill=60); dm.rectangle([0, int(S * 0.84), S, S], fill=255)
    if st.get("balcony"):
        d.rectangle([0, int(S * 0.8), S, int(S * 0.86)], fill=trim)  # slab edge
        for x in range(0, S, 24):
            d.line([x, int(S * 0.62), x, int(S * 0.8)], fill=(70, 74, 78), width=3)  # railing
        d.line([0, int(S * 0.62), S, int(S * 0.62)], fill=(70, 74, 78), width=5)
    alb.save(os.path.join(OUT, "T_Facade%d_D.png" % i))
    rough.save(os.path.join(OUT, "T_Facade%d_R.png" % i))
    metal.save(os.path.join(OUT, "T_Facade%d_M.png" % i))
    # night glow: a random subset of windows lit, 4 floors stacked vertically
    em = Image.new("RGB", (S, S * 4)); de = ImageDraw.Draw(em)
    for row in range(4):
        for (x0, y0, x1, y1) in st["win"]:
            if random.random() < 0.45:
                continue
            a = 0.35 + random.random() * 0.65
            warm = random.random() < 0.75
            col = (int((230 + random.random() * 25) * a), int((170 + random.random() * 40) * a), int((90 + random.random() * 40) * a)) if warm else (int(170 * a), int(200 * a), int(255 * a))
            de.rectangle([x0, y0 + row * S, x1, y1 + row * S], fill=col)
    em.resize((S // 2, S * 2)).save(os.path.join(OUT, "T_Facade%d_E.png" % i))


def shops():
    signs = ["#b8432f", "#2f6db8", "#2f9a6a", "#c9a227", "#7a3fb0", "#d0d0d0"]
    words = ["CAFE", "MARKET", "BAKERY", "PHARMACY", "BOUTIQUE", "DELI"]
    try:
        font = ImageFont.truetype("DejaVuSans-Bold.ttf", 56)
    except Exception:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 56)
        except Exception:
            font = ImageFont.load_default()
    for i, sign in enumerate(signs):
        W, H = 1024, 576
        alb = Image.new("RGB", (W, H), (58, 61, 66)); d = ImageDraw.Draw(alb)
        d.rectangle([0, 0, W, 108], fill=hexc(sign)); d.text((48, 22), words[i], fill=(245, 245, 245), font=font)
        em = Image.new("RGB", (W, H)); de = ImageDraw.Draw(em); de.rectangle([32, 24, 470, 84], fill=hexc(sign))
        rough = Image.new("L", (W, H), 200); dr = ImageDraw.Draw(rough)
        metal = Image.new("L", (W, H), 0); dm = ImageDraw.Draw(metal)
        for k, (x, y, w, h) in enumerate([(32, 140, 600, 400), (660, 140, 140, 400), (828, 140, 164, 400)]):
            glass_fill(d, (x, y, x + w, y + h), (74, 93, 108) if k != 1 else (106, 74, 42), (20, 28, 36) if k != 1 else (106, 74, 42))
            glass_fill(de, (x, y, x + w, y + h), (255, 226, 176) if k != 1 else (60, 40, 20), (201, 138, 74) if k != 1 else (60, 40, 20))
            if k != 1:
                for _ in range(6):
                    xx = x + 20 + random.random() * (w - 80)
                    d.rectangle([xx, y + h * 0.55, xx + 36, y + h * 0.55 + h * 0.45 * random.random()], fill=(120, 116, 108))
                dr.rectangle([x, y, x + w, y + h], fill=20); dm.rectangle([x, y, x + w, y + h], fill=160)
        alb.save(os.path.join(OUT, "T_Shop%d_D.png" % i)); em.save(os.path.join(OUT, "T_Shop%d_E.png" % i))
        rough.save(os.path.join(OUT, "T_Shop%d_R.png" % i)); metal.save(os.path.join(OUT, "T_Shop%d_M.png" % i))


if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for i, st in enumerate(STYLES):
        facade(i, st)
    shops()
    print("wrote %d facade styles + 6 shopfronts to %s" % (len(STYLES), OUT))

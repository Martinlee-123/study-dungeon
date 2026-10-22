#!/usr/bin/env python3
"""生成 PWA 图标：六边形 + 对勾，和页面里的 SVG 一套设计。
用法：python tools/make-icons.py
"""
import math
import os

from PIL import Image, ImageDraw

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
GOLD_TOP = (255, 225, 147)
GOLD_BOT = (217, 147, 44)
INK = (35, 21, 3)


def hexagon(cx, cy, r):
    pts = []
    for i in range(6):
        a = math.radians(90 + i * 60)
        pts.append((cx + r * math.cos(a), cy - r * math.sin(a)))
    return pts


def vertical_gradient(size, top, bottom):
    img = Image.new("RGB", (1, size), top)
    px = img.load()
    for y in range(size):
        t = y / max(1, size - 1)
        px[0, y] = (
            round(top[0] + (bottom[0] - top[0]) * t),
            round(top[1] + (bottom[1] - top[1]) * t),
            round(top[2] + (bottom[2] - top[2]) * t),
        )
    return img.resize((size, size), Image.BILINEAR)


def render(size, radius_ratio, out_path):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))

    r = size * radius_ratio
    cx = cy = size / 2
    poly = hexagon(cx, cy, r)

    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)

    grad = vertical_gradient(size, GOLD_TOP, GOLD_BOT).convert("RGBA")
    img.paste(grad, (0, 0), mask)

    # 细描边，压一下边缘
    ImageDraw.Draw(img).line(poly + [poly[0]], fill=(0, 0, 0, 40), width=max(1, size // 220))

    # 对勾：比例对齐 SVG 里的 7.6,12 → 10.5,14.9 → 16.5,8.8（24 网格）
    scale = size / 24.0
    pts = [(7.6 * scale, 12.0 * scale), (10.5 * scale, 14.9 * scale), (16.5 * scale, 8.8 * scale)]
    width = max(2, int(2.2 * scale))

    check = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(check)
    d.line(pts, fill=INK, width=width, joint="curve")
    cap = width / 2.0
    for (x, y) in (pts[0], pts[-1]):
        d.ellipse([x - cap, y - cap, x + cap, y + cap], fill=INK)

    img = Image.alpha_composite(img, check)
    img.save(out_path, "PNG")
    print("wrote", out_path, img.size)


if __name__ == "__main__":
    render(192, 224 / 512, os.path.join(OUT, "icon-192.png"))
    render(512, 224 / 512, os.path.join(OUT, "icon-512.png"))
    # maskable：内容收进中间 80%，留出被裁的安全区
    render(512, 180 / 512, os.path.join(OUT, "icon-512-maskable.png"))

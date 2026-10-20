#!/usr/bin/env python3
"""CJK 漫画贴字工具（漫画改编产线）

以「气泡 / 旁白框 / 拟声字 / 系统框」四种元素把中文压进画格，而不是贴边方框。

用法：
    python3 漫画改编/工具/贴字.py <spec.json>

spec：
{
  "image": "漫画改编/第08话/P3-加冕.png",
  "output": "漫画改编/第08话/P3-加冕-贴字.png",
  "font": "漫画改编/工具/CJK.ttf",
  "min_font": 20,
  "items": [
    {"type": "bubble", "panel": 2, "at": [0.30, 0.12], "tail": [0.52, 0.42],
     "width": 0.34, "lines": ["苏梨：", "想走的话，", "这个就用不上了。"]},
    {"type": "narr", "panel": 1, "corner": "tl", "width": 0.5, "lines": ["旁白……"]},
    {"type": "sfx", "at": [0.6, 0.78], "text": "咚", "size": 0.09}
  ]
}

- panel：按阅读顺序（先上后下、先左后右）从 1 开始；省略则用整页坐标。
- at / tail / corner / size：相对该格（或整页）宽高的比例。
- bubble 会自动避让画格边缘，文字自动折行并收缩到框内。
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

# 底色透明度：参照第 01 话 P3 的观感，约 6.5 成白，能透出画面纹理。
# 每页可在 spec 里用 "alpha": 0.55~0.8 覆盖。
DEFAULT_ALPHA = 0.56

STYLES = {
    # 第 01 话版式：细边小方框（旁白/心声/画外音）与椭圆气泡（对白）
    "box": {"fill": (255, 255, 255, 168), "ink": (24, 24, 26, 255), "edge": (255, 255, 255, 205), "width": 2},
    "oval": {"fill": (255, 255, 255, 172), "ink": (24, 24, 26, 255), "edge": (255, 255, 255, 205), "width": 2},
    "bubble": {"fill": (255, 255, 255, 244), "ink": (18, 18, 20, 255), "edge": (20, 20, 22, 255), "width": 3},
    "narr": {"fill": (252, 250, 244, 236), "ink": (24, 24, 26, 255), "edge": (24, 24, 26, 255), "width": 3},
    "sys": {"fill": (18, 48, 104, 232), "ink": (235, 246, 255, 255), "edge": (96, 186, 255, 255), "width": 3},
}

NO_LINE_START = "，。、！？：；）」』】…—·%,.!?:;)]}"
NO_LINE_END = "（「『【("


def _is_gutter(px, lo=232, sat=14) -> bool:
    r, g, b = px[0], px[1], px[2]
    return min(r, g, b) >= lo and max(r, g, b) - min(r, g, b) <= sat


def detect_panels(image: Image.Image, min_row_frac=0.9, min_band_frac=0.02, sample=4, spec_get=lambda k, d: d):
    """探测画格矩形，返回阅读顺序的 [(x0, y0, x1, y1), ...]。"""
    img = image.convert("RGB")
    w, h = img.size
    px = img.load()
    xs = list(range(0, w, sample))
    ys = list(range(0, h, sample))

    lo = spec_get("gutter_min", 232)
    sat = spec_get("gutter_sat", 14)

    def row_gutter(y):
        # 页边留白也算分格缝：只看该行非留白像素里是否还有画面内容
        content = [x for x in xs if not _is_gutter(px[x, y], lo, sat)]
        if not content:
            return True
        return (content[-1] - content[0]) / w < 0.55

    def col_gutter(x, y0, y1):
        inner = [y for y in ys if y0 <= y < y1]
        if not inner:
            return False
        content = [y for y in inner if not _is_gutter(px[x, y], lo, sat)]
        if not content:
            return True
        return (content[-1] - content[0]) / max(1, (y1 - y0)) < 0.55

    bands, start = [], None
    for y in range(h):
        content = not row_gutter(y)
        if content and start is None:
            start = y
        elif not content and start is not None:
            bands.append((start, y))
            start = None
    if start is not None:
        bands.append((start, h))
    bands = [(a, b) for a, b in bands if b - a > h * min_band_frac]

    panels = []
    for a, b in bands:
        segs, s0 = [], None
        for x in range(w):
            content = not col_gutter(x, a, b)
            if content and s0 is None:
                s0 = x
            elif not content and s0 is not None:
                segs.append((s0, x))
                s0 = None
        if s0 is not None:
            segs.append((s0, w))
        segs = [(c, d) for c, d in segs if d - c > w * 0.06]
        for c, d in segs:
            panels.append((c, a, d, b))
    return panels, (w, h)


def _wrap(text: str, font: ImageFont.FreeTypeFont, max_w: int):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur)
            cur = ""
            continue
        trial = cur + ch
        if font.getlength(trial) <= max_w or not cur:
            cur = trial
            continue
        if ch in NO_LINE_START and cur:
            cur = trial
            continue
        if cur and cur[-1] in NO_LINE_END:
            lines.append(cur[:-1])
            cur = cur[-1] + ch
            continue
        lines.append(cur)
        cur = ch
    if cur:
        lines.append(cur)
    return lines


def fit_lines(text, font_path, max_w, max_h, start_size, min_size, line_ratio=1.28):
    size = start_size
    while True:
        font = ImageFont.truetype(font_path, size)
        lines = _wrap(text, font, max_w)
        line_h = int(size * line_ratio)
        if (line_h * len(lines) <= max_h and all(font.getlength(l) <= max_w for l in lines)) or size <= min_size:
            return font, lines, line_h
        size -= 2


def draw_bubble(canvas: Image.Image, rect, item, font_path, min_size):
    x0, y0, x1, y1 = rect
    pw, ph = x1 - x0, y1 - y0
    style = STYLES["bubble"]
    box_w = int(pw * item.get("width", 0.4))
    pad = max(10, int(box_w * 0.075))
    inner_w = box_w - 2 * pad
    text = "\n".join(item["lines"])
    font, lines, line_h = fit_lines(text, font_path, inner_w, int(ph * 0.45), int(pw * 0.052), min_size)
    box_h = line_h * len(lines) + 2 * pad

    cx, cy = item["at"]
    bx = x0 + int(pw * cx) - box_w // 2
    by = y0 + int(ph * cy) - box_h // 2
    margin = int(pw * 0.012)
    bx = max(x0 + margin, min(bx, x1 - margin - box_w))
    by = max(y0 + margin, min(by, y1 - margin - box_h))
    bx1, by1 = bx + box_w, by + box_h

    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)

    # 尾巴：底边贴在气泡轮廓上、尖端指向说话者的实心锥形尾
    if item.get("tail"):
        import math
        tx = x0 + int(pw * item["tail"][0])
        ty = y0 + int(ph * item["tail"][1])
        cx0, cy0 = (bx + bx1) // 2, (by + by1) // 2
        # 说话者就在气泡范围内时不画尾巴，避免出现短秃的凸起
        if bx - 6 <= tx <= bx1 + 6 and by - 6 <= ty <= by1 + 6:
            tx = ty = None
    if item.get("tail") and tx is not None:
        max_len = max(box_h * 0.85, ph * 0.20)
        dx, dy = tx - cx0, ty - cy0
        dist = math.hypot(dx, dy) or 1
        if dist > max_len:
            tx, ty = int(cx0 + dx / dist * max_len), int(cy0 + dy / dist * max_len)
            dx, dy = tx - cx0, ty - cy0
            dist = max_len
        ang = math.atan2(dy, dx)
        rx, ry = box_w / 2, box_h / 2
        t = 1.0 / math.sqrt((math.cos(ang) / rx) ** 2 + (math.sin(ang) / ry) ** 2)
        ex, ey = cx0 + t * math.cos(ang), cy0 + t * math.sin(ang)
        half = max(box_w * 0.085, 9)
        # 根部略微内缩进气泡内，保证与气泡融为一体
        bx_in, by_in = cx0 + (ex - cx0) * 0.90, cy0 + (ey - cy0) * 0.90
        nx, ny = -math.sin(ang), math.cos(ang)
        od.polygon([(bx_in + nx * half, by_in + ny * half), (tx, ty),
                    (bx_in - nx * half, by_in - ny * half)],
                   fill=style["fill"], outline=style["edge"])
        od.line([(bx_in + nx * half * 0.92, by_in + ny * half * 0.92), (tx, ty)],
                fill=style["edge"], width=style["width"])
        od.line([(bx_in - nx * half * 0.92, by_in - ny * half * 0.92), (tx, ty)],
                fill=style["edge"], width=style["width"])

    od.rounded_rectangle((bx, by, bx1, by1), radius=int(min(box_w, box_h) * 0.34),
                         fill=style["fill"], outline=style["edge"], width=style["width"])
    canvas.alpha_composite(overlay)

    d = ImageDraw.Draw(canvas)
    ty = by + pad + max(0, (box_h - 2 * pad - line_h * len(lines)) // 2)
    align = item.get("align", "center")
    for line in lines:
        w = font.getlength(line)
        tx = bx + (box_w - w) / 2 if align == "center" else bx + pad
        d.text((tx, ty), line, font=font, fill=style["ink"])
        ty += line_h


def _place(item, x0, y0, pw, ph, box_w, box_h, margin):
    """按 at（中心比例）或 corner 计算框左上角。"""
    if item.get("at"):
        bx = x0 + int(pw * item["at"][0]) - box_w // 2
        by = y0 + int(ph * item["at"][1]) - box_h // 2
        bx = min(max(bx, x0 + margin), x0 + pw - margin - box_w)
        by = min(max(by, y0 + margin), y0 + ph - margin - box_h)
        return bx, by
    corner = item.get("corner", "tl")
    bx = x0 + margin if corner[1] == "l" else x0 + pw - margin - box_w
    by = y0 + margin if corner[0] == "t" else y0 + ph - margin - box_h
    return bx, by


def _draw_tail(od, style, bx, by, box_w, box_h, tip, ph):
    """细锥尾：根窄尖长，根部压进框内，末端指向说话者。"""
    import math
    tx, ty = tip
    cx0, cy0 = bx + box_w // 2, by + box_h // 2
    if bx - 6 <= tx <= bx + box_w + 6 and by - 6 <= ty <= by + box_h + 6:
        return
    max_len = max(box_h * 0.9, ph * 0.20)
    dx, dy = tx - cx0, ty - cy0
    dist = math.hypot(dx, dy) or 1
    if dist > max_len:
        tx, ty = int(cx0 + dx / dist * max_len), int(cy0 + dy / dist * max_len)
        dx, dy, dist = tx - cx0, ty - cy0, max_len
    ang = math.atan2(dy, dx)
    rx, ry = box_w / 2, box_h / 2
    t = 1.0 / math.sqrt((math.cos(ang) / rx) ** 2 + (math.sin(ang) / ry) ** 2)
    ex, ey = cx0 + t * math.cos(ang), cy0 + t * math.sin(ang)
    half = max(box_w * 0.07, 8)
    nx, ny = -math.sin(ang), math.cos(ang)
    ix, iy = cx0 + (ex - cx0) * 0.94, cy0 + (ey - cy0) * 0.94
    od.polygon([(ix + nx * half, iy + ny * half), (tx, ty), (ix - nx * half, iy - ny * half)],
               fill=style["fill"], outline=style["edge"])
    od.line([(ix + nx * half * 0.92, iy + ny * half * 0.92), (tx, ty)],
            fill=style["edge"], width=style["width"])
    od.line([(ix - nx * half * 0.92, iy - ny * half * 0.92), (tx, ty)],
            fill=style["edge"], width=style["width"])


def _style_with_alpha(name, item, alpha):
    base = dict(STYLES[name])
    a = item.get("alpha", alpha)
    r, g, b, _ = base["fill"]
    base["fill"] = (r, g, b, int(255 * max(0.35, min(0.95, a))))
    er, eg, eb, _ = base["edge"]
    base["edge"] = (er, eg, eb, int(255 * max(0.4, min(0.95, a + 0.15))))
    return base


def draw_box(canvas: Image.Image, rect, item, font_path, min_size, alpha=DEFAULT_ALPHA):
    """第 01 话的细边小方框：旁白 / 心声 / 画外音（半透明，不糊画面）。"""
    x0, y0, x1, y1 = rect
    pw, ph = x1 - x0, y1 - y0
    style = _style_with_alpha("box", item, alpha)
    box_w = int(pw * item.get("width", 0.30))
    pad = max(8, int(box_w * 0.055))
    text = "\n".join(item["lines"])
    font, lines, line_h = fit_lines(text, font_path, box_w - 2 * pad, int(ph * 0.34),
                                    int(pw * 0.030), min_size)
    box_h = line_h * len(lines) + 2 * pad
    bx, by = _place(item, x0, y0, pw, ph, box_w, box_h, int(pw * 0.018))
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    if item.get("tail"):
        _draw_tail(od, style, bx, by, box_w, box_h,
                   (x0 + int(pw * item["tail"][0]), y0 + int(ph * item["tail"][1])), ph)
    od.rectangle((bx, by, bx + box_w, by + box_h), fill=style["fill"],
                 outline=style["edge"], width=style["width"])
    canvas.alpha_composite(overlay)
    d = ImageDraw.Draw(canvas)
    ty = by + pad
    for line in lines:
        d.text((bx + pad, ty), line, font=font, fill=style["ink"])
        ty += line_h


def draw_oval(canvas: Image.Image, rect, item, font_path, min_size, alpha=DEFAULT_ALPHA):
    """第 01 话的椭圆气泡：对白（半透明，不糊画面）。"""
    x0, y0, x1, y1 = rect
    pw, ph = x1 - x0, y1 - y0
    style = _style_with_alpha("oval", item, alpha)
    box_w = int(pw * item.get("width", 0.34))
    pad = max(10, int(box_w * 0.10))
    text = "\n".join(item["lines"])
    font, lines, line_h = fit_lines(text, font_path, box_w - 2 * pad, int(ph * 0.36),
                                    int(pw * 0.030), min_size)
    box_h = line_h * len(lines) + 2 * pad
    bx, by = _place(item, x0, y0, pw, ph, box_w, box_h, int(pw * 0.02))
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    if item.get("tail"):
        _draw_tail(od, style, bx, by, box_w, box_h,
                   (x0 + int(pw * item["tail"][0]), y0 + int(ph * item["tail"][1])), ph)
    od.ellipse((bx, by, bx + box_w, by + box_h), fill=style["fill"],
               outline=style["edge"], width=style["width"])
    canvas.alpha_composite(overlay)
    d = ImageDraw.Draw(canvas)
    ty = by + pad + max(0, (box_h - 2 * pad - line_h * len(lines)) // 2)
    for line in lines:
        w = font.getlength(line)
        d.text((bx + (box_w - w) / 2, ty), line, font=font, fill=style["ink"])
        ty += line_h


def draw_narr(canvas: Image.Image, rect, item, font_path, min_size):
    x0, y0, x1, y1 = rect
    pw, ph = x1 - x0, y1 - y0
    style = STYLES["narr"]
    box_w = int(pw * item.get("width", 0.46))
    pad = max(8, int(box_w * 0.04))
    inner_w = box_w - 2 * pad
    text = "\n".join(item["lines"])
    font, lines, line_h = fit_lines(text, font_path, inner_w, int(ph * 0.34), int(pw * 0.040), min_size)
    box_h = line_h * len(lines) + 2 * pad
    margin = int(pw * 0.012)
    corner = item.get("corner", "tl")
    bx = x0 + margin if corner[1] == "l" else x1 - margin - box_w
    by = y0 + margin if corner[0] == "t" else y1 - margin - box_h
    bx1, by1 = bx + box_w, by + box_h
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((bx, by, bx1, by1), fill=style["fill"], outline=style["edge"], width=style["width"])
    canvas.alpha_composite(overlay)
    d = ImageDraw.Draw(canvas)
    ty = by + pad
    for line in lines:
        d.text((bx + pad, ty), line, font=font, fill=style["ink"])
        ty += line_h


def draw_sys(canvas: Image.Image, rect, item, font_path, min_size):
    x0, y0, x1, y1 = rect
    pw, ph = x1 - x0, y1 - y0
    style = STYLES["sys"]
    box_w = int(pw * item.get("width", 0.4))
    pad = max(10, int(box_w * 0.06))
    text = "\n".join(item["lines"])
    font, lines, line_h = fit_lines(text, font_path, box_w - 2 * pad, int(ph * 0.3), int(pw * 0.028), min_size)
    box_h = line_h * len(lines) + 2 * pad
    cx, cy = item.get("at", (0.5, 0.15))
    bx = min(max(x0 + int(pw * cx) - box_w // 2, x0 + 6), x1 - 6 - box_w)
    by = min(max(y0 + int(ph * cy) - box_h // 2, y0 + 6), y1 - 6 - box_h)
    overlay = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.rectangle((bx, by, bx + box_w, by + box_h), fill=style["fill"], outline=style["edge"], width=style["width"])
    canvas.alpha_composite(overlay)
    d = ImageDraw.Draw(canvas)
    ty = by + pad
    for line in lines:
        d.text((bx + pad, ty), line, font=font, fill=style["ink"])
        ty += line_h


def draw_sfx(canvas: Image.Image, rect, item, font_path):
    x0, y0, x1, y1 = rect
    pw, ph = x1 - x0, y1 - y0
    text = item["text"]
    size = int(pw * item.get("size", 0.09))
    font = ImageFont.truetype(font_path, size)
    cx, cy = item.get("at", (0.5, 0.5))
    px, py = x0 + int(pw * cx), y0 + int(ph * cy)
    d = ImageDraw.Draw(canvas)
    fill = tuple(item.get("fill", (255, 255, 255, 255)))
    stroke = tuple(item.get("stroke", (18, 18, 20, 255)))
    w = font.getlength(text)
    d.text((px - w / 2, py - size * 0.65), text, font=font, fill=fill,
           stroke_width=max(2, size // 14), stroke_fill=stroke)


def main(argv):
    if len(argv) != 2:
        print(__doc__)
        return 2
    spec = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    root = Path(spec.get("root", "."))
    canvas = Image.open(root / spec["image"]).convert("RGBA")
    if spec.get("panel_rects"):
        panels, size = [tuple(r) for r in spec["panel_rects"]], canvas.size
    else:
        panels, size = detect_panels(canvas, spec_get=lambda k, d: spec.get(k, d))
    if spec.get("debug_panels"):
        dbg = canvas.copy()
        d = ImageDraw.Draw(dbg)
        for i, r in enumerate(panels, 1):
            d.rectangle(r, outline=(255, 0, 0, 255), width=max(3, size[0] // 400))
            d.text((r[0] + 12, r[1] + 8), str(i), fill=(255, 0, 0, 255))
        dbg.convert("RGB").save(root / spec.get("debug_output", "panels-debug.png"))
        print(f"panels: {panels}")

    font_path = root / spec.get("font", "漫画改编/工具/CJK.ttf")
    min_size = spec.get("min_font", 20)
    alpha = spec.get("alpha", DEFAULT_ALPHA)
    for item in spec["items"]:
        rect = (0, 0, *size) if item.get("panel") is None else panels[item["panel"] - 1]
        kind = item.get("type", "bubble")
        if kind == "bubble":
            draw_bubble(canvas, rect, item, font_path, min_size)
        elif kind == "box":
            draw_box(canvas, rect, item, font_path, min_size, alpha)
        elif kind == "oval":
            draw_oval(canvas, rect, item, font_path, min_size, alpha)
        elif kind == "narr":
            draw_narr(canvas, rect, item, font_path, min_size)
        elif kind == "sys":
            draw_sys(canvas, rect, item, font_path, min_size)
        elif kind == "sfx":
            draw_sfx(canvas, rect, item, font_path)
        else:
            raise SystemExit(f"未知 type: {kind}")

    out = root / spec["output"]
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.convert("RGB").save(out)
    print(f"saved {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

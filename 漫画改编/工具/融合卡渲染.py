#!/usr/bin/env python3
"""融合读本版·补叙/桥接卡渲染器（r61 起·本地合成·0付费调用）。

性质：阅读辅助卡，非发布件。卡面=奶油底+衬线标题+无衬线正文+来源行+页脚，
与 r58 首版卡同族；r61 起正文加量（来龙去脉补叙），溢出自动缩字号。
用法：python3 融合卡渲染.py <manifest.json> <out_dir>
manifest: [{"id","kicker","title","source","paras":[str,...]}]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONTS = Path("/home/user/.cache/drama-tools/fonts")
SERIF = FONTS / "NotoSerifCJKsc-Bold.otf"
SANS = FONTS / "NotoSansCJKsc-Regular.otf"
W, H = 1080, 1440
BG = (245, 239, 228)
INK = (42, 38, 34)
BODY = (51, 48, 43)
GREY = (122, 114, 104)
RULE = (196, 184, 165)
FOOTER = "融合读本版·阅读辅助卡·非发布件·《山下梨花》内部阅读线"


def wrap(draw, text, font, maxw):
    lines, cur = [], ""
    for ch in text:
        if draw.textlength(cur + ch, font=font) <= maxw:
            cur += ch
        else:
            lines.append(cur)
            cur = ch
    if cur:
        lines.append(cur)
    return lines


def render(card: dict, out: Path) -> None:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    mx = 108
    y = 118
    fk = ImageFont.truetype(SANS, 30)
    d.text((mx, y), card["kicker"], font=fk, fill=GREY)
    y += 58
    ft = ImageFont.truetype(SERIF, 56)
    for ln in wrap(d, card["title"], ft, W - 2 * mx):
        d.text((mx, y), ln, font=ft, fill=INK)
        y += 78
    y += 12
    d.line([(mx, y), (W - mx, y)], fill=RULE, width=2)
    y += 26
    fs = ImageFont.truetype(SANS, 28)
    for ln in wrap(d, "来源：" + card["source"], fs, W - 2 * mx):
        d.text((mx, y), ln, font=fs, fill=GREY)
        y += 40
    y += 26
    body_max = H - 150 - y
    size = 38
    while size >= 30:
        fb = ImageFont.truetype(SANS, size)
        lh = int(size * 1.55)
        blocks = []
        total = 0
        for para in card["paras"]:
            lns = wrap(d, para, fb, W - 2 * mx)
            blocks.append(lns)
            total += len(lns) * lh + int(size * 0.7)
        if total <= body_max:
            break
        size -= 2
    for lns in blocks:
        for ln in lns:
            d.text((mx, y), ln, font=fb, fill=BODY)
            y += lh
        y += int(size * 0.7)
    ff = ImageFont.truetype(SANS, 26)
    d.text((mx, H - 92), FOOTER, font=ff, fill=GREY)
    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out)
    print(f"saved {out} (body {size}px)")


def main(argv):
    manifest = json.loads(Path(argv[1]).read_text(encoding="utf-8"))
    outdir = Path(argv[2])
    for card in manifest:
        render(card, outdir / f"{card['id']}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))

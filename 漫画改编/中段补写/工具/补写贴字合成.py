#!/usr/bin/env python3
"""补写单元贴字预览合成器（非 comic_tool 整话管线）。

性质：中段补写单元不是整话/独立发布篇，故不走 comic_tool 的 episode 管线，
本脚本按 贴字规范.md 的既定规则（椭圆对白88底+1px#263238描边、矩形内心/叙述
半透明底深字左对齐、人物字体/同色系字色）把单元格图拼页并贴字，产出**预览页**，
明确非发布件；发布与否另由创作者决定且受接入说明约束。
"""
from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FONTS = Path("/home/user/.cache/drama-tools/fonts")
FONT_MAP = {
    "苏梨": FONTS / "LXGWWenKai-Medium.ttf",
    "霍谢山": FONTS / "NotoSerifCJKsc-Bold.otf",
}
DEFAULT_FONT = FONTS / "NotoSansCJKsc-Regular.otf"
SPEAKERS = {
    "苏梨": ("#843B60", "#F2CDD9"),
    "霍谢山": ("#284F70", "#C4DEF1"),
    "姜月烟": ("#294444", "#F1F5F0"),
    "秦音": ("#654C7C", "#DED3EC"),
    "系统": ("#3B617E", "#D7EAF6"),
    "苏庭渊": ("#6B4A2F", "#F5E9DA"),
    "刘叔": ("#4A4038", "#E8E0D0"),
    "佣人甲": ("#5C4444", "#F0E4E0"),
    "佣人乙": ("#4A445C", "#E4E0EC"),
    "苏澄": ("#7A5A20", "#FFF3D6"),
    "黑衣少年": ("#3A3A3A", "#E0E0E0"),
    "家庭医生": ("#33503A", "#E8F0E8"),
}
NARR_COLOR = "#20282C"
PAGE_W, PAGE_H, SEAM = 1080, 1440, 3
ALPHA = 88


def hexa(rgb: str, a: int) -> tuple[int, int, int, int]:
    v = rgb.lstrip("#")
    return (int(v[0:2], 16), int(v[2:4], 16), int(v[4:6], 16), a)


def parse_story(path: Path) -> dict[str, list[dict]]:
    """page -> panels -> texts（类型/说话人/正文）。"""
    s = path.read_text(encoding="utf-8")
    pages: dict[str, list[dict]] = {}
    cur_p = cur_panel = None
    for line in s.splitlines():
        m = re.match(r"^## (PAGE-\d+)", line)
        if m:
            cur_p = m.group(1)
            pages[cur_p] = []
            cur_panel = None
            continue
        m = re.match(r"^### (PANEL-\d+-\d+)", line)
        if m and cur_p:
            cur_panel = {"id": m.group(1), "texts": []}
            pages[cur_p].append(cur_panel)
            continue
        m = re.match(r"^#### (TEXT-\d+-\d+)", line)
        if m and cur_panel is not None:
            cur_panel["texts"].append({"id": m.group(1), "type": "", "speaker": "", "body": ""})
            continue
        if cur_panel is not None and cur_panel["texts"]:
            t = cur_panel["texts"][-1]
            m = re.match(r"^- 类型：(.+)$", line)
            if m:
                t["type"] = m.group(1).strip()
            m = re.match(r"^- 说话人：(.+)$", line)
            if m:
                t["speaker"] = m.group(1).strip()
            m = re.match(r"^- 正文：(.+)$", line)
            if m:
                t["body"] = m.group(1).strip()
    return pages


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, maxw: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        cur = ""
        for ch in para:
            if draw.textlength(cur + ch, font=font) <= maxw:
                cur += ch
            else:
                lines.append(cur)
                cur = ch
        lines.append(cur)
    return [x for x in lines if x]


def compose(unit: str, pages: dict[str, list[dict]], cells: list[dict], sheet_dir: Path, out_dir: Path) -> list[dict]:
    out_dir.mkdir(parents=True, exist_ok=True)
    by_sheet: dict[str, list[dict]] = {}
    for c in cells:
        if "panel" in c:
            by_sheet.setdefault(c["sheet"], []).append(c)
    manifest = []
    for page, panels in pages.items():
        sheet = f"SHEET-PAGE-{page.split('-')[1]}.png"
        cs = by_sheet.get(sheet, [])
        if len(cs) != len(panels):
            raise SystemExit(f"{unit} {page}: 格数不符 cells={len(cs)} panels={len(panels)}")
        src = Image.open(sheet_dir / sheet).convert("RGB")
        rows: list[list[dict]] = []
        for c in cs:
            if rows and abs(rows[-1][0]["box"][1] - c["box"][1]) < 12:
                rows[-1].append(c)
            else:
                rows.append([c])
        scaled = []
        for row in rows:
            rw = row[-1]["box"][2] - row[0]["box"][0]
            rh = row[0]["box"][3] - row[0]["box"][1]
            h = rh * (PAGE_W / rw)
            scaled.append((row, h))
        k = (PAGE_H - SEAM * (len(scaled) - 1)) / sum(h for _, h in scaled)
        page_img = Image.new("RGB", (PAGE_W, PAGE_H), (255, 255, 255))
        overlay = Image.new("RGBA", (PAGE_W, PAGE_H), (0, 0, 0, 0))
        dy = 0
        rects: list[tuple[int, int, int, int]] = []
        for row, h in scaled:
            hh = int(round(h * k))
            rw = row[-1]["box"][2] - row[0]["box"][0]
            dx = 0
            panel_iter = iter(panels[len(rects):len(rects) + len(row)])
            for c in row:
                x0, y0, x1, y1 = c["box"]
                w = int(round(PAGE_W * (x1 - x0) / rw))
                cell = src.crop((x0, y0, x1, y1)).resize((max(w, 1), hh))
                page_img.paste(cell, (dx, dy))
                panel = next(panel_iter)
                rects.append((dx, dy, dx + w, dy + hh))
                dx += w
            dy += hh + SEAM
        draw = ImageDraw.Draw(page_img)
        odraw = ImageDraw.Draw(overlay)
        boxes: list[dict] = []
        for (px0, py0, px1, py1), panel in zip(rects, panels):
            slot = 0
            for t in panel["texts"]:
                kind = "oval" if t["type"] == "dialogue" else "rect"
                ink, light = SPEAKERS.get(t["speaker"], (NARR_COLOR, "#FFFFFF"))
                if kind == "rect" and t["speaker"] == "无":
                    ink = NARR_COLOR
                fpath = FONT_MAP.get(t["speaker"], DEFAULT_FONT)
                size = 36 if kind == "oval" else 34
                while size >= 26:
                    font = ImageFont.truetype(str(fpath), size)
                    maxw = (px1 - px0 - 48) / (1.414 if kind == "oval" else 1.0)
                    lines = wrap(odraw, t["body"], font, maxw)
                    tw = max(odraw.textlength(x, font=font) for x in lines)
                    th = size * 1.45 * len(lines)
                    if th + 26 <= (py1 - py0) / 2.4:
                        break
                    size -= 2
                if kind == "oval":
                    ew, eh = int(tw * 1.414) + 20, int(th * 1.414) + 16
                    cx = (px0 + px1) // 2
                    cy = py0 + eh // 2 + 10 if slot == 0 else py1 - eh // 2 - 10
                    odraw.ellipse((cx - ew // 2, cy - eh // 2, cx + ew // 2, cy + eh // 2), fill=hexa(light, ALPHA))
                    ty = cy - th // 2
                    tail = [(cx - 14, cy + eh // 2 - 4), (cx + 14, cy + eh // 2 - 4), (cx, cy + eh // 2 + 16)] if slot == 0 else [
                        (cx - 14, cy - eh // 2 + 4), (cx + 14, cy - eh // 2 + 4), (cx, cy - eh // 2 - 16)]
                    odraw.polygon(tail, fill=hexa(light, ALPHA))
                    tx = cx - tw / 2
                    align = "center"
                else:
                    ew, eh = int(tw) + 24, int(th) + 16
                    ex = px0 + 12
                    ey = py0 + 10 if slot == 0 else py1 - eh - 10
                    odraw.rectangle((ex, ey, ex + ew, ey + eh), fill=hexa(light if t["speaker"] != "无" else "#FFFFFF", ALPHA))
                    tx, ty = ex + 12, ey + 8
                    align = "left"
                for i, ln in enumerate(lines):
                    lw = odraw.textlength(ln, font=font)
                    lx = tx if align == "left" else (cx if kind == "oval" else tx) - lw / 2
                    if kind == "oval":
                        odraw.text((lx, ty + i * size * 1.45), ln, font=font, fill=hexa(light, 255),
                                   stroke_width=1, stroke_fill=(0x26, 0x32, 0x38, 255))
                    else:
                        odraw.text((lx, ty + i * size * 1.45), ln, font=font, fill=hexa(ink, 255))
                boxes.append({"panel": panel["id"], "text": t["id"], "kind": kind, "speaker": t["speaker"]})
                slot += 1
        page_img = Image.alpha_composite(page_img.convert("RGBA"), overlay).convert("RGB")
        name = f"{page}.png"
        page_img.save(out_dir / name)
        manifest.append({"page": page, "file": name, "sha256": hashlib.sha256((out_dir / name).read_bytes()).hexdigest(),
                         "boxes": boxes, "panels": len(panels)})
    return manifest


def main() -> None:
    for unit in ("去留补写", "蟹肉补写"):
        base = ROOT / "中段补写" / unit
        pages = parse_story(base / "漫画分镜.md")
        cells = json.loads((base / "制作成果/裁行来源.json").read_text(encoding="utf-8"))[unit]
        out = base / "制作成果/贴字预览-补写"
        man = compose(unit, pages, cells, base / "出图交接/sheet原图", out)
        meta = {"unit": unit, "nature": "补写单元贴字预览，非整话、非发布件；规则源=贴字规范.md（椭圆88底/1px描边/矩形深字/人物字体色）",
                "new_model_calls": 0, "pages": man}
        (base / "制作成果/贴字来源-补写.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
        print(unit, "pages", len(man), "texts", sum(len(m["boxes"]) for m in man))


if __name__ == "__main__":
    main()

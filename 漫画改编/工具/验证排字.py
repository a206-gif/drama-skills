#!/usr/bin/env python3
"""Read current Markdown, measure labelled text, and optionally make starter layouts/sample.

No story text or font binaries live in this helper. It never generates novel illustrations.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "漫画改编"
SPEC = importlib.util.spec_from_file_location("comic_tool", ROOT / "skills/static-comic/scripts/comic_tool.py")
comic = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(comic)
SOURCE_BLOB = "c3e238ef89050c0a715d508f56d65f5e813bdebf"
STORIES = [WORK / "开篇修订" / f"第{i:03d}话" / "漫画分镜.md" for i in range(1, 4)]
DRAFTS = STORIES + [WORK / "中段补写" / name / "漫画分镜.md" for name in ("去留补写", "蟹肉补写")]
# References only, never a second copy of dialogue or narration.
SAMPLE = [(STORIES[0], "TEXT-001-01"), (STORIES[1], "TEXT-007-01"),
          (STORIES[1], "TEXT-007-02"), (STORIES[1], "TEXT-001-02")]


class Fonts:
    def __init__(self, body: Path, speakers: dict[str, Path]):
        from PIL import ImageFont
        self.factory = ImageFont.truetype
        self.body_path = body
        self.speakers = speakers
        self.cache = {}
        for path in [body, *speakers.values()]:
            comic.require(path.is_file(), f"字体不存在: {path}")

    def get(self, source: dict, size: int):
        data = source["fields"]
        label_path = (self.speakers.get(data.get("说话人"), self.body_path)
                      if data["类型"] in {"dialogue", "thought"} else self.body_path)
        result = []
        for key in ((self.body_path, size), (label_path, max(1, round(size * 0.75)))):
            if key not in self.cache:
                self.cache[key] = self.factory(str(key[0]), key[1])
            result.append(self.cache[key])
        return result

    def metrics(self, placement: dict, source: dict):
        body, label = self.get(source, placement["font_size"])
        return comic.letter_metrics(placement, source, body, label)


def source_check() -> None:
    content = (ROOT / "阴湿小狗不语，只一味装乖绿茶 - 三月清梦.txt").read_bytes()
    blob = hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest()
    comic.require(blob == SOURCE_BLOB, "原著文件发生变化，先重新核对修订依据，不复用旧核对结论")


def starter_layout(story: Path, fonts: Fonts) -> dict:
    result = {"version": 1, "storyboard": story.name,
              "canvas": {"width": 1080, "height": 1440, "margin": 48}, "pages": []}
    for page in comic.read_script(story):
        footer_count = sum(p["fields"].get("版式角色") == "推广尾栏" for p in page["panels"])
        comic.require(footer_count <= 1, "每页最多一条推广尾栏")
        count = len(page["panels"]) - footer_count
        room = 1344 - 24 * (len(page["panels"]) - 1) - 192 * footer_count
        height, remainder = divmod(room, count)
        placed, y = [], 48
        for i, panel in enumerate(page["panels"]):
            footer = panel["fields"].get("版式角色") == "推广尾栏"
            ph = 192 if footer else height + (1 if i < remainder else 0)
            item = {"id": panel["id"], "rect": [48, y, 984, ph],
                    "image": f"制作成果/格图/{panel['id']}.png", "texts": []}
            boxes = []
            for text in panel["texts"]:
                size, padding = (36, 12) if footer else (40, 16)
                box = {"id": text["id"], "rect": [24, 0, 936, 4096],
                       "font_size": size, "padding": padding}
                measured = fonts.metrics(box, text)
                scale = math.sqrt(2) if text["fields"]["类型"] == "thought" else 1
                box["rect"][3] = math.ceil(measured["used"] * scale) + 2 * padding + 8
                boxes.append((box, text))
            comic.require(len(boxes) <= 2, f"{panel['id']}: 文字太多，先回分镜增格/分页")
            need = sum(box["rect"][3] for box, _ in boxes) + 16 * max(0, len(boxes) - 1)
            # A pure-text footer has no illustration to reserve; keep 16 px outside its box.
            comic.require(need <= ph - (32 if footer else 48),
                          f"{panel['id']}: 起步版式装不下，先增格/增页，不自动缩字")
            for index, (box, text) in enumerate(boxes):
                box["rect"][1] = (ph - box["rect"][3]) // 2 if footer else 24
                if not footer and index == 1:
                    box["rect"][1] = ph - 24 - box["rect"][3]
                fonts.metrics(box, text)
                item["texts"].append(box)
            placed.append(item)
            y += ph + 24
        result["pages"].append({"id": page["id"], "panels": placed})
    return result


def validate_layout(story: Path, layout: dict, previous: Path | None) -> dict:
    with tempfile.NamedTemporaryFile(mode="w", suffix=".json", encoding="utf-8",
                                     dir=story.parent, delete=False) as temporary:
        path = Path(temporary.name)
        json.dump(layout, temporary, ensure_ascii=False)
    try:
        return comic.summary(comic.load_project(path, previous=previous), False)
    finally:
        path.unlink()


def sample(path: Path, fonts: Fonts) -> None:
    from PIL import Image, ImageDraw
    comic.require(not path.exists(), "样张已存在；选择新文件名，不覆盖旧版")
    source = {}
    for story, identity in SAMPLE:
        if story not in source:
            source[story] = {t["id"]: t for p in comic.read_script(story)
                             for n in p["panels"] for t in n["texts"]}
        comic.require(identity in source[story], f"样张引用已失效: {identity}")
    with Image.new("RGB", (1080, 1440), "white") as image:
        draw = ImageDraw.Draw(image)
        heading = fonts.factory(str(fonts.body_path), 48)
        small = fonts.factory(str(fonts.body_path), 26)
        draw.text((48, 30), "贴字身份样张", font=heading, fill="black")
        draw.text((48, 100), "不连续台词摘取｜仅排字测试，不是小说插画", font=small, fill="black")
        for i, (story, identity) in enumerate(SAMPLE):
            y = 158 + i * 276
            draw.rounded_rectangle((40, y, 1040, y + 260), radius=12,
                                   fill=(237, 240, 244))
            written = source[story][identity]
            text = {"id": identity, "rect": [56, y + 16, 968, 228], "font_size": 40, "padding": 20}
            measured = fonts.metrics(text, written)
            body, _ = fonts.get(written, 40)
            comic.draw_lettering(draw, text, written, body, measured, (0, 0))
        draw.text((48, 1282), "苏梨名签：霞鹜文楷 Medium；霍谢山名签：粗宋体", font=small, fill="black")
        draw.text((48, 1326), "正文统一清晰黑体。每块显示姓名 / 身份与文字类型。", font=small, fill="black")
        draw.text((48, 1370), "图中没有真实人物图；来源 ID 见贴字规范。", font=small, fill="black")
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("xb") as output:
            image.save(output, format="PNG")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--font", type=Path, required=True)
    parser.add_argument("--speaker-font", action="append", default=[])
    parser.add_argument("--write-layouts", action="store_true", help="首次写入三个开篇排版.json，拒绝覆盖")
    parser.add_argument("--sample", type=Path, help="另外输出纯排字样张，不输出小说插画")
    args = parser.parse_args()
    source_check()
    fonts = Fonts(args.font, comic.speaker_font_options(args.speaker_font))
    comic.require({"苏梨", "霍谢山"} <= fonts.speakers.keys(), "本项目两位主角都须指定名签字体")
    faces = [fonts.factory(str(fonts.speakers[name]), 30).getname() for name in ("苏梨", "霍谢山")]
    comic.require(faces[0] != faces[1], "本项目两位主角需实际不同字体，不只改文件名")
    targets = [p.with_name("排版.json") for p in STORIES]
    if args.write_layouts:
        comic.require(all(not p.exists() for p in targets), "排版已存在；人工修订，不覆盖当前版式")
    reports = []
    pending = []
    for i, story in enumerate(STORIES):
        previous = STORIES[i - 1] if i else None
        if args.write_layouts:
            layout = starter_layout(story, fonts)
            reports.append(validate_layout(story, layout, previous))
            pending.append((targets[i], layout))
        else:
            comic.require(targets[i].is_file(), "缺候选排版；首次用 --write-layouts，不自动重建已验收版式")
            plan = comic.load_project(targets[i], previous=previous)
            for page, authored in zip(plan["layout"]["pages"], plan["script"]):
                for panel, source in zip(page["panels"], authored["panels"]):
                    for box, written in zip(panel["texts"], source["texts"]):
                        fonts.metrics(box, written)
            reports.append(comic.summary(plan, False))
    text_count = 0
    for story in DRAFTS:
        for page in comic.read_script(story):
            for panel in page["panels"]:
                for text in panel["texts"]:
                    fonts.metrics({"id": text["id"], "rect": [0, 0, 936, 4096],
                                   "font_size": 40, "padding": 16}, text)
                    text_count += 1
    if args.sample:
        comic.require(not args.sample.exists(), "样张已存在；选择新文件名，不覆盖旧版")
    for target, layout in pending:
        with target.open("x", encoding="utf-8") as output:
            json.dump(layout, output, ensure_ascii=False, indent=2)
            output.write("\n")
    if args.sample:
        sample(args.sample, fonts)
    print(json.dumps({"status": "measured", "source_blob": SOURCE_BLOB, "opening": reports,
                      "glyph_checked_texts": text_count, "speaker_font_faces": faces,
                      "note": "仅字形、字框及开篇相邻记录核对；局部补稿未集成为整话，本工具未核验全套实际格图/手机实图/发布验收"},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

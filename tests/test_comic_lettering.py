"""漫画收尾回归：需要 Pillow；不修改仓库内成品。"""
from __future__ import annotations

import importlib.util
import json
import unittest
import zipfile
from pathlib import Path
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
try:
    from PIL import Image, ImageChops
except ImportError:
    Image = None

if Image is not None:
    spec = importlib.util.spec_from_file_location("comic_lettering", ROOT / "漫画改编/工具/贴字.py")
    lettering = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(lettering)


@unittest.skipIf(Image is None, "漫画贴字测试需要 Pillow")
class ComicLetteringTests(unittest.TestCase):
    def setUp(self):
        self.font = ROOT / "漫画改编/工具/CJK.ttf"

    def test_half_panel_start_respects_min_font(self):
        font, _, _ = lettering.fit_lines("姐姐，帮帮我。", self.font, 400, 200, 15, 26)
        self.assertEqual(font.size, 26)

    def test_shrink_never_steps_below_min_font(self):
        font, _, _ = lettering.fit_lines("测" * 80, self.font, 150, 30, 31, 26)
        self.assertEqual(font.size, 26)

    def test_existing_large_font_is_preserved(self):
        font, _, _ = lettering.fit_lines("继续说。", self.font, 400, 200, 30, 26)
        self.assertEqual(font.size, 30)

    def test_ch11_corrected_source_page_mapping(self):
        with zipfile.ZipFile(ROOT / "漫画改编/P11.zip") as archive:
            for stem, member, panel_count in (
                ("P3-约会", "P11/p11-5.png", 2),
                ("P5-反客为主", "P11/p11-3.png", 1),
            ):
                with self.subTest(page=stem):
                    data = json.loads((ROOT / f"漫画改编/工具/贴字-spec/第11话-{stem}.json").read_text())
                    self.assertEqual(data["source_member"], member)
                    self.assertEqual((ROOT / data["image"]).read_bytes(), archive.read(member))
                    self.assertEqual(len(data["panel_rects"]), panel_count)
        specs = ROOT / "漫画改编/工具/贴字-spec"
        single_pages = [p.stem for p in specs.glob("第11话-*.json")
                        if len(json.loads(p.read_text())["panel_rects"]) == 1]
        self.assertEqual(single_pages, ["第11话-P5-反客为主"])

    def test_closeout_specs_and_rendered_boxes(self):
        specs = ROOT / "漫画改编/工具/贴字-spec"
        paths = sorted(specs.glob("第11话-*.json")) + sorted(specs.glob("第12话-*.json"))
        paths += list(specs.glob("第10话-P4-*.json"))
        self.assertEqual(len(paths), 14)
        for path in paths:
            with self.subTest(page=path.stem):
                data = json.loads(path.read_text(encoding="utf-8"))
                with Image.open(ROOT / data["image"]) as raw:
                    canvas = raw.convert("RGBA")
                with Image.open(ROOT / data["output"]) as out:
                    self.assertEqual(out.size, canvas.size)
                    self.assertEqual(out.mode, "RGB")
                panels = data["panel_rects"]
                # P3 的偏暖细白缝无法由默认检测识别，验证手测坐标及核心白线。
                if path.name == "第11话-P3-约会.json":
                    self.assertEqual(panels, [[0, 0, 1024, 494], [0, 498, 1024, 1536]])
                    for y in (495, 496):
                        for x in range(0, canvas.width, 4):
                            rgb = canvas.getpixel((x, y))[:3]
                            self.assertGreater(min(rgb), 190)
                            self.assertLess(max(rgb) - min(rgb), 40)
                else:
                    self.assertEqual(panels, [list(r) for r in lettering.detect_panels(canvas)[0]])
                lettering.OCCUPIED.clear()
                for i, item in enumerate(data["items"]):
                    self.assertTrue(item["fixed"], "已目检坐标不可再自动漂移")
                    self.assertTrue(item["speaker"], "对白归档需保留说话者")
                    rect = panels[item["panel"] - 1]
                    x0, y0, x1, y1 = rect
                    self.assertTrue(0 <= x0 < x1 <= canvas.width)
                    self.assertTrue(0 <= y0 < y1 <= canvas.height)
                    fit = lettering.fit_lines
                    def checked_fit(text, font_path, max_w, max_h, start_size, min_size):
                        font, lines, line_h = fit(text, font_path, max_w, max_h, start_size, min_size)
                        self.assertGreaterEqual(font.size, min_size)
                        self.assertLessEqual(line_h * len(lines), max_h, f"{i}: 文字过高")
                        for line in lines:
                            self.assertLessEqual(font.getlength(line), max_w, f"{i}: 文字过宽")
                        return font, lines, line_h
                    draw = {"box": lettering.draw_box, "oval": lettering.draw_oval}[item["type"]]
                    with mock.patch.object(lettering, "fit_lines", side_effect=checked_fit):
                        draw(canvas, rect, item, self.font, data["min_font"], data["alpha"])
                    bx, by, bw, bh = lettering.OCCUPIED[-1]
                    self.assertTrue(x0 <= bx and bx + bw <= x1, f"{i}: 水平越界")
                    self.assertTrue(y0 <= by and by + bh <= y1, f"{i}: 垂直越界")
                    for ox, oy, ow, oh in lettering.OCCUPIED[:-1]:
                        overlap = min(bx+bw, ox+ow) > max(bx, ox) and min(by+bh, oy+oh) > max(by, oy)
                        self.assertFalse(overlap, f"{i}: 文字框重叠")
                with Image.open(ROOT / data["output"]) as out:
                    self.assertIsNone(ImageChops.difference(canvas.convert("RGB"), out.convert("RGB")).getbbox(),
                                      "成品与当前 spec 渲染不一致")
                if path.name.startswith(("第11话-", "第12话-")):
                    archive = (ROOT / data["image"]).parent / "分镜对白.md"
                    text = archive.read_text(encoding="utf-8")
                    for item in data["items"]:
                        self.assertIn(item["speaker"] + "：" + "".join(item["lines"]), text)


if __name__ == "__main__":
    unittest.main()

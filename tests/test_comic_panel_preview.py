"""Behavioral checks for the project's bounded single-panel proof, not page publication."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest import mock

from tests.test_static_comic import Image, ImageDraw, ImageFont, ProjectCase, comic, write_story

ROOT = Path(__file__).resolve().parents[1]
TOOL = ROOT / "漫画改编/工具/复现单格.py"
SPEC = importlib.util.spec_from_file_location("single_panel_proof", TOOL)
panel_tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(panel_tool)


@unittest.skipIf(Image is None, "Pillow is optional outside render-required jobs")
class SinglePanelProofTests(ProjectCase):
    def setUp(self) -> None:
        super().setUp()
        self.font = self.root / "body.ttf"
        self.font.write_bytes(ImageFont.load_default().path.getvalue())
        (self.root / "格图").mkdir()
        self.image = self.root / "格图/first.png"
        with Image.new("RGB", (900, 600), (20, 70, 180)) as image:
            image.save(self.image)
        self.layout["lettering"] = {"mode": "embedded", "bubble_opacity": 88}
        self.layout["canvas"]["panel_border_width"] = 0
        self.save()

    def test_only_real_selected_panel_exports_and_missing_rest_is_not_page_success(self) -> None:
        out = self.root / "single-proof"
        report = panel_tool.render_panel(self.path, "PANEL-001-01", self.font, out)
        self.assertEqual(report["scope"], "selected_panel")
        self.assertEqual((report["episode_pages"], report["source_page_panels"]), (2, 2))
        self.assertTrue(report["selected_media_checked"])
        self.assertFalse(report["page_media_checked"])
        self.assertFalse(report["episode_media_checked"])
        self.assertFalse(report["visible_labels"])
        self.assertEqual(set(p.name for p in out.iterdir()), {"PANEL-001-01.png", "来源.json"})
        self.assertEqual([row["id"] for row in report["texts"]], ["TEXT-001-01", "TEXT-001-02"])
        self.assertEqual(report["panel_snapshot"], self.panel())
        with Image.open(out / report["output"]["file"]) as result:
            self.assertEqual(result.size, (360, 260))
            self.assertEqual(result.mode, "RGB")
            self.assertEqual(result.getpixel((0, 0)), (20, 70, 180))
        self.assertEqual(report, json.loads((out / "来源.json").read_text()))
        self.assertEqual(report["output"]["sha256"], hashlib.sha256((out / "PANEL-001-01.png").read_bytes()).hexdigest())
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path, media=True)
        with self.assertRaises(comic.ComicError):
            comic.preview_plan(comic.load_project(self.path), ["PAGE-001"])

    def test_narration_mentioning_a_character_keeps_narrator_font_and_offscreen_dialogue(self) -> None:
        first, second = self.pages[0]["panels"][0]["texts"]
        first.update({"kind": "narration", "speaker": "", "body": "A is gone."})
        second.update({"kind": "dialogue", "speaker": "Guest (offscreen)", "body": "My condolences."})
        write_story(self.story, self.pages)
        self.panel()["texts"][0].pop("tail")
        self.panel()["texts"][1]["tail"] = [359, 215]
        self.layout["lettering"].update({
            "kinds": {"narration": {"shape": "rect", "align": "left", "stroke_width": 0},
                      "dialogue": {"shape": "oval", "stroke_width": 1}},
            "speakers": {"A": {"color": "#813956"}, "Guest (offscreen)": {"dialogue_color": "#F1F3F1"}}})
        self.save()
        custom = self.root / "a-character.ttf"
        custom.write_bytes(self.font.read_bytes())
        calls = []
        original = ImageDraw.ImageDraw.text

        def record(draw, xy, value, *args, **kwargs):
            calls.append((value, Path(kwargs["font"].path), kwargs["fill"]))
            return original(draw, xy, value, *args, **kwargs)

        with mock.patch.object(ImageDraw.ImageDraw, "text", new=record):
            report = panel_tool.render_panel(self.path, "PANEL-001-01", self.font, self.root / "narrator", {"A": custom})
        self.assertEqual(calls, [("A is gone.", self.font, (32, 40, 44, 255)),
                                 ("My condolences.", self.font, (241, 243, 241, 255))])
        self.assertEqual([row["kind"] for row in report["texts"]], ["narration", "dialogue"])
        self.assertEqual({row["font_file"] for row in report["texts"]}, {self.font.name})
        self.assertEqual(report["panel_snapshot"]["texts"][1]["tail"], [359, 215])

    def test_late_glyph_or_unsupported_image_failure_never_leaves_output(self) -> None:
        second = self.pages[0]["panels"][0]["texts"][1]
        second["body"] = "中文正文"
        write_story(self.story, self.pages)
        out = self.root / "missing-glyph"
        with self.assertRaisesRegex(panel_tool.comic.ComicError, "字体缺字"):
            panel_tool.render_panel(self.path, "PANEL-001-01", self.font, out)
        self.assertFalse(out.exists())
        second["body"] = "Not my name."
        write_story(self.story, self.pages)
        with Image.new("RGBA", (900, 600), (20, 70, 180, 90)) as image:
            image.save(self.image)
        out = self.root / "not-rgb"
        with self.assertRaisesRegex(panel_tool.comic.ComicError, "静态RGB PNG"):
            panel_tool.render_panel(self.path, "PANEL-001-01", self.font, out)
        self.assertFalse(out.exists())
        self.assertFalse(list(self.root.glob(".panel-proof-*")))

    def test_cli_refuses_missing_panel_and_reuse_never_overwrites_existing_proof(self) -> None:
        out = self.root / "cli-proof"
        command = [sys.executable, "-B", str(TOOL), str(self.path), "--font", str(self.font), "--out", str(out), "--panel"]
        failed = subprocess.run([*command, "PANEL-001-02"], capture_output=True, text=True, check=False)
        self.assertEqual(failed.returncode, 1)
        self.assertEqual(json.loads(failed.stdout)["status"], "invalid")
        self.assertFalse(out.exists())
        success = subprocess.run([*command, "PANEL-001-01"], capture_output=True, text=True, check=False)
        self.assertEqual(success.returncode, 0, success.stderr + success.stdout)
        self.assertEqual(json.loads(success.stdout)["scope"], "selected_panel")
        before = (out / "PANEL-001-01.png").read_bytes()
        failed = subprocess.run([*command, "PANEL-001-01"], capture_output=True, text=True, check=False)
        self.assertEqual(failed.returncode, 1)
        self.assertEqual(before, (out / "PANEL-001-01.png").read_bytes())
        with self.assertRaisesRegex(panel_tool.comic.ComicError, "唯一格ID"):
            panel_tool.render_panel(self.path, "PANEL-999-99", self.font, self.root / "unknown")

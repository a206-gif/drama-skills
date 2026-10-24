"""Behavioral fixtures for standalone page comics, not prose snapshots."""
from __future__ import annotations

import copy
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

SUITE = Path(__file__).resolve().parents[1]
SKILL = SUITE / "skills/static-comic"
spec = importlib.util.spec_from_file_location("static_comic_tool", SKILL / "scripts/comic_tool.py")
comic = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comic)

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    Image = ImageDraw = ImageFont = None

if os.environ.get("STATIC_COMIC_RENDER_REQUIRED") == "1" and Image is None:
    raise RuntimeError("This job requires Pillow; render regressions must not be skipped")


def authored_pages() -> list[dict]:
    return [
        {"id": "PAGE-001", "panels": [
            {"id": "PANEL-001-01", "texts": [
                {"id": "TEXT-001-01", "kind": "dialogue", "speaker": "A", "body": "A sealed letter."},
                {"id": "TEXT-001-02", "kind": "thought", "speaker": "A", "body": "Not my name."},
            ]},
            {"id": "PANEL-001-02", "texts": []},
        ]},
        {"id": "PAGE-002", "panels": [
            {"id": "PANEL-002-01", "texts": [
                {"id": "TEXT-002-01", "kind": "narration", "speaker": "", "body": "The visitor returns."},
            ]},
        ]},
    ]


FIRST_HEADER = """- 本话编号：CH001
- 连载关系：首话
- 上话编号：无
- 入口状态：A holds the letter at the door.
- 出口状态：The visitor asks for the letter; A still holds it.
- 承接事件：无
- 待续事件：EVT-LETTER-RETURN | PANEL-002-01 | The letter has not changed hands.
"""
SEQUEL_HEADER = """- 本话编号：CH002
- 连载关系：续话
- 上话编号：CH001
- 入口状态：The visitor is still asking A for the letter.
- 出口状态：A has not handed it over yet.
- 承接事件：EVT-LETTER-RETURN | 继续 | PANEL-001-01、TEXT-002-01 | They continue the same conversation.
- 待续事件：EVT-LETTER-RETURN | PANEL-002-01 | The handover is still unfinished.
"""


def write_story(path: Path, pages: list[dict], header: str = FIRST_HEADER) -> None:
    lines = ["# Synthetic comic fixture", "", header.rstrip(), ""]
    for page in pages:
        lines.extend(["## " + page["id"], "- 本页职责：A new fact is revealed."])
        for panel in page["panels"]:
            lines.extend(["### " + panel["id"], "- 来源：Original synthetic fixture.",
                          "- 信息：A is still in possession of the letter.",
                          "- 画面：A person holds a letter.", "- 衔接：The same person continues holding it.",
                          "- 提示词：A silent panel, no text."])
            for text in panel["texts"]:
                lines.extend(["#### " + text["id"], "- 类型：" + text["kind"],
                              "- 说话人：" + text["speaker"], "- 正文：" + text["body"]])
                if text["kind"] == "dialogue":
                    lines.append("- 对话对象：B at the door")
                if text["kind"] == "narration":
                    lines.append("- 叙述身份：Third-person narrator")
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


class LabelContractTests(unittest.TestCase):
    def test_reader_visible_type_and_identity_are_derived_not_authored_twice(self) -> None:
        examples = [
            ({"类型": "dialogue", "说话人": "苏梨"}, "苏梨｜对白"),
            ({"类型": "thought", "说话人": "霍谢山"}, "霍谢山｜内心"),
            ({"类型": "narration", "叙述身份": "第三人称"}, "旁白｜第三人称"),
            ({"类型": "narration", "叙述身份": "推广提示"}, "旁白｜推广提示"),
            ({"类型": "sfx", "正文": "BANG"}, ""),
        ]
        for fields, expected in examples:
            with self.subTest(fields=fields):
                self.assertEqual(comic.visible_label({"fields": fields}), expected)
        self.assertEqual(comic.visible_label({"fields": {"类型": "thought", "说话人": "A"}}, "en"),
                         "A / thought")
        with self.assertRaises(comic.ComicError):
            comic.visible_label({"fields": {"类型": "sfx"}}, "off")

    def test_speaker_fonts_are_explicit_local_paths_not_a_second_script(self) -> None:
        options = comic.speaker_font_options([" 苏梨 = /fonts/female face.ttf ", "霍谢山=male.otf"])
        self.assertEqual(options, {"苏梨": Path("/fonts/female face.ttf"), "霍谢山": Path("male.otf")})
        for values in (["missing separator"], ["=font.ttf"], ["A="], ["A=one.ttf", " A=two.ttf"]):
            with self.subTest(values=values), self.assertRaises(comic.ComicError):
                comic.speaker_font_options(values)


class ProjectCase(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "漫画 项目"
        self.root.mkdir()
        self.story = self.root / "漫画分镜.md"
        self.pages = authored_pages()
        write_story(self.story, self.pages)
        self.path = self.root / "排版.json"
        self.layout = {
            "version": 1,
            "storyboard": self.story.name,
            "canvas": {"width": 400, "height": 600, "margin": 20},
            "pages": [
                {"id": "PAGE-001", "panels": [
                    {"id": "PANEL-001-01", "rect": [20, 20, 360, 260], "image": "格图/first.png", "texts": [
                        {"id": "TEXT-001-01", "rect": [20, 20, 300, 80], "font_size": 24, "padding": 12, "tail": [340, 110]},
                        {"id": "TEXT-001-02", "rect": [20, 140, 300, 100], "font_size": 24, "padding": 12},
                    ]},
                    {"id": "PANEL-001-02", "rect": [20, 300, 360, 280], "image": "格图/second.png", "texts": []},
                ]},
                {"id": "PAGE-002", "panels": [
                    {"id": "PANEL-002-01", "rect": [20, 20, 360, 560], "image": "格图/third.png", "texts": [
                        {"id": "TEXT-002-01", "rect": [20, 20, 300, 100], "font_size": 24, "padding": 12},
                    ]},
                ]},
            ],
        }
        self.save()

    def save(self) -> None:
        self.path.write_text(json.dumps(self.layout, ensure_ascii=False), encoding="utf-8")

    def panel(self) -> dict:
        return self.layout["pages"][0]["panels"][0]


class StructureTests(ProjectCase):
    def test_embedded_profile_is_optional_and_validates_exact_typed_styles(self) -> None:
        self.assertEqual(comic.lettering_config(self.layout)["mode"], "labelled")
        good = {"mode": "embedded", "bubble_opacity": 88,
                "speakers": {"A": {"color": "#813956", "dialogue_shape": "round", "thought_shape": "none"}}}
        self.layout["lettering"] = good
        self.save()
        self.assertEqual(comic.lettering_config(comic.load_project(self.path)["layout"]), good)
        bad = [None, [], {"mode": []}, {"mode": "off"}, {"mode": "embedded", "bubble_opacity": True},
               {"mode": "embedded", "bubble_opacity": -1}, {"mode": "embedded", "bubble_opacity": 256},
               {"mode": "embedded", "speakers": []}, {"mode": "embedded", "speakers": {" A ": {}}},
               {"mode": "embedded", "speakers": {"A": {"color": "red"}}},
               {"mode": "embedded", "speakers": {"A": {"color": [1, 2, 3]}}},
               {"mode": "embedded", "speakers": {"A": {"thought_shape": []}}},
               {"mode": "embedded", "speakers": {"A": {"body": "another script"}}},
               {"mode": "labelled", "bubble_opacity": 100}]
        for profile in bad:
            with self.subTest(profile=profile), self.assertRaises(comic.ComicError):
                self.layout["lettering"] = profile
                self.save()
                comic.load_project(self.path)

    def test_optional_panel_border_width_accepts_zero_and_rejects_untyped_values(self) -> None:
        for width in (0, 1, 9):
            self.layout["canvas"]["panel_border_width"] = width
            self.save()
            self.assertEqual(comic.load_project(self.path)["layout"]["canvas"]["panel_border_width"], width)
        for width in (False, True, -1, "0", [], None, 65):
            with self.subTest(width=width), self.assertRaises(comic.ComicError):
                self.layout["canvas"]["panel_border_width"] = width
                self.save()
                comic.load_project(self.path)

    def test_kind_style_contract_and_speaker_color_precedence(self) -> None:
        profile = {"mode": "embedded", "kinds": {
            "dialogue": {"shape": "oval", "align": "center", "color": "#102030", "stroke_width": 1,
                         "stroke_color": "#203040", "outline_color": "#FFFFFF"},
            "thought": {"shape": "rect", "align": "left", "stroke_width": 0}},
            "speakers": {"A": {"color": "#813956", "dialogue_color": "#F2CDD9", "thought_color": "#704060"}}}
        self.layout["lettering"] = profile
        self.save()
        config = comic.lettering_config(comic.load_project(self.path)["layout"])
        source = comic.read_script(self.story)[0]["panels"][0]["texts"]
        dialogue, thought = [comic.lettering_style(config, item) for item in source]
        self.assertEqual((dialogue["shape"], dialogue["color"], dialogue["stroke_width"]),
                         ("oval", "#F2CDD9", 1))
        self.assertEqual((thought["shape"], thought["align"], thought["color"]),
                         ("rect", "left", "#704060"))
        bad = [{"kinds": []}, {"kinds": {"unknown": {}}}, {"kinds": {"thought": []}},
               {"kinds": {"thought": {"shape": []}}}, {"kinds": {"thought": {"align": []}}},
               {"kinds": {"thought": {"align": "right"}}}, {"kinds": {"thought": {"stroke_width": True}}},
               {"kinds": {"thought": {"stroke_width": -1}}}, {"kinds": {"thought": {"stroke_width": 9}}},
               {"kinds": {"thought": {"stroke_color": "white"}}},
               {"kinds": {"thought": {"outline_color": []}}}, {"kinds": {"thought": {"body": "copied"}}},
               {"speakers": {"A": {"dialogue_color": []}}}]
        for extra in bad:
            with self.subTest(extra=extra), self.assertRaises(comic.ComicError):
                self.layout["lettering"] = {"mode": "embedded", **extra}
                self.save()
                comic.load_project(self.path)

    def test_explicit_breaks_reference_source_positions_without_copying_body(self) -> None:
        text = self.panel()["texts"][0]
        text["breaks"] = [2, 9]
        self.save()
        comic.load_project(self.path)
        length = len(self.pages[0]["panels"][0]["texts"][0]["body"])
        for points in (None, "2", [True], [0], [length], [4, 2], [2, 2], [1.5]):
            with self.subTest(points=points), self.assertRaises(comic.ComicError):
                text["breaks"] = points
                self.save()
                comic.load_project(self.path)
        for value, points in (("AB,CD", [2]), ("AB(CD", [3])):
            with self.subTest(value=value), self.assertRaises(comic.ComicError):
                comic.check_breaks(value, points, "fixture")

    def test_shipped_example_is_a_valid_text_only_handoff(self) -> None:
        plan = comic.load_project(SKILL / "assets/page-layout.example.json")
        result = comic.summary(plan, media=False)
        self.assertEqual((result["pages"], result["panels"], result["texts"]), (2, 7, 7))
        self.assertFalse(result["media_checked"])
        with self.assertRaises(comic.ComicError):
            comic.load_project(SKILL / "assets/page-layout.example.json", media=True)

    def test_planned_end_card_cannot_disappear_from_shipped_layout(self) -> None:
        shutil.copyfile(SKILL / "assets/漫画分镜.md", self.story)
        self.layout = json.loads((SKILL / "assets/page-layout.example.json").read_text(encoding="utf-8"))
        self.save()
        plan = comic.load_project(self.path)
        final_source = plan["script"][-1]["panels"][-1]["texts"][-1]
        omitted = self.layout["pages"][-1]["panels"][-1]["texts"].pop()
        self.assertEqual(omitted["id"], final_source["id"])
        self.save()
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path)

    def test_no_media_dependency_for_planning_but_missing_media_is_not_ready(self) -> None:
        self.assertEqual(comic.summary(comic.load_project(self.path), False)["panels"], 3)
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path, media=True)

    def test_omitted_duplicate_reordered_and_cross_panel_text_ids_fail(self) -> None:
        original = copy.deepcopy(self.layout)
        mutations = [
            lambda d: d["pages"].pop(),
            lambda d: d["pages"].reverse(),
            lambda d: d["pages"][0]["panels"].reverse(),
            lambda d: d["pages"][0]["panels"][0]["texts"].pop(),
            lambda d: d["pages"][0]["panels"][0]["texts"].reverse(),
            lambda d: d["pages"][0]["panels"][1]["texts"].append(d["pages"][0]["panels"][0]["texts"][0]),
        ]
        for mutation in mutations:
            with self.subTest(mutation=mutations.index(mutation)):
                self.layout = copy.deepcopy(original)
                mutation(self.layout)
                self.save()
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)

    def test_bad_source_structure_and_truncated_continuations_are_rejected(self) -> None:
        baseline = self.story.read_text(encoding="utf-8")
        for level in ("missing_picture", "duplicate_id", "wrong_parent", "missing_speaker", "multiline"):
            with self.subTest(case=level):
                pages = authored_pages()
                if level == "duplicate_id":
                    pages[0]["panels"][0]["texts"][1]["id"] = pages[0]["panels"][0]["texts"][0]["id"]
                if level == "wrong_parent":
                    pages[0]["panels"][0]["id"] = "PANEL-002-01"
                if level == "missing_speaker":
                    pages[0]["panels"][0]["texts"][0]["speaker"] = ""
                write_story(self.story, pages)
                if level == "missing_picture":
                    lines = self.story.read_text(encoding="utf-8").splitlines()
                    self.story.write_text("\n".join(line for line in lines if not line.startswith("- 画面：")), encoding="utf-8")
                if level == "multiline":
                    self.story.write_text(baseline + "This continuation must not silently disappear.\n", encoding="utf-8")
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)

    def test_panel_intersections_bounds_and_wrong_geometric_reading_order_fail(self) -> None:
        for box in ([0, 20, 360, 260], [20, 20, 0, 200], [20, 20, 361, 260],
                    [20, 20, 360, -1], [20, 20, 360, 600], [20, 20, True, 260]):
            with self.subTest(rect=box):
                self.panel()["rect"] = box
                self.save()
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)
        self.panel()["rect"] = [20, 20, 360, 260]
        self.layout["pages"][0]["panels"][1]["rect"] = [20, 200, 360, 280]
        self.save()
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path)
        # No overlap, but the second authored panel is physically above the first.
        self.panel()["rect"] = [20, 300, 360, 280]
        self.layout["pages"][0]["panels"][1]["rect"] = [20, 20, 360, 260]
        self.save()
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path)

    def test_text_overlap_overflow_invalid_padding_and_bad_tails_fail(self) -> None:
        original = copy.deepcopy(self.layout)
        bad_values = [
            ("rect", [20, 20, 400, 100]), ("rect", [20, 150, 300, 80]),
            ("padding", 40), ("font_size", True), ("font_size", 0),
            ("tail", [350, 270]), ("tail", [30, 30]), ("tail", [True, 250]),
        ]
        for key, value in bad_values:
            with self.subTest(key=key, value=value):
                self.layout = copy.deepcopy(original)
                self.panel()["texts"][0][key] = value
                self.save()
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)

    def test_paths_cannot_escape_even_when_media_is_not_required(self) -> None:
        for value in ("../outside.png", "/outside.png", "C:/outside.png", "格图\\a.png", "格图/../a.png", "格图//a.png"):
            with self.subTest(path=value):
                self.panel()["image"] = value
                self.save()
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)

    def test_symlink_escape_is_rejected(self) -> None:
        outside = self.root.parent / "outside"
        outside.mkdir()
        try:
            (self.root / "escape").symlink_to(outside, target_is_directory=True)
        except OSError as exc:
            self.skipTest(f"symlinks unavailable: {exc}")
        self.panel()["image"] = "escape/one.png"
        self.save()
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path)

    def test_typographical_fields_do_not_create_a_second_dialogue_source(self) -> None:
        self.panel()["texts"][0]["body"] = "This must be rejected, not rendered."
        self.save()
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path)

    def test_numeric_and_json_errors_fail_cleanly(self) -> None:
        original = copy.deepcopy(self.layout)
        for value in (True, 0, -1, 9000, 1.5, "1080", None):
            with self.subTest(width=value):
                self.layout = copy.deepcopy(original)
                self.layout["canvas"]["width"] = value
                self.save()
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)
        self.layout = copy.deepcopy(original)
        for focus in ([float("nan"), 0.5], [True, 0.5], [-0.1, 0.5], [0.5, 2], [0.5]):
            with self.subTest(focus=focus):
                self.panel()["focus"] = focus
                self.save()
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)
        self.path.write_text('{"version": 1, "version": 1}', encoding="utf-8")
        with self.assertRaises(comic.ComicError):
            comic.load_project(self.path)

    def test_chinese_wrap_preserves_all_characters_and_punctuation_boundaries(self) -> None:
        class Monospace:
            def getbbox(self, value):
                return (0, 0, len(value) * 10, 20)

            def getlength(self, value):
                return len(value) * 10

        body = "甲（乙）丙，丁。"
        lines = comic.wrap_text(body, Monospace(), 30)
        self.assertGreater(len(lines), 1)
        self.assertEqual("".join(lines), body)
        for line in lines:
            self.assertNotIn(line[0], comic.NO_START)
            self.assertNotIn(line[-1], comic.NO_END)
            self.assertLessEqual(len(line) * 10, 30)
        with self.assertRaises(comic.ComicError):
            comic.wrap_text("甲，乙", Monospace(), 10)

    def test_cli_runs_from_unrelated_cwd_with_only_this_skill_and_utf8_output(self) -> None:
        isolated = self.root.parent / "isolated skill"
        shutil.copytree(SKILL, isolated)
        cwd = self.root.parent / "unrelated cwd"
        cwd.mkdir()
        env = dict(os.environ, PYTHONIOENCODING="cp1252", PYTHONDONTWRITEBYTECODE="1")
        result = subprocess.run([sys.executable, "-O", str(isolated / "scripts/comic_tool.py"),
                                 "check", str(self.path)], cwd=cwd, env=env,
                                capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["status"], "valid")
        self.panel()["rect"][2] = -1
        self.save()
        result = subprocess.run([sys.executable, "-O", str(isolated / "scripts/comic_tool.py"),
                                 "check", str(self.path)], cwd=cwd, env=env,
                                capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["status"], "invalid")


class PreviewStructureTests(ProjectCase):
    def make_selected_media(self, identities) -> None:
        for page in self.layout["pages"]:
            if page["id"] in identities:
                for panel in page["panels"]:
                    path = self.root / panel["image"]
                    path.parent.mkdir(exist_ok=True)
                    path.write_bytes(b"existence check only; decode belongs to render")

    def test_image_window_is_optional_and_rejects_outside_or_non_integer_rectangles(self) -> None:
        self.assertNotIn("image_rect", comic.load_project(self.path)["layout"]["pages"][0]["panels"][0])
        self.panel()["image_rect"] = [10, 100, 340, 150]
        self.save()
        comic.load_project(self.path)
        for box in ([0, 0, 0, 30], [-1, 0, 20, 30], [0, 0, 361, 30],
                    [0, 250, 20, 11], [True, 0, 20, 30], [0.5, 0, 20, 30],
                    [0, 0, 20], "0,0,20,30", None):
            with self.subTest(box=box), self.assertRaises(comic.ComicError):
                self.panel()["image_rect"] = box
                self.save()
                comic.load_project(self.path)

    def test_preview_selects_in_story_order_without_mutating_full_plan(self) -> None:
        self.make_selected_media(["PAGE-001", "PAGE-002"])
        plan = comic.load_project(self.path)
        before = copy.deepcopy(plan["layout"])
        selected = comic.preview_plan(plan, ["PAGE-002", "PAGE-001"])
        self.assertEqual([p["id"] for p in selected["layout"]["pages"]], ["PAGE-001", "PAGE-002"])
        one = comic.preview_plan(plan, ["PAGE-002"])
        self.assertEqual(one["script"][0]["id"], "PAGE-002")
        self.assertEqual(one["continuity"], plan["continuity"])
        self.assertEqual(plan["layout"], before)
        self.assertEqual(len(plan["script"]), 2)

    def test_preview_requires_explicit_known_unique_page_ids(self) -> None:
        plan = comic.load_project(self.path)
        for identities in ([], None, "PAGE-001", [False], [1], ["PAGE-003"], ["PAGE-001", "PAGE-001"]):
            with self.subTest(identities=identities), self.assertRaises(comic.ComicError):
                comic.preview_plan(plan, identities)

    def test_missing_other_pages_do_not_block_preview_but_still_block_full_media_check(self) -> None:
        self.make_selected_media(["PAGE-002"])
        plan = comic.load_project(self.path)
        self.assertEqual(len(comic.preview_plan(plan, ["PAGE-002"])["layout"]["pages"]), 1)
        with self.assertRaisesRegex(comic.ComicError, "PANEL-001-01"):
            comic.load_project(self.path, media=True)
        with self.assertRaisesRegex(comic.ComicError, "PANEL-001-01"):
            comic.preview_plan(plan, ["PAGE-001"])

    def test_preview_cannot_skip_invalid_structure_on_unselected_pages(self) -> None:
        self.make_selected_media(["PAGE-002"])
        self.panel()["rect"][0] = -1
        self.save()
        with self.assertRaises(comic.ComicError):
            comic.preview_plan(comic.load_project(self.path), ["PAGE-002"])


class ContinuityTests(ProjectCase):
    def continuation(self, header: str = SEQUEL_HEADER) -> Path:
        previous = self.root.parent / "第001话 中文" / "漫画分镜.md"
        previous.parent.mkdir(exist_ok=True)
        write_story(previous, authored_pages())
        write_story(self.story, self.pages, header)
        return previous

    def test_required_information_and_explicit_text_roles_cannot_be_blank(self) -> None:
        original = self.story.read_text(encoding="utf-8")
        for key in ("信息", "衔接", "对话对象", "叙述身份", "说话人"):
            for replacement in (None, ""):
                with self.subTest(field=key, replacement=replacement):
                    lines = [line if not line.startswith(f"- {key}：") else f"- {key}："
                             for line in original.splitlines()
                             if replacement is not None or not line.startswith(f"- {key}：")]
                    self.story.write_text("\n".join(lines), encoding="utf-8")
                    with self.assertRaisesRegex(comic.ComicError, key):
                        comic.load_project(self.path)
        for key in ("对话对象", "叙述身份", "说话人"):
            with self.subTest(field=key, value="无"):
                lines = [f"- {key}：无" if line.startswith(f"- {key}：") else line
                         for line in original.splitlines()]
                self.story.write_text("\n".join(lines), encoding="utf-8")
                with self.assertRaisesRegex(comic.ComicError, key):
                    comic.load_project(self.path)

    def test_episode_header_is_mandatory_and_never_read_from_later_panels(self) -> None:
        original = self.story.read_text(encoding="utf-8")
        for key in ("本话编号", "连载关系", "上话编号", "入口状态", "出口状态", "承接事件", "待续事件"):
            with self.subTest(field=key):
                lines = [line for line in original.splitlines() if not line.startswith(f"- {key}：")]
                # A misplaced metadata field cannot satisfy the header contract.
                self.story.write_text("\n".join(lines) + f"\n- {key}：late field\n", encoding="utf-8")
                with self.assertRaisesRegex(comic.ComicError, key):
                    comic.load_project(self.path)

    def test_malformed_duplicate_empty_and_unanchored_event_records_fail(self) -> None:
        for bad_header in (
            FIRST_HEADER + "- 本话编号：CH001\n",
            FIRST_HEADER.replace("- 入口状态：A holds the letter at the door.", "- 入口状态："),
            FIRST_HEADER.replace("CH001", "CH000"),
            FIRST_HEADER.replace("CH001", "CH002"),
            FIRST_HEADER.replace("CH001", "CH１"),
            FIRST_HEADER.replace("首话", "new"),
            FIRST_HEADER + "- 承接事件：无\n",
            FIRST_HEADER + "- 待续事件：无\n",
            FIRST_HEADER + "- 待续事件：EVT-LETTER-RETURN | TEXT-001-01 | duplicate\n",
            FIRST_HEADER.replace("EVT-LETTER-RETURN", "evt-letter"),
            FIRST_HEADER.replace("PANEL-002-01 | The letter", "PAGE-002 | The letter"),
            FIRST_HEADER.replace("PANEL-002-01 | The letter", "TEXT-099-99 | The letter"),
            FIRST_HEADER.replace("PANEL-002-01 | The letter", "PANEL-002-01、 | The letter"),
            FIRST_HEADER.replace("| The letter has not changed hands.", "|"),
            FIRST_HEADER.replace("EVT-LETTER-RETURN | PANEL-002-01", "EVT-LETTER-RETURN"),
            FIRST_HEADER.replace("- 待续事件：EVT-LETTER-RETURN", "- 待续事件：无\n- 待续事件：EVT-LETTER-RETURN"),
        ):
            with self.subTest(header=bad_header):
                write_story(self.story, self.pages, bad_header)
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path)

    def test_continuation_requires_the_actual_previous_file(self) -> None:
        previous = self.continuation()
        with self.assertRaisesRegex(comic.ComicError, "--previous"):
            comic.load_project(self.path)
        report = comic.summary(comic.load_project(self.path, previous=previous), False)
        self.assertEqual((report["episode"], report["checked_previous"]), ("CH002", "CH001"))
        self.assertEqual(report["pending_events"], ["EVT-LETTER-RETURN"])

    def test_explicitly_deferred_event_must_remain_pending(self) -> None:
        header = SEQUEL_HEADER.replace("| 继续 |", "| 明确暂缓 |")
        previous = self.continuation(header)
        self.assertIn("EVT-LETTER-RETURN", comic.load_project(self.path, previous=previous)["continuity"]["outgoing"])
        for status in ("继续", "明确暂缓"):
            with self.subTest(status=status):
                bad = header.replace("| 明确暂缓 |", f"| {status} |")
                bad = "\n".join(line for line in bad.splitlines() if not line.startswith("- 待续事件："))
                write_story(self.story, self.pages, bad + "\n- 待续事件：无\n")
                with self.assertRaisesRegex(comic.ComicError, "必须保留待续"):
                    comic.load_project(self.path, previous=previous)

    def test_resolved_event_is_removed_from_pending_not_from_incoming(self) -> None:
        header = SEQUEL_HEADER.replace("| 继续 |", "| 解决 |")
        previous = self.continuation(header)
        with self.assertRaisesRegex(comic.ComicError, "已解决不能同时待续"):
            comic.load_project(self.path, previous=previous)
        header = "\n".join(line for line in header.splitlines() if not line.startswith("- 待续事件："))
        write_story(self.story, self.pages, header + "\n- 待续事件：无\n")
        report = comic.summary(comic.load_project(self.path, previous=previous), False)
        self.assertEqual(report["pending_events"], [])
        self.assertEqual(report["checked_previous"], "CH001")

    def test_disappeared_renamed_or_phantom_incoming_events_fail(self) -> None:
        previous = self.continuation()
        without = "\n".join(line for line in SEQUEL_HEADER.splitlines()
                            if not line.startswith(("- 承接事件：", "- 待续事件：")))
        candidates = [
            without + "\n- 承接事件：无\n- 待续事件：无\n",
            SEQUEL_HEADER.replace("EVT-LETTER-RETURN", "EVT-RENAMED"),
            SEQUEL_HEADER + "- 承接事件：EVT-PHANTOM | 解决 | TEXT-001-01 | Not in the previous episode.\n",
        ]
        for header in candidates:
            with self.subTest(header=header):
                write_story(self.story, self.pages, header)
                with self.assertRaisesRegex(comic.ComicError, "跨话事件未对齐"):
                    comic.load_project(self.path, previous=previous)

    def test_incoming_status_and_local_proof_references_are_checked(self) -> None:
        previous = self.continuation()
        for old, new in (("| 继续 |", "| 忽略 |"),
                         ("PANEL-001-01、TEXT-002-01", "TEXT-123-99"),
                         ("PANEL-001-01、TEXT-002-01", "制作备注"),
                         ("| They continue the same conversation.", "|")):
            with self.subTest(value=new):
                write_story(self.story, self.pages, SEQUEL_HEADER.replace(old, new))
                with self.assertRaises(comic.ComicError):
                    comic.load_project(self.path, previous=previous)
        write_story(self.story, self.pages, SEQUEL_HEADER +
                    "- 承接事件：EVT-LETTER-RETURN | 继续 | PANEL-001-01 | duplicate\n")
        with self.assertRaisesRegex(comic.ComicError, "重复事件"):
            comic.load_project(self.path, previous=previous)

    def test_wrong_previous_skipped_episode_and_self_reference_fail(self) -> None:
        previous = self.continuation()
        for header, pattern in ((SEQUEL_HEADER.replace("上话编号：CH001", "上话编号：CH007"), "实际提供"),
                                (SEQUEL_HEADER.replace("本话编号：CH002", "本话编号：CH003"), "不能跳话")):
            with self.subTest(header=header):
                write_story(self.story, self.pages, header)
                with self.assertRaisesRegex(comic.ComicError, pattern):
                    comic.load_project(self.path, previous=previous)
        write_story(self.story, self.pages, SEQUEL_HEADER)
        with self.assertRaisesRegex(comic.ComicError, "不能指向本话自己"):
            comic.load_project(self.path, previous=self.story)

    def test_previous_is_reread_not_cached_or_inferred_from_filename(self) -> None:
        previous = self.continuation()
        comic.load_project(self.path, previous=previous)
        extra = "- 待续事件：EVT-NEW-QUESTION | TEXT-002-01 | This was added after the first check.\n"
        write_story(previous, authored_pages(), FIRST_HEADER + extra)
        with self.assertRaisesRegex(comic.ComicError, "EVT-NEW-QUESTION"):
            comic.load_project(self.path, previous=previous)

    def test_a_malformed_previous_header_cannot_be_used_as_an_empty_handoff(self) -> None:
        previous = self.continuation()
        header = "\n".join(line for line in FIRST_HEADER.splitlines() if not line.startswith("- 待续事件："))
        write_story(previous, authored_pages(), header)
        with self.assertRaisesRegex(comic.ComicError, "缺少待续事件"):
            comic.load_project(self.path, previous=previous)

    def test_independent_or_first_episode_cannot_silently_ignore_supplied_previous(self) -> None:
        previous = self.continuation()
        write_story(self.story, self.pages)
        with self.assertRaisesRegex(comic.ComicError, "提供了上话"):
            comic.load_project(self.path, previous=previous)
        header = FIRST_HEADER.replace("首话", "独立篇").replace("CH001", "CH007")
        write_story(self.story, self.pages, header)
        with self.assertRaisesRegex(comic.ComicError, "独立篇依据"):
            comic.load_project(self.path)
        write_story(self.story, self.pages, header + "- 独立篇依据：Synthetic creator brief approved independent excerpts.\n")
        self.assertIsNone(comic.load_project(self.path)["continuity"]["checked_previous"])
        with self.assertRaisesRegex(comic.ComicError, "提供了上话"):
            comic.load_project(self.path, previous=previous)

    def test_pair_check_does_not_claim_recursive_full_series_validation(self) -> None:
        previous = self.continuation(SEQUEL_HEADER.replace("CH002", "CH003").replace("上话编号：CH001", "上话编号：CH002"))
        write_story(previous, authored_pages(), SEQUEL_HEADER)
        result = comic.summary(comic.load_project(self.path, previous=previous), False)
        self.assertEqual((result["episode"], result["checked_previous"]), ("CH003", "CH002"))
        self.assertNotIn("series_validated", result)

    def test_shipped_pair_preserves_event_identity_across_resolution_and_continuation(self) -> None:
        previous = SKILL / "assets/漫画分镜.md"
        plan = comic.load_project(SKILL / "assets/续话示例/排版.json", previous=previous)
        result = comic.summary(plan, False)
        self.assertEqual((result["pages"], result["panels"], result["texts"]), (3, 9, 10))
        self.assertEqual(result["checked_previous"], "CH001")
        self.assertEqual(set(plan["continuity"]["incoming"]),
                         set(comic.load_project(SKILL / "assets/page-layout.example.json")["continuity"]["outgoing"]))
        self.assertEqual(result["pending_events"], ["EVT-MISSING-RETURN"])

    def test_cli_continuation_checks_external_previous_from_unrelated_cwd_and_reports_missing_file(self) -> None:
        previous = self.continuation()
        command = [sys.executable, "-O", str(SKILL / "scripts/comic_tool.py"), "check", str(self.path)]
        result = subprocess.run(command, cwd=self.root.parent, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--previous", json.loads(result.stdout)["error"])
        for source, expected in ((previous, 0), (self.root / "not-found.md", 1)):
            with self.subTest(previous=source):
                result = subprocess.run(command + ["--previous", str(source)], cwd=self.root.parent,
                                        capture_output=True, encoding="utf-8", check=False)
                self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
                if expected == 0:
                    self.assertEqual(json.loads(result.stdout)["checked_previous"], "CH001")
                else:
                    self.assertEqual(json.loads(result.stdout)["status"], "invalid")


@unittest.skipUnless(Image is not None, "optional Pillow is not installed")
class RenderTests(ProjectCase):
    def setUp(self) -> None:
        super().setUp()
        self.font = self.root / "fixture-font.ttf"
        self.font.write_bytes(ImageFont.load_default().path.getvalue())
        (self.root / "格图").mkdir()
        for name, color in (("first", (20, 70, 180)), ("second", (160, 60, 20)), ("third", (20, 120, 80))):
            with Image.new("RGB", (900, 600), color) as image:
                image.save(self.root / f"格图/{name}.png")

    def export(self, name: str = "发布-v1", image_format: str = "png", speaker_fonts=None) -> dict:
        return comic.render(comic.load_project(self.path, media=True), self.font, self.root / name,
                            image_format, speaker_fonts=speaker_fonts, label_language="en")

    def embedded(self, opacity=88, speakers=None) -> None:
        self.layout["lettering"] = {"mode": "embedded", "bubble_opacity": opacity,
                                    "speakers": speakers or {}}
        self.save()

    def test_embedded_draws_full_body_in_speaker_font_and_color_without_labels(self) -> None:
        custom = self.root / "speaker-body.ttf"
        custom.write_bytes(self.font.read_bytes())
        self.embedded(speakers={"A": {"color": "#813956", "thought_shape": "none"}})
        calls = []
        original = ImageDraw.ImageDraw.text

        def record(draw, xy, value, *args, **kwargs):
            calls.append((value, Path(kwargs["font"].path), kwargs["fill"]))
            return original(draw, xy, value, *args, **kwargs)

        with mock.patch.object(ImageDraw.ImageDraw, "text", new=record):
            report = self.export(speaker_fonts={"A": custom})
        for value in ("A sealed letter.", "Not my name."):
            self.assertIn((value, custom, (129, 57, 86, 255)), calls)
        self.assertEqual({value for value, _, _ in calls},
                         {"A sealed letter.", "Not my name.", "The visitor returns."})
        self.assertFalse(report["visible_labels"])
        self.assertEqual(report["lettering_mode"], "embedded")

    def test_embedded_alpha_is_composited_over_art_not_applied_to_text(self) -> None:
        for opacity in (0, 128, 255):
            with self.subTest(opacity=opacity):
                self.embedded(opacity, {"A": {"color": "#813956"}})
                report = self.export("opacity-" + str(opacity))
                with Image.open(report["outputs"][0]) as image:
                    expected = tuple(round((v * (255 - opacity) + 255 * opacity) / 255)
                                     for v in (20, 70, 180))
                    self.assertEqual(image.getpixel((65, 55)), expected)
                    self.assertIn((129, 57, 86), image.crop((40, 40, 340, 120)).getdata())

    def test_embedded_free_thought_does_not_paint_a_background_panel(self) -> None:
        self.embedded(255, {"A": {"thought_shape": "none"}})
        report = self.export()
        with Image.open(report["outputs"][0]) as image:
            self.assertEqual(image.getpixel((190, 175)), (20, 70, 180))
            self.assertNotEqual(image.getpixel((65, 55)), (20, 70, 180))

    def test_hidden_identity_glyphs_are_not_required_but_body_glyphs_still_are(self) -> None:
        self.embedded()
        self.pages[0]["panels"][0]["texts"][0]["speaker"] = "中文姓名"
        write_story(self.story, self.pages)
        self.export("hidden-identity")
        self.pages[0]["panels"][0]["texts"][0]["body"] = "中文正文"
        write_story(self.story, self.pages)
        with self.assertRaisesRegex(comic.ComicError, "字体缺字"):
            self.export("missing-body-glyph")
        self.assertFalse((self.root / "missing-body-glyph").exists())

    def test_embedded_missing_speaker_body_font_fails_before_any_output(self) -> None:
        self.embedded()
        with self.assertRaisesRegex(comic.ComicError, "专属字体不存在"):
            self.export(speaker_fonts={"A": self.root / "absent.ttf"})
        self.assertFalse((self.root / "发布-v1").exists())

    def test_explicit_labelled_mode_is_pixel_identical_to_legacy_default(self) -> None:
        before = self.export("legacy-default")
        self.layout["lettering"] = {"mode": "labelled"}
        self.save()
        after = self.export("explicit-labelled")
        for a, b in zip(before["outputs"], after["outputs"]):
            with Image.open(a) as first, Image.open(b) as second:
                self.assertEqual(first.tobytes(), second.tobytes())

    def test_manual_breaks_draw_complete_source_once_in_requested_segments(self) -> None:
        self.embedded()
        self.pages[0]["panels"][0]["texts"][0]["body"] = "ABCDEFGH"
        write_story(self.story, self.pages)
        self.panel()["texts"][0]["breaks"] = [4]
        self.panel()["texts"][0]["rect"][3] = 110
        self.save()
        calls = []
        original = ImageDraw.ImageDraw.text

        def record(draw, xy, value, *args, **kwargs):
            calls.append(value)
            return original(draw, xy, value, *args, **kwargs)

        with mock.patch.object(ImageDraw.ImageDraw, "text", new=record):
            self.export()
        self.assertEqual(calls[:2], ["ABCD", "EFGH"])
        self.assertEqual("".join(calls[:2]), self.pages[0]["panels"][0]["texts"][0]["body"])

    def test_embedded_body_can_fit_where_nameplate_mode_cannot_without_shrinking(self) -> None:
        self.embedded()
        self.panel()["texts"][0]["rect"][3] = 48
        self.save()
        self.export()
        self.assertEqual(self.panel()["texts"][0]["font_size"], 24)

    def test_embedded_oval_shape_changes_painted_pixels_and_safe_text_space(self) -> None:
        self.embedded(speakers={"A": {"dialogue_shape": "round"}})
        a = self.export("round")
        self.embedded(speakers={"A": {"dialogue_shape": "oval"}})
        b = self.export("oval")
        with Image.open(a["outputs"][0]) as first, Image.open(b["outputs"][0]) as second:
            self.assertNotEqual(first.crop((40, 40, 340, 120)).tobytes(),
                                second.crop((40, 40, 340, 120)).tobytes())

    def test_embedded_preview_cli_preserves_partial_scope_and_no_label_claim(self) -> None:
        self.embedded()
        out = self.root / "embedded-cli"
        command = [sys.executable, str(SKILL / "scripts/comic_tool.py"), "preview", str(self.path),
                   "--page", "PAGE-001", "--font", str(self.font), "--out", str(out)]
        result = subprocess.run(command, capture_output=True, text=True, check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["lettering_mode"], "embedded")
        self.assertFalse(report["visible_labels"])
        self.assertFalse(report["episode_media_checked"])
        self.assertEqual(report["selected_pages"], ["PAGE-001"])

    def test_kind_styles_draw_left_captions_and_light_speech_without_name_labels(self) -> None:
        self.embedded(128, {"A": {"color": "#813956", "dialogue_color": "#F2CDD9"}})
        self.layout["lettering"]["kinds"] = {
            "dialogue": {"shape": "oval", "stroke_width": 1, "stroke_color": "#263238"},
            "thought": {"shape": "rect", "align": "left", "stroke_width": 0, "outline_color": "#FFFFFF"},
            "narration": {"shape": "rect", "align": "left", "stroke_width": 0, "color": "#102030"}}
        self.save()
        calls = {}
        original = ImageDraw.ImageDraw.text

        def record(draw, xy, value, *args, **kwargs):
            calls[value] = (xy, kwargs)
            return original(draw, xy, value, *args, **kwargs)

        with mock.patch.object(ImageDraw.ImageDraw, "text", new=record):
            result = self.export()
        self.assertEqual(set(calls), {"A sealed letter.", "Not my name.", "The visitor returns."})
        self.assertEqual(calls["A sealed letter."][1]["fill"], (242, 205, 217, 255))
        self.assertEqual(calls["A sealed letter."][1]["stroke_width"], 1)
        for body, color in (("Not my name.", (129, 57, 86, 255)),
                            ("The visitor returns.", (16, 32, 48, 255))):
            xy, options = calls[body]
            self.assertEqual(options["fill"], color)
            self.assertEqual(options["stroke_width"], 0)
            self.assertEqual(xy[0], 32 - options["font"].getbbox(body, anchor="ls")[0])
        with Image.open(result["outputs"][0]) as image:
            self.assertEqual(image.getpixel((42, 42)), (20, 70, 180))  # Outside the oval.
            self.assertEqual(image.getpixel((42, 162)), (138, 163, 218))  # Translucent rectangle.
            self.assertEqual(image.getpixel((42, 160)), (91, 126, 203))  # Its configured light edge.

    def test_border_free_full_bleed_and_three_pixel_gutter_are_real_pixels(self) -> None:
        self.embedded()
        self.layout["canvas"].update({"margin": 0, "panel_border_width": 0})
        self.panel()["rect"] = [0, 0, 400, 298]
        self.layout["pages"][0]["panels"][1]["rect"] = [0, 301, 400, 299]
        self.layout["pages"][1]["panels"][0]["rect"] = [0, 0, 400, 600]
        self.save()
        result = self.export()
        with Image.open(result["outputs"][0]) as image:
            for point in ((0, 0), (399, 0), (0, 297), (399, 297)):
                self.assertEqual(image.getpixel(point), (20, 70, 180))
            for y in (298, 299, 300):
                self.assertEqual(set(image.crop((0, y, 400, y + 1)).getdata()), {(255, 255, 255)})
            self.assertEqual(image.getpixel((0, 301)), (160, 60, 20))
            self.assertEqual(image.getpixel((399, 599)), (160, 60, 20))

    def test_explicit_defaults_preserve_existing_embedded_and_panel_pixels(self) -> None:
        self.embedded(speakers={"A": {"thought_shape": "none"}})
        before = self.export("implicit-style")
        self.layout["canvas"]["panel_border_width"] = 3
        self.layout["lettering"]["kinds"] = {
            "dialogue": {"shape": "round", "align": "center", "stroke_width": 2, "stroke_color": "#FFFFFF"},
            "thought": {"shape": "none", "align": "left", "stroke_width": 2, "stroke_color": "#FFFFFF"}}
        self.save()
        after = self.export("explicit-style")
        for first, second in zip(before["outputs"], after["outputs"]):
            with Image.open(first) as a, Image.open(second) as b:
                self.assertEqual(a.tobytes(), b.tobytes())

    def test_configured_stroke_is_measured_and_failure_does_not_shrink_or_export(self) -> None:
        self.embedded()
        self.pages[0]["panels"][0]["texts"][0]["body"] = "AB"
        write_story(self.story, self.pages)
        box = self.panel()["texts"][0]
        box.update({"rect": [20, 20, 200, 23], "padding": 0})
        self.layout["lettering"]["kinds"] = {"dialogue": {"shape": "rect", "stroke_width": 0}}
        self.save()
        self.export("no-stroke")
        self.layout["lettering"]["kinds"]["dialogue"]["stroke_width"] = 4
        self.save()
        with self.assertRaisesRegex(comic.ComicError, "文字高度溢出"):
            self.export("stroke-overflow")
        self.assertEqual(box["font_size"], 24)
        self.assertFalse((self.root / "stroke-overflow").exists())

    def test_left_oval_uses_safe_inset_and_speech_tail_starts_on_ellipse(self) -> None:
        self.embedded()
        self.layout["lettering"]["kinds"] = {"dialogue": {"shape": "oval", "align": "left"}}
        self.save()
        texts, polygons = [], []
        original_text, original_polygon = ImageDraw.ImageDraw.text, ImageDraw.ImageDraw.polygon

        def record_text(draw, xy, value, *args, **kwargs):
            if value == "A sealed letter.":
                texts.append((xy, kwargs["font"]))
            return original_text(draw, xy, value, *args, **kwargs)

        def record_polygon(draw, xy, *args, **kwargs):
            polygons.append(xy)
            return original_polygon(draw, xy, *args, **kwargs)

        with mock.patch.object(ImageDraw.ImageDraw, "text", new=record_text), \
                mock.patch.object(ImageDraw.ImageDraw, "polygon", new=record_polygon):
            self.export()
        source = comic.read_script(self.story)[0]["panels"][0]["texts"][0]
        config = comic.lettering_config(self.layout)
        metrics = comic.letter_metrics(self.panel()["texts"][0], source, texts[0][1],
                                       style=comic.lettering_style(config, source))
        expected = 20 + (300 - metrics["inner_width"]) / 2 - texts[0][1].getbbox(source["fields"]["正文"], anchor="ls")[0]
        self.assertEqual(texts[0][0][0], expected)
        base = polygons[0][:2]
        bx, by = ((base[0][i] + base[1][i]) / 2 for i in (0, 1))
        ellipse_distance = ((bx - 170) / 150) ** 2 + ((by - 60) / 40) ** 2
        self.assertGreater(ellipse_distance, 0.65)
        self.assertLess(ellipse_distance, 1)

    def test_embedded_late_image_error_remains_transactional(self) -> None:
        self.embedded()
        (self.root / "格图/third.png").write_bytes(b"not an image")
        with self.assertRaises((OSError, comic.ComicError)):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())

    def test_labels_are_actually_drawn_and_only_nameplates_use_speaker_font(self) -> None:
        custom = self.root / "speaker.ttf"
        custom.write_bytes(self.font.read_bytes())
        calls = []
        original = ImageDraw.ImageDraw.text

        def record(draw, xy, value, *args, **kwargs):
            calls.append((value, Path(kwargs["font"].path)))
            return original(draw, xy, value, *args, **kwargs)

        with mock.patch.object(ImageDraw.ImageDraw, "text", new=record):
            report = self.export(speaker_fonts={"A": custom})
        for value in ("A / dialogue", "A / thought"):
            self.assertIn((value, custom), calls)
        for value in ("A sealed letter.", "Not my name."):
            self.assertIn((value, self.font), calls)
        self.assertTrue(any(value.startswith("Narration /") and path == self.font for value, path in calls))
        self.assertEqual(report["visible_labels"], "en")
        self.assertEqual(report["speaker_font_names"], ["A"])

    def test_identity_changes_repaint_without_changing_body_or_layout(self) -> None:
        before = self.export("before-rename")
        self.pages[0]["panels"][0]["texts"][0]["speaker"] = "B"
        write_story(self.story, self.pages)
        after = self.export("after-rename")
        with Image.open(before["outputs"][0]) as a, Image.open(after["outputs"][0]) as b:
            self.assertNotEqual(a.crop((40, 40, 340, 120)).tobytes(),
                                b.crop((40, 40, 340, 120)).tobytes())
        self.assertEqual(json.loads(self.path.read_text()), self.layout)
        self.assertEqual(self.pages[0]["panels"][0]["texts"][0]["body"], "A sealed letter.")

    def test_labels_count_toward_height_instead_of_covering_body(self) -> None:
        self.panel()["texts"][0]["rect"][3] = 48  # The body alone fits; its nameplate does not.
        self.save()
        with self.assertRaisesRegex(comic.ComicError, "高度溢出.*名签"):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())

    def test_long_nameplate_is_wrapped_measured_and_refused_if_it_cannot_fit(self) -> None:
        self.pages[0]["panels"][0]["texts"][0]["speaker"] = "Very long identity " * 30
        write_story(self.story, self.pages)
        with self.assertRaisesRegex(comic.ComicError, "名签"):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())

    def test_label_glyphs_are_checked_even_when_the_body_is_ascii(self) -> None:
        self.pages[0]["panels"][0]["texts"][0]["speaker"] = "苏梨"
        write_story(self.story, self.pages)
        with self.assertRaisesRegex(comic.ComicError, "名签.*缺字"):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())

    def test_missing_custom_nameplate_font_is_not_silently_replaced(self) -> None:
        with self.assertRaisesRegex(comic.ComicError, "专属名签字体不存在"):
            self.export(speaker_fonts={"A": self.root / "absent.ttf"})
        self.assertFalse((self.root / "发布-v1").exists())

    def test_cli_rejects_invalid_font_bindings_and_does_not_export(self) -> None:
        for values in (("bad-value",), ("A=one.ttf", "A=two.ttf")):
            command = [sys.executable, str(SKILL / "scripts/comic_tool.py"), "render", str(self.path),
                       "--font", str(self.font), "--out", str(self.root / "bad-font-options")]
            for value in values:
                command.extend(["--speaker-font", value])
            result = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(result.returncode, 1)
            self.assertIn("--speaker-font", json.loads(result.stdout)["error"])
            self.assertFalse((self.root / "bad-font-options").exists())

    def test_exports_ordered_static_rgb_png_and_jpg_using_real_images(self) -> None:
        for image_format in ("png", "jpg"):
            with self.subTest(image_format=image_format):
                result = self.export("发布-" + image_format, image_format)
                self.assertEqual(result["status"], "rendered")
                self.assertEqual([Path(p).name for p in result["outputs"]],
                                 [f"PAGE-001.{image_format}", f"PAGE-002.{image_format}"])
                for path in result["outputs"]:
                    with Image.open(path) as image:
                        self.assertEqual((image.mode, image.size, getattr(image, "n_frames", 1)), ("RGB", (400, 600), 1))
                        self.assertFalse(image.getexif())
                        self.assertEqual(image.getpixel((0, 0)), (255, 255, 255))
                with Image.open(result["outputs"][0]) as image:
                    pixel = image.getpixel((100, 260))
                    self.assertTrue(all(abs(a - b) < 5 for a, b in zip(pixel, (20, 70, 180))))

    def test_text_is_read_from_current_markdown_without_layout_copy(self) -> None:
        first = self.export("发布-first")
        self.pages[0]["panels"][0]["texts"][0]["body"] = "The letter is open."
        write_story(self.story, self.pages)
        second = self.export("发布-second")
        with Image.open(first["outputs"][0]) as before, Image.open(second["outputs"][0]) as after:
            self.assertNotEqual(before.crop((40, 40, 340, 120)).tobytes(),
                                after.crop((40, 40, 340, 120)).tobytes())
        self.assertEqual(json.loads(self.path.read_text(encoding="utf-8")), self.layout)

    def test_crop_focus_changes_the_view_without_mutating_source(self) -> None:
        source = self.root / "格图/first.png"
        with Image.new("RGB", (900, 300), "red") as image:
            ImageDraw.Draw(image).rectangle((450, 0, 899, 299), fill="blue")
            image.save(source)
        original = source.read_bytes()
        pixels = []
        for focus, output in ((0, "left"), (1, "right")):
            self.panel()["focus"] = [focus, 0.5]
            self.save()
            result = self.export(output)
            with Image.open(result["outputs"][0]) as image:
                pixels.append(image.getpixel((200, 260)))
        self.assertEqual(pixels, [(255, 0, 0), (0, 0, 255)])
        self.assertEqual(source.read_bytes(), original)

    def test_overflow_refuses_whole_batch_instead_of_shrinking_or_dropping_words(self) -> None:
        self.pages[1]["panels"][0]["texts"][0]["body"] = "Very long dialogue. " * 50
        write_story(self.story, self.pages)
        original = self.story.read_bytes()
        with self.assertRaises(comic.ComicError):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())
        self.assertFalse(list(self.root.glob(".comic-render-*")))
        self.assertEqual(self.story.read_bytes(), original)

    def test_late_corrupt_image_does_not_leave_partially_exported_pages(self) -> None:
        (self.root / "格图/third.png").write_bytes(b"nonempty but not an image")
        with self.assertRaises((comic.ComicError, OSError)):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())
        self.assertFalse(list(self.root.glob(".comic-render-*")))

    def test_animated_input_is_not_silently_converted_to_a_static_first_frame(self) -> None:
        with Image.new("RGB", (80, 80), "red") as a, Image.new("RGB", (80, 80), "blue") as b:
            a.save(self.root / "格图/third.png", save_all=True, append_images=[b], duration=100, loop=0)
        with self.assertRaises(comic.ComicError):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())

    def test_explicit_font_and_glyph_coverage_are_required(self) -> None:
        with self.assertRaises(comic.ComicError):
            comic.render(comic.load_project(self.path, media=True), self.root / "missing.ttf", self.root / "out", "png")
        self.pages[1]["panels"][0]["texts"][0]["body"] = "门外的人"
        write_story(self.story, self.pages)
        with self.assertRaises(comic.ComicError):
            self.export()
        self.assertFalse((self.root / "发布-v1").exists())

    def test_existing_output_and_original_media_are_never_overwritten(self) -> None:
        destination = self.root / "发布-v1"
        destination.mkdir()
        marker = destination / "creator-file.txt"
        marker.write_text("keep", encoding="utf-8")
        original = (self.root / "格图/first.png").read_bytes()
        with self.assertRaises(comic.ComicError):
            self.export()
        self.assertEqual(marker.read_text(encoding="utf-8"), "keep")
        with self.assertRaises(comic.ComicError):
            comic.render(comic.load_project(self.path, media=True), self.font, self.root / "格图/first.png", "png")
        self.assertEqual((self.root / "格图/first.png").read_bytes(), original)

    def test_transparent_input_uses_white_instead_of_black_backing(self) -> None:
        with Image.new("RGBA", (900, 600), (0, 0, 0, 0)) as image:
            image.save(self.root / "格图/first.png")
        result = self.export()
        with Image.open(result["outputs"][0]) as image:
            self.assertEqual(image.getpixel((100, 260)), (255, 255, 255))

    def test_exif_orientation_is_applied_before_cropping(self) -> None:
        image_path = self.root / "格图/oriented.jpg"
        with Image.new("RGB", (600, 300), "red") as original:
            ImageDraw.Draw(original).rectangle((300, 0, 599, 299), fill="blue")
            exif = original.getexif()
            exif[274] = 6
            original.save(image_path, quality=100, subsampling=0, exif=exif)
        before = image_path.read_bytes()
        self.panel()["image"] = "格图/oriented.jpg"
        self.save()
        result = self.export()
        with Image.open(result["outputs"][0]) as image:
            red, _, blue = image.getpixel((100, 260))
            self.assertGreater(blue, 240)
            self.assertLess(red, 10)
            self.assertFalse(image.getexif())
        self.assertEqual(image_path.read_bytes(), before)

    def test_sfx_is_lettered_without_an_opaque_balloon(self) -> None:
        self.pages[0]["panels"][0]["texts"][0]["kind"] = "sfx"
        self.panel()["texts"][0].pop("tail")
        self.save()
        write_story(self.story, self.pages)
        result = self.export()
        with Image.open(result["outputs"][0]) as image:
            self.assertEqual(image.getpixel((45, 45)), (20, 70, 180))
            colors = image.crop((50, 50, 330, 110)).getcolors(100_000)
            self.assertTrue(any(color == (0, 0, 0) for _, color in colors))

    def test_decoder_resource_error_is_a_validation_error_and_leaves_no_batch(self) -> None:
        with mock.patch.object(Image, "open", side_effect=Image.DecompressionBombError("oversized fixture")):
            with self.assertRaises(comic.ComicError):
                self.export()
        self.assertFalse((self.root / "发布-v1").exists())
        self.assertFalse(list(self.root.glob(".comic-render-*")))

    def test_independent_search_caption_is_rendered_on_the_final_page(self) -> None:
        self.pages[-1]["panels"][-1]["texts"].append({
            "id": "TEXT-002-02", "kind": "narration", "speaker": "", "body": "Search: Example Novel",
        })
        self.layout["pages"][-1]["panels"][-1]["texts"].append({
            "id": "TEXT-002-02", "rect": [20, 420, 320, 100], "font_size": 24, "padding": 12,
        })
        write_story(self.story, self.pages)
        self.save()
        result = self.export()
        with Image.open(result["outputs"][-1]) as image:
            self.assertEqual(image.getpixel((45, 445)), (255, 255, 255))
            colors = image.crop((50, 450, 350, 530)).getcolors(100_000)
            self.assertTrue(any(color == (0, 0, 0) for _, color in colors))
        self.assertEqual(self.pages[-1]["panels"][-1]["texts"][-1]["body"],
                         comic.load_project(self.path)["script"][-1]["panels"][-1]["texts"][-1]["fields"]["正文"])

    def test_cli_render_of_sequel_requires_previous_and_rejects_lost_events_before_export(self) -> None:
        previous = self.root.parent / "previous.md"
        write_story(previous, authored_pages())
        write_story(self.story, self.pages, SEQUEL_HEADER)
        out = self.root / "sequel-export"
        command = [sys.executable, "-O", str(SKILL / "scripts/comic_tool.py"), "render", str(self.path),
                   "--font", str(self.font), "--label-language", "en", "--out", str(out)]
        result = subprocess.run(command, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--previous", json.loads(result.stdout)["error"])
        self.assertFalse(out.exists())
        bad = SEQUEL_HEADER.replace("EVT-LETTER-RETURN", "EVT-RENAMED")
        write_story(self.story, self.pages, bad)
        result = subprocess.run(command + ["--previous", str(previous)], capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("跨话事件未对齐", json.loads(result.stdout)["error"])
        self.assertFalse(out.exists())
        write_story(self.story, self.pages, SEQUEL_HEADER)
        result = subprocess.run(command + ["--previous", str(previous)], capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual((report["episode"], report["checked_previous"]), ("CH002", "CH001"))
        with Image.open(report["outputs"][0]) as image:
            self.assertEqual((image.mode, image.size), ("RGB", (400, 600)))

    def test_cli_render_produces_images_not_video(self) -> None:
        result = subprocess.run([sys.executable, str(SKILL / "scripts/comic_tool.py"), "render", str(self.path),
                                 "--font", str(self.font), "--label-language", "en", "--out", str(self.root / "cli-output"), "--format", "jpg"],
                                cwd=self.root.parent, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual(report["status"], "rendered")
        self.assertEqual(sorted(p.suffix for p in (self.root / "cli-output").iterdir()), [".jpg", ".jpg"])


    def test_image_window_leaves_text_space_and_retains_legacy_full_bleed(self) -> None:
        self.pages[0]["panels"][0]["texts"] = []
        self.panel()["texts"] = []
        write_story(self.story, self.pages)
        self.save()
        source = (self.root / "格图/first.png").read_bytes()
        legacy = self.export("legacy")
        self.panel()["image_rect"] = [20, 20, 320, 180]
        self.save()
        windowed = self.export("windowed")
        with Image.open(legacy["outputs"][0]) as old, Image.open(windowed["outputs"][0]) as new:
            self.assertEqual(old.getpixel((200, 260)), (20, 70, 180))
            self.assertEqual(new.getpixel((200, 260)), (255, 255, 255))
            self.assertEqual(new.getpixel((200, 130)), (20, 70, 180))
            self.assertEqual(new.getpixel((20, 20)), (0, 0, 0))
        self.assertEqual((self.root / "格图/first.png").read_bytes(), source)

    def test_library_preview_keeps_partial_scope_without_cli_postprocessing(self) -> None:
        (self.root / "格图/first.png").unlink()
        plan = comic.preview_plan(comic.load_project(self.path), ["PAGE-002"])
        nested = comic.preview_plan(plan, ["PAGE-002"])
        self.assertEqual(nested["preview_scope"]["episode_pages"], 2)
        report = comic.render(nested, self.font, self.root / "library-preview", "png", label_language="en")
        self.assertEqual(report["status"], "preview_rendered")
        self.assertEqual(report["episode_pages"], 2)
        self.assertEqual(report["selected_pages"], ["PAGE-002"])
        self.assertFalse(report["episode_media_checked"])
        self.assertTrue(report["selected_media_checked"])

    def test_cli_preview_of_ready_page_reports_partial_scope_and_refuses_overwrite(self) -> None:
        (self.root / "格图/first.png").unlink()
        (self.root / "格图/second.png").unlink()
        with self.assertRaises(comic.ComicError):
            self.export("not-complete")
        out = self.root / "preview"
        command = [sys.executable, "-O", str(SKILL / "scripts/comic_tool.py"), "preview", str(self.path),
                   "--page", "PAGE-002", "--font", str(self.font), "--label-language", "en", "--out", str(out)]
        result = subprocess.run(command, cwd=self.root.parent, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        report = json.loads(result.stdout)
        self.assertEqual((report["status"], report["pages"], report["episode_pages"]), ("preview_rendered", 1, 2))
        self.assertEqual(report["selected_pages"], ["PAGE-002"])
        self.assertFalse(report["episode_media_checked"])
        self.assertTrue(report["selected_media_checked"])
        self.assertEqual([p.name for p in out.iterdir()], ["PAGE-002.png"])
        before = (out / "PAGE-002.png").read_bytes()
        again = subprocess.run(command, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(again.returncode, 1)
        self.assertEqual((out / "PAGE-002.png").read_bytes(), before)
        self.assertFalse((self.root / "not-complete").exists())

    def test_preview_of_sequel_still_requires_actual_previous_and_matching_events(self) -> None:
        previous = self.root.parent / "previous.md"
        write_story(previous, authored_pages())
        write_story(self.story, self.pages, SEQUEL_HEADER)
        out = self.root / "preview-sequel"
        command = [sys.executable, str(SKILL / "scripts/comic_tool.py"), "preview", str(self.path),
                   "--page", "PAGE-002", "--font", str(self.font), "--label-language", "en", "--out", str(out)]
        result = subprocess.run(command, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--previous", json.loads(result.stdout)["error"])
        write_story(self.story, self.pages, SEQUEL_HEADER.replace("EVT-LETTER-RETURN", "EVT-RENAMED"))
        result = subprocess.run(command + ["--previous", str(previous)], capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("跨话事件未对齐", json.loads(result.stdout)["error"])
        self.assertFalse(out.exists())
        write_story(self.story, self.pages, SEQUEL_HEADER)
        result = subprocess.run(command + ["--previous", str(previous)], capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["checked_previous"], "CH001")

    def test_preview_bad_late_image_rolls_back_the_selected_batch(self) -> None:
        (self.root / "格图/third.png").write_bytes(b"not an image")
        plan = comic.preview_plan(comic.load_project(self.path), ["PAGE-001", "PAGE-002"])
        with self.assertRaises((OSError, comic.ComicError)):
            comic.render(plan, self.font, self.root / "failed-preview", "png", label_language="en")
        self.assertFalse((self.root / "failed-preview").exists())
        self.assertFalse(list(self.root.glob(".comic-render-*")))

    def test_cli_preview_unknown_page_cannot_create_outputs(self) -> None:
        out = self.root / "unknown-preview"
        result = subprocess.run([sys.executable, str(SKILL / "scripts/comic_tool.py"), "preview", str(self.path),
                                 "--page", "PAGE-003", "--font", str(self.font), "--out", str(out)],
                                capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)["status"], "invalid")
        self.assertFalse(out.exists())


if __name__ == "__main__":
    unittest.main()

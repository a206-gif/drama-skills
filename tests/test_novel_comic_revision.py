"""Structural evidence for the selected novel's draft repairs, not a literary verdict."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / "漫画改编"
TOOL = ROOT / "skills/static-comic/scripts/comic_tool.py"
SPEC = importlib.util.spec_from_file_location("novel_comic_tool", TOOL)
comic = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(comic)
STORIES = [BASE / "开篇修订" / f"第{i:03d}话" / "漫画分镜.md" for i in range(1, 4)]


class NovelComicRevisionTests(unittest.TestCase):
    def test_source_blob_matches_the_reviewed_original_not_a_cache_summary(self) -> None:
        content = (ROOT / "阴湿小狗不语，只一味装乖绿茶 - 三月清梦.txt").read_bytes()
        blob = hashlib.sha1(f"blob {len(content)}\0".encode() + content).hexdigest()
        self.assertEqual(blob, "c3e238ef89050c0a715d508f56d65f5e813bdebf")

    def test_each_opening_uses_its_actual_adjacent_predecessor(self) -> None:
        previous = None
        for number, story in enumerate(STORIES, 1):
            with self.subTest(story=story):
                plan = comic.load_project(story.with_name("排版.json"), previous=previous)
                report = comic.summary(plan, False)
                self.assertEqual(report["episode"], f"CH{number:03d}")
                self.assertEqual(report["checked_previous"], f"CH{number - 1:03d}" if number > 1 else None)
                self.assertFalse(report["media_checked"])
                self.assertIn("EVT-PAST-HXS", report["pending_events"])
                if number == 3:
                    self.assertNotIn("EVT-ADOPTION", report["pending_events"])
                    self.assertIn("EVT-HXS-AID", report["pending_events"])
            previous = story

    def test_local_patches_are_not_falsely_exportable_complete_episodes(self) -> None:
        for name in ("去留补写", "蟹肉补写"):
            story = BASE / "中段补写" / name / "漫画分镜.md"
            with self.subTest(patch=name):
                pages = comic.read_script(story)
                self.assertTrue(pages)
                with self.assertRaisesRegex(comic.ComicError, "话头缺少字段"):
                    comic.read_episode(story, pages)
                self.assertFalse(story.with_name("排版.json").exists())

    def test_layouts_keep_only_ids_geometry_and_media_not_labels_or_story(self) -> None:
        for story in STORIES:
            value = json.loads(story.with_name("排版.json").read_text(encoding="utf-8"))
            comic.load_project(story.with_name("排版.json"),
                               previous=STORIES[STORIES.index(story) - 1] if story != STORIES[0] else None)
            rendered_json = json.dumps(value, ensure_ascii=False)
            for forbidden in ("正文", "说话人", "叙述身份", "对白", "内心", "旁白", "阴湿小狗"):
                self.assertNotIn(forbidden, rendered_json)
            pages = comic.read_script(story)
            footers = [p for page in pages for p in page["panels"]
                       if p["fields"].get("版式角色") == "推广尾栏"]
            self.assertFalse(footers)
            self.assertTrue(story.with_name("发布文案.md").is_file())
            self.assertEqual(value["lettering"]["mode"], "embedded")

    def test_next_childhood_batch_exports_match_current_source_and_explicit_scope(self) -> None:
        batch = STORIES[1].parent / "出图交接" / "第二话首批"
        manifest = json.loads((batch / "来源与任务.json").read_text(encoding="utf-8"))
        for key, story in (("source", STORIES[1]), ("previous_source", STORIES[0])):
            self.assertEqual((ROOT / manifest[key]["file"]).resolve(), story.resolve())
            self.assertEqual(manifest[key]["sha256"], hashlib.sha256(story.read_bytes()).hexdigest())
        pages = comic.read_script(STORIES[1])
        by_id = {panel["id"]: panel for page in pages for panel in page["panels"]}
        scope = manifest["scope"]
        selected = [p["id"] for page in pages if page["id"] in scope["page_ids"]
                    for p in page["panels"]]
        self.assertEqual(scope["panel_ids"], selected)
        classified = [row["panel_id"] for key in ("planned_generation", "local_assets", "deferred")
                      for row in manifest[key]]
        self.assertEqual(len(classified), len(set(classified)))
        self.assertEqual(set(classified), set(selected))
        export_path = ROOT / manifest["export"]["file"]
        self.assertEqual(hashlib.sha256(export_path.read_bytes()).hexdigest(), manifest["export"]["sha256"])
        blocks = export_path.read_text(encoding="utf-8").split("\n## ")[1:]
        exported = {block.splitlines()[0]: block.split("\n提示词：\n", 1)[1].strip()
                    for block in blocks}
        self.assertEqual(set(exported), {row["panel_id"] for row in manifest["planned_generation"]})
        refs = {row["id"] for row in manifest["references"]}
        for row in manifest["planned_generation"]:
            prompt = by_id[row["panel_id"]]["fields"]["提示词"]
            self.assertEqual(exported[row["panel_id"]], prompt)
            self.assertEqual(row["source_prompt_sha256"], hashlib.sha256(prompt.encode()).hexdigest())
            self.assertLessEqual(set(row["reference_ids_in_order"]), refs)
        for row in manifest["references"]:
            path = (ROOT / row["file"]).resolve()
            path.relative_to(ROOT.resolve())
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(), row["sha256"])

    def test_next_batch_local_crop_has_actual_saved_dimensions_and_source_bounds(self) -> None:
        batch = STORIES[1].parent / "出图交接" / "第二话首批"
        manifest = json.loads((batch / "来源与任务.json").read_text(encoding="utf-8"))
        originals = {row["id"]: row for row in manifest["audited_old_images"]}
        for row in manifest["local_assets"]:
            path = (ROOT / row["file"]).resolve()
            path.relative_to(ROOT.resolve())
            raw = path.read_bytes()
            self.assertEqual(hashlib.sha256(raw).hexdigest(), row["sha256"])
            self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
            actual_size = struct.unpack(">II", raw[16:24])
            self.assertEqual(list(actual_size), row["size"])
            x1, y1, x2, y2 = row["crop_xyxy"]
            source_w, source_h = originals[row["source_id"]]["size"]
            self.assertTrue(0 <= x1 < x2 <= source_w)
            self.assertTrue(0 <= y1 < y2 <= source_h)
            self.assertEqual(actual_size, (x2 - x1, y2 - y1))
            self.assertIsInstance(row["bound_in_layout"], bool)

    def test_authorized_childhood_outputs_have_real_unique_pngs_and_recorded_inputs(self) -> None:
        episode = STORIES[1].parent
        batch = episode / "出图交接" / "第二话首批"
        manifest = json.loads((batch / "来源与任务.json").read_text(encoding="utf-8"))
        generation = json.loads((batch / "生成来源.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["generation_this_round"]["new_batch_authorized"])
        self.assertEqual(generation["actual_image_calls"], len(generation["calls"]))
        selected = [row for row in generation["calls"] if row["status"] == "selected_pending_creator_review"]
        expected = {"PANEL-001-01", "PANEL-002-01", "PANEL-002-02"}
        self.assertEqual({row["panel_id"] for row in selected}, expected)
        self.assertEqual(len(selected), len(expected))
        self.assertEqual(len({row["sha256"] for row in selected}), len(expected))
        tasks = {row["panel_id"]: row for row in manifest["planned_generation"]}
        refs = {row["id"]: row for row in manifest["references"]}
        for call in selected:
            task = tasks[call["panel_id"]]
            path = episode / call["file"]
            self.assertEqual(path, episode / task["output_target"])
            raw = path.read_bytes()
            self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(list(struct.unpack(">II", raw[16:24])), call["actual_size"])
            self.assertEqual(raw[25], 2)  # Actual PNG truecolor/RGB, not a metadata-only claim.
            self.assertEqual(hashlib.sha256(raw).hexdigest(), call["sha256"])
            self.assertEqual(call["source_prompt_sha256"], task["source_prompt_sha256"])
            self.assertEqual([row["id"] for row in call["references_in_order"]], task["reference_ids_in_order"])
            for supplied in call["references_in_order"]:
                self.assertEqual(supplied["file"], refs[supplied["id"]]["file"])
                self.assertEqual(supplied["sha256"], refs[supplied["id"]]["sha256"])

    def test_ready_pages_keep_actual_predecessor_but_deferred_first_page_still_fails(self) -> None:
        plan = comic.load_project(STORIES[1].with_name("排版.json"), previous=STORIES[0])
        preview = comic.preview_plan(plan, ["PAGE-002", "PAGE-003"])
        self.assertEqual(preview["preview_scope"], {"selected_pages": ["PAGE-002", "PAGE-003"], "episode_pages": 12})
        self.assertEqual(preview["continuity"]["checked_previous"], "CH001")
        self.assertEqual([panel["id"] for page in preview["layout"]["pages"] for panel in page["panels"]],
                         ["PANEL-002-01", "PANEL-002-02", "PANEL-002-03", "PANEL-003-01", "PANEL-003-02"])
        for page in preview["layout"]["pages"]:
            for panel in page["panels"]:
                self.assertTrue((STORIES[1].parent / panel["image"]).is_file())
        with self.assertRaisesRegex(comic.ComicError, "PANEL-001-02"):
            comic.preview_plan(plan, ["PAGE-001"])
        with self.assertRaisesRegex(comic.ComicError, "PANEL-001-02"):
            comic.load_project(STORIES[1].with_name("排版.json"), previous=STORIES[0], media=True)

    def test_page3_batch_matches_source_real_assets_and_distinct_text_font_routes(self) -> None:
        episode = STORIES[1].parent
        batch = episode / "出图交接" / "第三页童年两格"
        manifest = json.loads((batch / "来源与任务.json").read_text(encoding="utf-8"))
        generated = json.loads((batch / "生成来源.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["source"]["sha256"], hashlib.sha256(STORIES[1].read_bytes()).hexdigest())
        self.assertTrue(manifest["generation_this_round"]["new_batch_authorized"])
        self.assertEqual(manifest["scope"]["panel_ids"], ["PANEL-003-01", "PANEL-003-02"])
        self.assertEqual(manifest["scope"]["checked_previous"], "CH001")
        self.assertFalse(manifest["scope"]["episode_media_checked"])
        self.assertEqual(generated["actual_image_calls"], len(generated["calls"]))
        selected = [call for call in generated["calls"] if call["status"] == "selected_pending_creator_review"]
        self.assertEqual({call["panel_id"] for call in selected}, {"PANEL-003-01", "PANEL-003-02"})
        self.assertEqual(len({call["sha256"] for call in selected}), 2)
        pages = comic.read_script(STORIES[1])
        by_id = {panel["id"]: panel for page in pages for panel in page["panels"]}
        exported = (ROOT / manifest["export"]["file"]).read_text(encoding="utf-8")
        self.assertEqual(hashlib.sha256(exported.encode()).hexdigest(), manifest["export"]["sha256"])
        prompt_blocks = {block.splitlines()[0]: block.split("\n提示词：\n", 1)[1].strip()
                         for block in exported.split("\n## ")[1:]}
        refs = {row["id"]: row for row in manifest["references"]}
        for call in selected:
            raw = (episode / call["file"]).read_bytes()
            self.assertEqual(raw[:8], b"\x89PNG\r\n\x1a\n")
            self.assertEqual(list(struct.unpack(">II", raw[16:24])), call["actual_size"])
            self.assertEqual(raw[25], 2)
            self.assertEqual(hashlib.sha256(raw).hexdigest(), call["sha256"])
            prompt = by_id[call["panel_id"]]["fields"]["提示词"]
            self.assertEqual(prompt_blocks[call["panel_id"]], prompt)
            self.assertEqual(hashlib.sha256(prompt.encode()).hexdigest(), call["source_prompt_sha256"])
            for supplied in call["references_in_order"]:
                self.assertEqual(supplied, refs[supplied["id"]])
                self.assertEqual(hashlib.sha256((ROOT / supplied["file"]).read_bytes()).hexdigest(), supplied["sha256"])
        receipt = json.loads((episode / "制作成果/第三页-v5/试排来源.json").read_text(encoding="utf-8"))
        self.assertEqual([(row["id"], row["kind"], row["font_file"]) for row in receipt["text_bindings"]],
                         [("TEXT-003-01", "dialogue", "LXGWWenKai-Medium.ttf"),
                          ("TEXT-003-02", "narration", "NotoSansCJKsc-Regular.otf")])
        output = receipt["outputs"][0]
        raw = (episode / "制作成果/第三页-v5" / output["file"]).read_bytes()
        self.assertEqual(struct.unpack(">II", raw[16:24]), (1080, 1440))
        self.assertEqual(hashlib.sha256(raw).hexdigest(), output["sha256"])

    def test_real_sequel_cli_refuses_missing_previous_without_generating_media(self) -> None:
        before = {str(path) for story in STORIES for path in (story.parent / "制作成果").glob("**/*")}
        command = [sys.executable, "-O", str(TOOL), "check", str(STORIES[1].with_name("排版.json"))]
        result = subprocess.run(command, cwd=ROOT.parent, capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 1)
        self.assertIn("--previous", json.loads(result.stdout)["error"])
        result = subprocess.run(command + ["--previous", str(STORIES[0])], cwd=ROOT.parent,
                                capture_output=True, encoding="utf-8", check=False)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["checked_previous"], "CH001")
        after = {str(path) for story in STORIES for path in (story.parent / "制作成果").glob("**/*")}
        self.assertEqual(before, after)


if __name__ == "__main__":
    unittest.main()

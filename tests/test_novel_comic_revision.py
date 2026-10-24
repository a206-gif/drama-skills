"""Structural evidence for the selected novel's draft repairs, not a literary verdict."""
from __future__ import annotations

import hashlib
import importlib.util
import json
import subprocess
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
            self.assertEqual(len(footers), 1)
            self.assertTrue(footers[0]["texts"][0]["fields"]["叙述身份"].startswith("推广提示"))

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

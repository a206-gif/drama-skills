"""Real-pixel review of ready wordless media against bound layout geometry.

The review only reads manifests and layouts, so it can prove measurement facts
without pretending to judge faces, hands or story accuracy by itself.
"""
from __future__ import annotations

import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    Image = None
    ImageOps = None

if os.environ.get("STATIC_COMIC_RENDER_REQUIRED") == "1" and Image is None:
    raise RuntimeError("Render-required review tests need Pillow")

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("art_review", ROOT / "漫画改编/工具/审图接触表.py")
review_tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(review_tool)


class CoverFitMathTests(unittest.TestCase):
    def test_wide_source_in_short_panel_reports_upscale_and_crop_loss(self) -> None:
        fit = review_tool.cover_fit((1376, 768), (984, 432))
        self.assertAlmostEqual(fit["scale"], 984 / 1376, places=4)
        self.assertFalse(fit["upscale"])
        self.assertGreater(fit["hidden_fraction"], 0.20)
        self.assertIn("裁掉源画面", fit["clarity_grade"])
        x, y, w, h = fit["visible_source_box"]
        self.assertEqual((x, w), (0, 1376))
        self.assertLess(h, 768)
        self.assertAlmostEqual(y + h / 2, 384, delta=1)

    def test_small_crop_in_large_panel_is_flagged_as_over_upscale(self) -> None:
        fit = review_tool.cover_fit((205, 115), (984, 660))
        self.assertGreater(fit["scale"], 5.0)
        self.assertTrue(fit["upscale"])
        self.assertTrue(fit["clarity_grade"].startswith("过度放大"))

    def test_focus_moves_the_visible_window_without_changing_scale(self) -> None:
        centred = review_tool.cover_fit((1376, 768), (984, 432), (0.5, 0.5))
        top = review_tool.cover_fit((1376, 768), (984, 432), (0.5, 0.0))
        self.assertEqual(centred["scale"], top["scale"])
        self.assertEqual(top["visible_source_box"][1], 0)
        self.assertGreater(centred["visible_source_box"][1], 0)

    def test_display_recommendation_keeps_aspect_and_respects_width(self) -> None:
        rec = review_tool.display_at_scale((345, 590), 984, 2.0)
        self.assertEqual(rec["target_scale"], 2.0)
        self.assertEqual(rec["display_size"], [690, 1180])
        narrow = review_tool.display_at_scale((1376, 768), 500, 2.0)
        self.assertAlmostEqual(narrow["target_scale"], 500 / 1376, places=4)
        self.assertEqual(narrow["display_size"][0], 500)
        with self.assertRaisesRegex(review_tool.ReviewError, "正"):
            review_tool.display_at_scale((345, 590), 0, 2.0)

    @unittest.skipIf(Image is None, "Pillow is optional outside render-required jobs")
    def test_predicted_visible_window_matches_the_renderer_crop(self) -> None:
        source = Image.new("RGB", (400, 300), "white")
        for y in range(300):
            for x in range(0, 400, 8):
                source.putpixel((x, y), ((y // 8) % 256, (x // 8) % 256, 120))
        target = (240, 200)
        fit = review_tool.cover_fit(source.size, target, (0.5, 0.5))
        fitted = ImageOps.fit(source, target, method=Image.Resampling.NEAREST,
                              centering=(0.5, 0.5))
        x, y, w, h = fit["visible_source_box"]
        self.assertAlmostEqual(fitted.getpixel((0, 0))[0], source.getpixel((x, y))[0], delta=1)
        self.assertAlmostEqual(fitted.getpixel((target[0] - 1, target[1] - 1))[0],
                               source.getpixel((min(399, x + w - 1), min(299, y + h - 1)))[0],
                               delta=1)


class RepositoryReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.report = review_tool.review()

    def test_all_queued_jobs_are_bound_and_hash_verified(self) -> None:
        self.assertEqual(self.report["jobs"], 41)
        self.assertEqual(self.report["ready_and_bound"], 41)
        for row in self.report["panels"]:
            with self.subTest(key=row["key"]):
                self.assertTrue(row["media_present"])
                self.assertTrue(row["size_matches_manifest"])
                self.assertTrue(row["sha_matches_manifest"])
                self.assertTrue(row["bit_depth_8"])
                self.assertTrue(row["bound_in_layout"])
                self.assertTrue(row["bound_file_matches_manifest"])

    def test_only_the_known_deferred_recall_panel_lacks_media(self) -> None:
        missing = self.report["missing_media"]
        self.assertEqual([(row["episode"], row["panel_id"]) for row in missing],
                         [("CH002", "PANEL-001-02")])
        outside = self.report["layout_panels_outside_queue"]
        earlier = [row for row in outside if row["classification"] == "media_from_earlier_batch"]
        self.assertTrue(earlier)
        self.assertNotIn(("CH002", "PANEL-001-02"),
                         [(row["episode"], row["panel_id"]) for row in earlier])

    def test_current_ch003_geometry_meets_craft_bounds(self) -> None:
        # Round-6 geometry: inserts display at <=1.6x, full-bleed strips hide <=25%.
        rows = [row for row in self.report["panels"]
                if row["bound_in_layout"] and row["episode"] == "CH003"]
        self.assertTrue(rows)
        for row in rows:
            with self.subTest(key=row["key"]):
                panel_rect = row["panel_rect"]
                is_insert = row["image_target"] != [0, 0, panel_rect[2], panel_rect[3]]
                if is_insert:
                    self.assertLessEqual(row["fit"]["scale"], 1.6 + 1e-6)
                else:
                    self.assertLessEqual(row["fit"]["hidden_fraction"], 0.25 + 1e-6)

    def test_old_round5_geometry_is_still_measured_as_unusable(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            layout = json.loads((review_tool.EPISODES["CH003"] / "排版.json")
                                .read_text(encoding="utf-8"))
            panel = layout["pages"][6]["panels"][0]
            self.assertEqual(panel["id"], "PANEL-007-01")
            panel["rect"] = [0, 0, 1080, 480]
            panel["image_rect"] = [0, 0, 1080, 420]
            candidate = root / "排版-old5.json"
            candidate.write_text(json.dumps(layout, ensure_ascii=False), encoding="utf-8")
            report = review_tool.review(layouts={"CH003": candidate})
            row = next(item for item in report["panels"] if item["key"] == "CH003/PANEL-007-01")
            self.assertGreater(row["fit"]["scale"], 5.0)

    def test_report_carries_no_story_text_fields(self) -> None:
        rendered = json.dumps(self.report, ensure_ascii=False)
        for forbidden in review_tool.FORBIDDEN_IN_REPORT:
            self.assertNotIn(forbidden, rendered)

    def test_candidate_layout_override_is_measured_without_touching_current(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            layout = json.loads((review_tool.EPISODES["CH003"] / "排版.json")
                                .read_text(encoding="utf-8"))
            panel = layout["pages"][6]["panels"][0]
            self.assertEqual(panel["id"], "PANEL-007-01")
            panel["rect"] = [0, 0, 1080, 240]
            panel["image_rect"] = [326, 20, 427, 200]
            candidate = root / "排版-candidate.json"
            candidate.write_text(json.dumps(layout, ensure_ascii=False), encoding="utf-8")
            report = review_tool.review(layouts={"CH003": candidate})
            row = next(item for item in report["panels"] if item["key"] == "CH003/PANEL-007-01")
            self.assertLess(row["fit"]["scale"], 2.2)
            self.assertEqual(report["layout_files"]["CH003"], candidate.as_posix())
            current = review_tool.review()
            now = next(item for item in current["panels"]
                       if item["key"] == "CH003/PANEL-007-01")
            self.assertLessEqual(now["fit"]["scale"], 1.6 + 1e-6)


@unittest.skipIf(Image is None, "Pillow is optional outside render-required jobs")
class PreviewOutputTests(unittest.TestCase):
    def test_previews_refuse_overwrite_and_escape(self) -> None:
        report = review_tool.review()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = root / "preview"
            first = review_tool.render_previews(report, out, sheet_width=120, allowed_root=root)
            self.assertEqual(first["status"], "previews_written")
            self.assertTrue((out / "页接触表").is_dir())
            with self.assertRaisesRegex(review_tool.ReviewError, "已存在"):
                review_tool.render_previews(report, out, sheet_width=120, allowed_root=root)
            with self.assertRaisesRegex(review_tool.ReviewError, "根目录内"):
                review_tool.render_previews(report, root.parent / "escaped", sheet_width=120,
                                          allowed_root=root)

    def test_contact_sheets_label_work_ids_only(self) -> None:
        report = review_tool.review()
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            out = review_tool.render_previews(report, root / "p", sheet_width=140,
                                              allowed_root=root)
            sheets = sorted((Path(out["directory"]) / "页接触表").glob("*.jpg"))
            self.assertTrue(sheets)
            self.assertEqual(out["panel_previews"], 41)


if __name__ == "__main__":
    unittest.main()

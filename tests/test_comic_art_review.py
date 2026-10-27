"""Real-pixel review of ready wordless media against bound layout geometry.

The review only reads manifests and layouts, so it can prove measurement facts
without pretending to judge faces, hands or story accuracy by itself.
"""
from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import struct
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
        self.assertEqual(self.report["jobs"], 42)
        self.assertEqual(self.report["ready_and_bound"], 42)
        for row in self.report["panels"]:
            with self.subTest(key=row["key"]):
                self.assertTrue(row["media_present"])
                self.assertTrue(row["size_matches_manifest"])
                self.assertTrue(row["sha_matches_manifest"])
                self.assertTrue(row["bit_depth_8"])
                self.assertTrue(row["bound_in_layout"])
                self.assertTrue(row["bound_file_matches_manifest"])

    def test_not_drawn_recall_panel_is_bound_via_zero_call_carrier_crop(self) -> None:
        # Round 11: creator decided the recall panel is NOT drawn; its frozen bodies ride a
        # local close-up crop of the adopted PANEL-001-01 delivery (0 model calls).
        self.assertEqual(self.report["missing_media"], [])
        manifest = json.loads((ROOT / "漫画改编/连续童年出图/来源与任务.json").read_text(encoding="utf-8"))
        job = next(row for row in manifest["jobs"] if row["key"] == "CH002/PANEL-001-02")
        self.assertEqual(job["kind"], "not_drawn_recall_text_carrier_crop")
        self.assertEqual(job["model_calls"], 0)
        self.assertFalse(any(call["job_key"] == job["key"] for call in manifest["calls"]))
        self.assertTrue(job["not_from_blocked_output"])
        raw = (ROOT / job["output"]).read_bytes()
        self.assertEqual(job["output_sha256"], hashlib.sha256(raw).hexdigest())
        self.assertEqual(job["size"], list(struct.unpack(">II", raw[16:24])))
        source = (ROOT / job["crop_of_file"]).read_bytes()
        self.assertEqual(job["crop_of_sha256"], hashlib.sha256(source).hexdigest())
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

    def test_current_ch002_selected_geometry_meets_craft_bounds(self) -> None:
        # Round-7 geometry for pages 4-12 plus round-11 PAGE-001: inserts display at
        # <=1.6x, full-bleed strips hide <=25% (001-02 carrier crop counts as a strip).
        rows = [row for row in self.report["panels"]
                if row["bound_in_layout"] and row["episode"] == "CH002"]
        self.assertTrue(rows)
        for row in rows:
            with self.subTest(key=row["key"]):
                panel_rect = row["panel_rect"]
                is_insert = row["image_target"] != [0, 0, panel_rect[2], panel_rect[3]]
                if is_insert:
                    self.assertLessEqual(row["fit"]["scale"], 1.6 + 1e-6)
                else:
                    self.assertLessEqual(row["fit"]["hidden_fraction"], 0.25 + 1e-6)

    def test_ch002_continuation_receipt_is_full_bleed_clean_and_accepted(self) -> None:
        receipt = json.loads((ROOT / "漫画改编/开篇修订/第002话/制作成果/画内贴字-v5-续/试排来源.json")
                             .read_text(encoding="utf-8"))
        self.assertEqual(receipt["render_report"]["status"], "preview_rendered")
        self.assertEqual(receipt["pixel_checks"]["white_rows"], {})
        self.assertEqual(receipt["pixel_checks"]["violations"], [])
        self.assertTrue(receipt["pixel_checks"]["text_rects_clear_of_protected"])
        self.assertTrue(receipt["frozen_pages_intact"])
        self.assertTrue(receipt["creator_acceptance"]["frozen"])
        self.assertEqual(len(receipt["outputs"]), 9)

    def test_ch002_page1_not_drawn_carrier_receipt_is_clean_and_zero_call(self) -> None:
        receipt = json.loads((ROOT / "漫画改编/开篇修订/第002话/制作成果/画内贴字-v5-第1页/试排来源.json")
                             .read_text(encoding="utf-8"))
        self.assertEqual(receipt["render_report"], "preview_rendered")
        self.assertEqual(receipt["pixel_checks"]["white_rows"], {})
        self.assertEqual(receipt["pixel_checks"]["violations"], [])
        self.assertTrue(receipt["pixel_checks"]["text_rects_clear_of_protected"])
        self.assertTrue(receipt["frozen_pages_intact"])
        self.assertEqual(receipt["new_model_calls_this_round"], 0)
        self.assertTrue(receipt["creator_acceptance"]["frozen"])
        self.assertTrue(receipt["creator_acceptance"]["not_drawn_carrier_accepted"])
        self.assertEqual(receipt["creator_acceptance"]["scope"], "PAGE-001")
        self.assertEqual(len(receipt["outputs"]), 1)
        self.assertTrue(receipt["scope"]["episode_media_checked"])
        scales = receipt["pixel_checks"]["upscale_scales"]
        self.assertLessEqual(scales["PANEL-001-02"], 1.6 + 1e-6)
        self.assertLessEqual(scales["PANEL-001-01"], 1.0)
        bodies = {binding["id"]: binding["kind"] for binding in receipt["text_bindings"]}
        self.assertEqual(bodies, {"TEXT-001-01": "dialogue", "TEXT-001-02": "thought",
                                  "TEXT-001-03": "narration", "TEXT-001-04": "dialogue"})

    def test_ch002_episode_preview_package_is_byte_identical_to_frozen_pages(self) -> None:
        # Round 13: the continuous-read package copies frozen lettered pages verbatim.
        package = ROOT / "漫画改编/开篇修订/第002话/制作成果/整话预览-CH002"
        manifest = json.loads((package / "来源.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["new_model_calls"], 0)
        self.assertFalse(manifest["rerendered"])
        self.assertFalse(manifest["published"])
        self.assertEqual([row["page"] for row in manifest["pages"]],
                         [f"PAGE-{i:03d}" for i in range(1, 13)])
        for row in manifest["pages"]:
            with self.subTest(page=row["page"]):
                copy = package / row["file"]
                self.assertEqual(hashlib.sha256(copy.read_bytes()).hexdigest(), row["sha256"])
                source = ROOT / "漫画改编/开篇修订/第002话/制作成果" / row["source_folder"] / row["source_file"]
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), row["sha256"])
                receipt = json.loads((ROOT / "漫画改编/开篇修订/第002话/制作成果" / row["frozen_receipt"])
                                     .read_text(encoding="utf-8"))
                frozen = next(r for r in receipt["outputs"] if Path(r["file"]).name == row["source_file"])
                self.assertEqual(frozen["sha256"], row["sha256"])
                self.assertTrue(row["frozen"])
                self.assertTrue(row["frozen_basis"])

    def test_opening_three_read_package_is_copy_only_and_labels_all_frozen(self) -> None:
        # Round 14: three-episode continuous-read package; round 30: CH001 frozen per the
        # creator's packaging/publish instruction, so all 29 rows are frozen now.
        package = ROOT / "漫画改编/开篇修订/三连读预览-开篇三话"
        manifest = json.loads((package / "来源.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["new_model_calls"], 0)
        self.assertFalse(manifest["rerendered"])
        self.assertFalse(manifest["published"])
        counts = {}
        for row in manifest["pages"]:
            counts[row["episode"]] = counts.get(row["episode"], 0) + 1
        self.assertEqual(counts, {"CH001": 9, "CH002": 12, "CH003": 8})
        for row in manifest["pages"]:
            with self.subTest(file=row["file"]):
                copy = package / row["file"]
                self.assertEqual(hashlib.sha256(copy.read_bytes()).hexdigest(), row["sha256"])
                source = ROOT / "漫画改编/开篇修订" / row["source_folder"] / Path(row["file"]).name
                self.assertEqual(hashlib.sha256(source.read_bytes()).hexdigest(), row["sha256"])
                receipt = json.loads((ROOT / "漫画改编/开篇修订" / row["frozen_receipt"]).read_text(encoding="utf-8"))
                frozen = next(r for r in receipt["outputs"] if Path(r["file"]).name == Path(row["file"]).name)
                self.assertEqual(frozen["sha256"], row["sha256"])
                self.assertTrue(row["frozen"])
                self.assertTrue(row["frozen_basis"])
        whole = json.loads((ROOT / "漫画改编/开篇修订/第002话/制作成果/整话预览-CH002/来源.json")
                           .read_text(encoding="utf-8"))
        self.assertTrue(whole["creator_acceptance"]["mobile_viewed"])
        self.assertTrue(whole["creator_acceptance"]["passed"])

    def test_ch001_adult_panels_media_present_from_creator_sheets_with_crop_provenance(self) -> None:
        # Round 23: the 15 missing adult panels arrived as creator-generated page sheets
        # (gpt-image-2.5, creator-side calls); assistant only cropped rows locally. The old
        # "media gap stays declared" pin is replaced by provenance pins: every pp1-7 panel
        # file exists, crop provenance matches the sheet files on disk, over-guard crops are
        # exactly the disclosed PAGE-001 pair, and hidden ratios stay within declared caps.
        episode = ROOT / "漫画改编/开篇修订/第001话"
        layout = json.loads((episode / "排版.json").read_text(encoding="utf-8"))
        for page in layout["pages"]:
            if page["id"] in [f"PAGE-{i:03d}" for i in range(1, 8)]:
                for panel in page["panels"]:
                    with self.subTest(panel=panel["id"]):
                        self.assertTrue((episode / panel["image"]).is_file())
        provenance = json.loads((episode / "出图交接/回图/裁行来源.json").read_text(encoding="utf-8"))
        self.assertEqual(provenance["crop_calls_by_assistant"], 0)
        for name, digest in provenance["sheets"].items():
            sheet = episode / "出图交接/回图/sheet原图" / name
            self.assertEqual(hashlib.sha256(sheet.read_bytes()).hexdigest(), digest)
        over = provenance["disclosed_over_guard"]
        self.assertEqual(sorted(over), ["PANEL-001-02", "PANEL-001-03"])
        for panel_id, row in provenance["crops"].items():
            with self.subTest(crop=panel_id):
                if panel_id in over:
                    self.assertLessEqual(row["hidden"], 0.40)
                else:
                    self.assertLessEqual(row["hidden"], 0.25)
        for page in layout["pages"]:
            if page["id"] in ("PAGE-008", "PAGE-009"):
                for panel in page["panels"]:
                    self.assertTrue((episode / panel["image"]).is_file())

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
            # v3 sheet化后旧源图已由整行行图取代：old5 几何的不可用性改以"留白带+仍有裁切"度量——
            # image_rect 高420 < 格高480 违反填框规则（白腰带），且对行图仍有可见裁切；
            # 旧小图时代的放大倍率>5 前提随资产替换失效，不再使用。
            self.assertLess(row["image_target"][3], row["panel_rect"][3])
            self.assertGreater(row["fit"]["hidden_fraction"], 0.05)

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
            self.assertEqual(out["panel_previews"], 42)


if __name__ == "__main__":
    unittest.main()

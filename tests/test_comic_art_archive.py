"""Pixel-preserving local PNG storage, not a claim about a model's image quality."""
from __future__ import annotations

import hashlib
import importlib.util
import os
import tempfile
import unittest
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    Image = None

if os.environ.get("STATIC_COMIC_RENDER_REQUIRED") == "1" and Image is None:
    raise RuntimeError("Render-required archive tests need Pillow")

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("art_archive", ROOT / "漫画改编/工具/归档无字底图.py")
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)


@unittest.skipIf(Image is None, "Pillow is optional outside render-required jobs")
class ComicArtArchiveTests(unittest.TestCase):
    def test_rgb_and_hidden_rgba_pixels_survive_recompression_with_real_hashes(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            for mode, color in [("RGB", (30, 70, 100)), ("RGBA", (180, 40, 90, 0))]:
                with self.subTest(mode=mode):
                    source, target = root / f"{mode}-raw.png", root / f"{mode}-archive.png"
                    with Image.new(mode, (80, 60), color) as original:
                        original.putpixel((4, 8), (1, 2, 3) if mode == "RGB" else (9, 7, 3, 0))
                        original.save(source, compress_level=0)
                        expected = original.tobytes()
                    report = archive.archive_png(source, target, root)
                    with Image.open(target) as result:
                        self.assertEqual(result.mode, mode)
                        self.assertEqual(result.size, (80, 60))
                        self.assertEqual(result.tobytes(), expected)
                    self.assertLess(target.stat().st_size, source.stat().st_size)
                    self.assertEqual(report["decoded_pixel_sha256"], hashlib.sha256(expected).hexdigest())
                    self.assertEqual(report["raw_sha256"], hashlib.sha256(source.read_bytes()).hexdigest())
                    self.assertEqual(report["sha256"], hashlib.sha256(target.read_bytes()).hexdigest())
                    self.assertEqual(report["model_calls_during_archive"], 0)

    def test_non_png_and_16bit_are_rejected_without_partial_output(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with Image.new("RGB", (12, 12), "white") as image:
                image.save(root / "jpeg.jpg")
            with Image.new("I;16", (12, 12), 65000) as image:
                image.save(root / "sixteen.png")
            for name in ["jpeg.jpg", "sixteen.png"]:
                output = root / (name + ".png")
                with self.assertRaisesRegex(ValueError, "8bit PNG"):
                    archive.archive_png(root / name, output, root)
                self.assertFalse(output.exists())
            self.assertFalse(list(root.glob(".art-archive-*")))

    def test_existing_output_and_project_escape_are_not_overwritten(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with Image.new("RGB", (12, 12), "white") as image:
                image.save(root / "source.png")
            target = root / "existing.png"
            target.write_bytes(b"do not touch")
            with self.assertRaisesRegex(ValueError, "已存在"):
                archive.archive_png(root / "source.png", target, root)
            self.assertEqual(target.read_bytes(), b"do not touch")
            with self.assertRaisesRegex(ValueError, "根目录内"):
                archive.archive_png(root / "source.png", root.parent / "escaped.png", root)

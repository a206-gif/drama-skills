#!/usr/bin/env python3
"""项目内的受限单格试排：读真实整话，只导出一个RGB PNG格及范围收据。

不是通用page preview；不接image_rect、EXIF或非RGB/多帧图，不生成剧情或格图。
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("panel_comic_tool", ROOT / "skills/static-comic/scripts/comic_tool.py")
comic = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(comic)


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_panel(layout: Path, panel_id: str, font_path: Path, out: Path,
                 speaker_fonts: dict[str, Path] | None = None, previous: Path | None = None) -> dict:
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
    except ImportError as exc:
        raise comic.ComicError('单格复现需要先安装 "Pillow>=10.4,<12"') from exc

    plan = comic.load_project(layout, previous=previous)
    config = comic.lettering_config(plan["layout"])
    comic.require(config["mode"] == "embedded", "本项目单格复现仅支持embedded；不静默改名签策略")
    selected = [(page, panel, source) for page, authored in zip(plan["layout"]["pages"], plan["script"])
                for panel, source in zip(page["panels"], authored["panels"]) if panel["id"] == panel_id]
    comic.require(len(selected) == 1, "必须选择当前整话中存在的唯一格ID")
    page, panel, source = selected[0]
    comic.require("image_rect" not in panel, "单格复现不支持image_rect；请回完整页排版")
    comic.require(not out.is_symlink(), "输出不能是符号链接")
    out = out.resolve()
    comic.require(not out.exists(), "输出目录已存在；请选新目录，不覆盖旧版")
    speaker_fonts = speaker_fonts or {}
    comic.require(font_path.is_file() and all(path.is_file() for path in speaker_fonts.values()), "实际字体文件缺失")
    image_path = comic.local_file(plan["root"], panel["image"])
    comic.require(image_path.is_file() and image_path.stat().st_size > 0, f"{panel_id}: 格图缺失或为空")
    prepared, text_fonts, fonts = [], [], {}
    for placement, written in zip(panel["texts"], source["texts"]):
        data = written["fields"]
        path = (speaker_fonts.get(data["说话人"], font_path)
                if data["类型"] in {"dialogue", "thought"} else font_path)
        key = path, placement["font_size"]
        if key not in fonts:
            fonts[key] = ImageFont.truetype(str(path), placement["font_size"])
        font = fonts[key]
        metrics = comic.letter_metrics(placement, written, font, style=comic.lettering_style(config, written))
        prepared.append((placement, written, font, metrics))
        text_fonts.append({"id": written["id"], "kind": data["类型"], "speaker": data.get("说话人"),
                           "font_file": path.name, "font_sha256": sha256(path),
                           "font_face": list(font.getname()), "font_size": placement["font_size"]})
    _, _, w, h = panel["rect"]
    filename = panel_id + ".png"
    try:
        opened = Image.open(image_path)
    except Image.DecompressionBombError as exc:
        raise comic.ComicError("单格解码超出资源上限") from exc
    with opened as original:
        comic.require(original.width * original.height <= 32_000_000, "单格解码超出3200万像素资源上限")
        comic.require(original.format == "PNG" and original.mode == "RGB"
                      and getattr(original, "n_frames", 1) == 1 and not original.getexif(),
                      "本项目复现只接无EXIF的静态RGB PNG；其他格式不静默转换")
        input_size = list(original.size)
        with ImageOps.fit(original, (w, h), method=Image.Resampling.LANCZOS,
                          centering=tuple(panel.get("focus", [0.5, 0.5]))) as fitted, fitted.convert("RGBA") as lettered:
            border = plan["layout"]["canvas"].get("panel_border_width", 3)
            if border:
                ImageDraw.Draw(lettered).rectangle((0, 0, w - 1, h - 1), outline="black", width=border)
            for placement, written, font, metrics in prepared:
                with Image.new("RGBA", (w, h), (0, 0, 0, 0)) as overlay:
                    comic.draw_lettering(ImageDraw.Draw(overlay), placement, written, font, metrics, (0, 0))
                    lettered.alpha_composite(overlay)
            out.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.TemporaryDirectory(prefix=".panel-proof-", dir=out.parent) as directory:
                staged = Path(directory) / "panel"
                staged.mkdir()
                with lettered.convert("RGB") as result:
                    result.save(staged / filename, format="PNG")
                receipt = {
                    "status": "panel_preview_rendered", "scope": "selected_panel", "episode": plan["continuity"]["id"],
                    "checked_previous": plan["continuity"]["checked_previous"], "episode_pages": len(plan["script"]),
                    "source_page": page["id"], "source_page_panels": len(page["panels"]), "selected_panel": panel_id,
                    "selected_media_checked": True, "page_media_checked": False, "episode_media_checked": False,
                    "lettering_mode": "embedded", "visible_labels": False,
                    "storyboard": {"file": plan["layout"]["storyboard"],
                                   "sha256": sha256(comic.local_file(plan["root"], plan["layout"]["storyboard"]))},
                    "layout_sha256": sha256(layout), "panel_snapshot": panel,
                    "lettering_snapshot": config, "panel_border_width": border,
                    "input_image": {"file": panel["image"], "sha256": sha256(image_path), "size": input_size},
                    "fit": {"method": "ImageOps.fit/LANCZOS", "focus": panel.get("focus", [0.5, 0.5])},
                    "texts": text_fonts,
                    "renderers": {"project_helper_sha256": sha256(Path(__file__)),
                                  "comic_tool_sha256": sha256(ROOT / "skills/static-comic/scripts/comic_tool.py")},
                    "output": {"file": filename, "sha256": sha256(staged / filename), "size": [w, h], "mode": "RGB"},
                    "note": "单格局部试排；未核其余格图，不是完整页/话、独立审查或手机平台验收；没有生成格图或上传"
                }
                (staged / "来源.json").write_text(json.dumps(receipt, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
                comic.require(not out.exists() and not out.is_symlink(), "输出目标在排字期间出现，未覆盖")
                staged.rename(out)
    return receipt


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("layout", type=Path)
    parser.add_argument("--panel", required=True)
    parser.add_argument("--font", required=True, type=Path)
    parser.add_argument("--speaker-font", action="append", default=[])
    parser.add_argument("--previous", type=Path)
    parser.add_argument("--out", required=True, type=Path)
    args = parser.parse_args()
    try:
        result = render_panel(args.layout, args.panel, args.font, args.out,
                              comic.speaker_font_options(args.speaker_font), args.previous)
    except (comic.ComicError, OSError, ValueError) as exc:
        print(json.dumps({"status": "invalid", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""按真实像素复核已就位无字底图与当前排版绑定；不调用模型、不排字、不写正文。

只读 `来源与任务.json` 与各话 `排版.json`：核对 PNG 签名/位深/尺寸/SHA，
计算 comic_tool 覆盖式裁切（ImageOps.fit）在当前格框下的实际放大倍数、
真正可见的源像素区与被裁掉的面积比例，据此给出可复核的清晰度分级与
建议展示尺寸。可选输出逐格“当前排版会显示成什么”的预览与带工作 ID 的
页接触表；ID 是工作状态标注，不是故事字幕，也不复制任何对白/旁白正文。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[2]
WORK = ROOT / "漫画改编"
MANIFEST = WORK / "连续童年出图" / "来源与任务.json"
EPISODES = {"CH002": WORK / "开篇修订" / "第002话", "CH003": WORK / "开篇修订" / "第003话"}
# 覆盖式放大到 2 倍以上，脸/手在小局部上会明显发软；这是排字前要先改格框的信号。
SCALE_GRADES = [(1.0, "原生或缩小_清晰"), (1.25, "轻微放大_可接受"),
                (2.0, "明显放大_需按真实画面调格"), (float("inf"), "过度放大_发软需改几何")]
CROP_LOSS_LIMIT = 0.10
FORBIDDEN_IN_REPORT = ("正文", "说话人", "对话对象", "叙述身份", "提示词")


class ReviewError(ValueError):
    """复核必须停在可核对的事实上，不猜内容、不冒称通过。"""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ReviewError(message)


def clamp(value: Any) -> float:
    require(isinstance(value, (int, float)) and not isinstance(value, bool), "focus 必须是数值")
    return min(1.0, max(0.0, float(value)))


def cover_fit(source: tuple[int, int], target: tuple[int, int],
              focus: tuple[float, float] = (0.5, 0.5)) -> dict[str, Any]:
    """复算 comic_tool 的覆盖式裁切：放大倍数、可见源区、被裁面积。"""
    sw, sh = source
    tw, th = target
    require(min(sw, sh) > 0 and min(tw, th) > 0, "源与目标尺寸必须为正")
    scale = max(tw / sw, th / sh)
    visible_w, visible_h = tw / scale, th / scale
    left = (sw - visible_w) * clamp(focus[0])
    top = (sh - visible_h) * clamp(focus[1])
    hidden = 1.0 - (visible_w * visible_h) / (sw * sh)
    grade = next(name for limit, name in SCALE_GRADES if scale <= limit)
    if hidden >= CROP_LOSS_LIMIT:
        grade += "＋裁掉源画面"
    return {"scale": round(scale, 4), "upscale": scale > 1.0,
            "visible_source_box": [round(left), round(top), round(visible_w), round(visible_h)],
            "hidden_fraction": round(hidden, 4), "clarity_grade": grade}


def display_at_scale(source: tuple[int, int], available_width: int,
                     max_scale: float = 2.0) -> dict[str, Any]:
    """给出不超过可用格宽、且放大不超过上限的展示尺寸（保源比例，不拉伸）。"""
    sw, sh = source
    require(available_width > 0 and max_scale > 0, "可用格宽与放大上限必须为正")
    scale = min(max_scale, available_width / sw)
    width, height = round(sw * scale), round(sh * scale)
    require(width >= 1 and height >= 1, "建议尺寸过小，需要回分镜改镜别/增格")
    return {"target_scale": round(scale, 4), "display_size": [width, height]}


def png_facts(path: Path) -> dict[str, Any]:
    raw = path.read_bytes()
    require(len(raw) >= 26 and raw[:8] == b"\x89PNG\r\n\x1a\n", f"{path.name}: 不是PNG")
    width, height = struct.unpack(">II", raw[16:24])
    return {"bytes": len(raw), "sha256": hashlib.sha256(raw).hexdigest(),
            "size": [width, height], "bit_depth": raw[24], "color_type": raw[25]}


def layout_bindings(layout_path: Path) -> dict[str, dict[str, Any]]:
    data = json.loads(layout_path.read_text(encoding="utf-8-sig"))
    canvas = data["canvas"]
    bindings: dict[str, dict[str, Any]] = {}
    for page in data["pages"]:
        for panel in page["panels"]:
            require(panel["id"] not in bindings, f"{panel['id']}: 排版中重复格ID")
            bindings[panel["id"]] = {
                "page_id": page["id"], "rect": list(panel["rect"]),
                "image_rect": list(panel["image_rect"]) if "image_rect" in panel else None,
                "focus": [clamp(v) for v in panel.get("focus", [0.5, 0.5])],
                "image": panel["image"], "canvas": dict(canvas)}
    return bindings


def review(manifest_path: Path = MANIFEST, episodes: dict[str, Path] | None = None,
           max_scale: float = 2.0, layouts: dict[str, Path] | None = None) -> dict[str, Any]:
    """逐任务实核文件与绑定几何；缺图/未绑定如实分列，不静默跳过。

    layouts 可换成候选排版再测一次，用于组页前比较几何，不改仓库里的当前排版。
    """
    episodes = episodes or EPISODES
    manifest = json.loads(manifest_path.read_text(encoding="utf-8-sig"))
    layout_files = {name: (layouts or {}).get(name, path / "排版.json")
                    for name, path in episodes.items()}
    for name, path in layout_files.items():
        require(path.is_file(), f"{name}: 排版文件缺失 {path}")
    bindings = {name: layout_bindings(path) for name, path in layout_files.items()}
    rows: list[dict[str, Any]] = []
    bound_keys: set[tuple[str, str]] = set()
    for job in manifest["jobs"]:
        episode, panel_id = job["episode"], job["panel_id"]
        require(episode in bindings, f"{job['key']}: 未知话别，先确认排版入口")
        path = ROOT / job["output"]
        row: dict[str, Any] = {"key": job["key"], "episode": episode, "panel_id": panel_id,
                               "kind": job["kind"], "status": job["status"],
                               "file": job["output"], "manifest_size": list(job["size"])}
        if not path.is_file():
            row.update({"media_present": False,
                        "note": "清单标就绪但文件缺失；不作为通过，也不推断已生成"})
            rows.append(row)
            continue
        facts = png_facts(path)
        row.update({"media_present": True, "actual": facts,
                    "size_matches_manifest": facts["size"] == list(job["size"]),
                    "sha_matches_manifest": facts["sha256"] == job["output_sha256"],
                    "bit_depth_8": facts["bit_depth"] == 8})
        binding = bindings[episode].get(panel_id)
        if binding is None:
            row.update({"bound_in_layout": False,
                        "note": "有素材但排版未绑定；组页前须先决定格位，不默认丢弃"})
            rows.append(row)
            continue
        bound_keys.add((episode, panel_id))
        rect = binding["rect"]
        image_rect = binding["image_rect"] or [0, 0, rect[2], rect[3]]
        fit = cover_fit(tuple(facts["size"]), (image_rect[2], image_rect[3]),
                        tuple(binding["focus"]))
        bound_path = episodes[episode] / binding["image"]
        row.update({"bound_in_layout": True, "page_id": binding["page_id"],
                    "panel_rect": rect, "image_target": image_rect, "focus": binding["focus"],
                    # 排版路径相对话目录、清单路径相对仓库根；只认真实解析后的同一文件。
                    "bound_file_matches_manifest": bound_path.resolve() == path.resolve(),
                    "fit": fit,
                    "recommendation": display_at_scale(tuple(facts["size"]), rect[2], max_scale)})
        rows.append(row)
    outside: list[dict[str, Any]] = []
    for episode, panels in bindings.items():
        for panel_id, binding in sorted(panels.items()):
            if (episode, panel_id) in bound_keys:
                continue
            target = episodes[episode] / binding["image"]
            present = target.is_file() and target.stat().st_size > 0
            outside.append({
                "episode": episode, "panel_id": panel_id, "page_id": binding["page_id"],
                "image": binding["image"], "media_present": present,
                # 早前批次的素材不在本轮41项队列里：有文件不等于本轮已核，缺文件才是媒体闸门拒绝的原因。
                "classification": "media_from_earlier_batch" if present else "missing_media",
                "note": "本队列外的排版格；整话媒体闸门只看文件是否真的就位"})
    missing_media = [row for row in outside if row["classification"] == "missing_media"]
    rendered = json.dumps(rows, ensure_ascii=False) + json.dumps(outside, ensure_ascii=False)
    require(not any(word in rendered for word in FORBIDDEN_IN_REPORT),
            "复核报告混入了正文/说话人等故事字段")
    grades: dict[str, int] = {}
    for row in rows:
        if row["bound_in_layout"]:
            grade = row["fit"]["clarity_grade"]
            grades[grade] = grades.get(grade, 0) + 1
    return {"status": "measured", "jobs": len(rows), "ready_and_bound": len(bound_keys),
            "layout_files": {name: path.as_posix() for name, path in layout_files.items()},
            "layout_panels_outside_queue": outside, "missing_media": missing_media,
            "clarity_grades": grades,
            "max_scale_policy": max_scale, "crop_loss_limit": CROP_LOSS_LIMIT,
            "panels": rows,
            "note": "仅真实文件与几何测量；不证明人物/手/持物/镜别正确，也不代替实看与创作者验收"}


def render_previews(report: dict[str, Any], out_dir: Path, font: Path | None = None,
                    sheet_width: int = 720, allowed_root: Path | None = None) -> dict[str, Any]:
    """导出“当前排版会显示的画面”，并按页拼接触表；只画工作ID，不排故事字。"""
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
    except ImportError as exc:  # pragma: no cover - 环境相关
        raise ReviewError('需要先安装 "Pillow>=10.4,<12"') from exc
    require(not out_dir.is_symlink(), "输出不能是符号链接")
    out_dir = out_dir.resolve()
    # 默认留在仓库内；显式换根（例如会话缓存）也必须在指定根内，不允许越界。
    root = (allowed_root or ROOT).resolve()
    require(root.is_dir(), f"预览根目录不存在: {root}")
    try:
        out_dir.relative_to(root)
    except ValueError as exc:
        raise ReviewError("预览输出必须在指定根目录内") from exc
    require(not out_dir.exists(), "预览目录已存在；选新目录，不覆盖历史收据")
    label = ImageFont.truetype(str(font), 24) if font is not None else ImageFont.load_default()
    panels_dir, sheets_dir = out_dir / "逐格当前显示", out_dir / "页接触表"
    panels_dir.mkdir(parents=True)
    sheets_dir.mkdir(parents=True)
    pages: dict[str, list[Path]] = {}
    written = 0
    for row in report["panels"]:
        if not row.get("bound_in_layout") or not row.get("media_present"):
            continue
        rect = row["panel_rect"]
        ix, iy, iw, ih = row["image_target"]
        with Image.open(ROOT / row["file"]) as original:
            original.load()
            oriented = ImageOps.exif_transpose(original).convert("RGBA")
        with Image.new("RGBA", oriented.size, "white") as backing:
            backing.alpha_composite(oriented)
            # 与 comic_tool.render 同参数：LANCZOS 覆盖式裁切，focus 决定保留哪一侧。
            fitted = ImageOps.fit(backing.convert("RGB"), (iw, ih),
                                  method=Image.Resampling.LANCZOS,
                                  centering=tuple(row["focus"]))
        with Image.new("RGB", (rect[2], rect[3]), "white") as sheet:
            sheet.paste(fitted, (ix, iy))
            draw = ImageDraw.Draw(sheet)
            if row["image_target"] != [0, 0, rect[2], rect[3]]:
                draw.rectangle((ix, iy, ix + iw - 1, iy + ih - 1), outline="black", width=2)
            target = panels_dir / f"{row['episode']}-{row['panel_id']}.png"
            sheet.save(target)
            written += 1
        pages.setdefault(f"{row['episode']}/{row['page_id']}", []).append(target)
        fitted.close()
        oriented.close()
    for name, files in sorted(pages.items()):
        blocks = []
        for path in files:
            with Image.open(path) as image:
                image.load()
                block = image.convert("RGB").resize(
                    (sheet_width, max(1, round(image.height * sheet_width / image.width))),
                    Image.Resampling.LANCZOS)
            with Image.new("RGB", (sheet_width, 34), "white") as bar:
                ImageDraw.Draw(bar).text((6, 4), path.stem.replace("-", " "), font=label, fill="black")
            blocks.append(bar)
            blocks.append(block)
        height = sum(block.height for block in blocks)
        with Image.new("RGB", (sheet_width, height), "white") as sheet:
            y = 0
            for block in blocks:
                sheet.paste(block, (0, y))
                y += block.height
            target = sheets_dir / f"{name.replace('/', '_')}.jpg"
            sheet.save(target, quality=82, subsampling=0)
    return {"status": "previews_written", "panel_previews": written,
            "contact_sheets": len(pages), "directory": out_dir.as_posix(),
            "note": "预览是当前候选几何的显示结果，不是成页贴字、手机或平台验收"}


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=MANIFEST)
    parser.add_argument("--report", type=Path, help="写入复核JSON；已存在则拒绝，不覆盖历史")
    parser.add_argument("--preview-dir", type=Path, help="导出逐格当前显示与页接触表（新目录）")
    parser.add_argument("--preview-root", type=Path, default=ROOT,
                        help="预览允许写入的根目录；默认仓库内，可显式指向会话缓存避免把中间图搬进Git")
    parser.add_argument("--font", type=Path, help="接触表工作ID标注字体；不排故事字")
    parser.add_argument("--sheet-width", type=int, default=720)
    parser.add_argument("--max-scale", type=float, default=2.0)
    parser.add_argument("--layout", action="append", default=[], metavar="CH002=排版候选.json",
                        help="可重复；用候选排版替代当前排版测量，便于组页前比较几何")
    args = parser.parse_args()
    try:
        overrides: dict[str, Path] = {}
        for item in args.layout:
            name, _, value = item.partition("=")
            require(bool(name.strip()) and bool(value.strip()), "--layout 必须写成 CH002=路径")
            require(name not in overrides, f"--layout 重复话别: {name}")
            overrides[name.strip()] = Path(value.strip())
        report = review(args.manifest, max_scale=args.max_scale, layouts=overrides or None)
        if args.report is not None:
            require(not args.report.exists(), "报告已存在；选新文件名，不覆盖历史")
            args.report.parent.mkdir(parents=True, exist_ok=True)
            args.report.write_text(json.dumps(report, ensure_ascii=False, indent=1) + "\n",
                                   encoding="utf-8")
            report["report_file"] = args.report.as_posix()
        if args.preview_dir is not None:
            report["previews"] = render_previews(report, args.preview_dir, args.font,
                                                 args.sheet_width, args.preview_root)
    except (ReviewError, ValueError, OSError) as exc:
        print(json.dumps({"status": "invalid", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(report, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

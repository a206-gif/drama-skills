#!/usr/bin/env python3
"""Validate a static-comic layout; optionally letter and export static pages."""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
import tempfile
from pathlib import Path
from typing import Any

MINIMUM_PYTHON = (3, 9)
IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
KINDS = {"dialogue", "thought", "narration", "sfx"}
NO_START = set("，。、；：？！）》】〕〉」』…,.!?;:%)]}")
NO_END = set("（《【〔〈「『([{")


class ComicError(ValueError):
    """A project cannot be exported without an explicit author/layout change."""


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ComicError(message)


def fields(value: Any, required: set[str], optional: set[str], where: str) -> None:
    require(isinstance(value, dict), f"{where}: 必须是对象")
    require(required <= value.keys(), f"{where}: 缺少字段 {sorted(required - value.keys())}")
    require(not value.keys() - required - optional,
            f"{where}: 未知字段 {sorted(value.keys() - required - optional)}")


def integer(value: Any, minimum: int, where: str) -> None:
    require(type(value) is int and value >= minimum, f"{where}: 必须是 >= {minimum} 的整数")


def local_file(root: Path, value: Any) -> Path:
    require(isinstance(value, str) and bool(value.strip()), "输入路径必须是非空字符串")
    require(not any(c in value for c in ("\\", ":", "\0"))
            and all(p not in {"", ".", ".."} for p in value.split("/")),
            f"输入必须是目录内的相对路径: {value!r}")
    target = (root / value).resolve()
    require(root in target.parents, f"输入路径越界: {value!r}")
    return target


def read_script(path: Path) -> list[dict[str, Any]]:
    pages: list[dict[str, Any]] = []
    page = panel = current = None
    seen: set[str] = set()
    fenced = False
    for number, line in enumerate(path.read_text(encoding="utf-8-sig").splitlines(), 1):
        if line.startswith("```"):
            require(current is None, f"分镜第 {number} 行: 创作字段内不能使用代码块")
            fenced = not fenced
            continue
        if fenced:
            continue
        if re.match(r"^#{2,}\s", line):
            match = re.fullmatch(r"(#{2,4}) (PAGE-\d{3,}|PANEL-\d{3,}-\d{2,}|TEXT-\d{3,}-\d{2,})", line)
            require(match is not None, f"分镜第 {number} 行: 页/格/文字标题不规范")
            level, identity = len(match[1]), match[2]
            prefix = {2: "PAGE-", 3: "PANEL-", 4: "TEXT-"}[level]
            require(identity.startswith(prefix), f"{identity}: 标题层级错误")
            require(identity not in seen, f"重复 ID: {identity}")
            seen.add(identity)
            current = {"id": identity, "fields": {}}
            if level == 2:
                page = current
                page["panels"] = []
                pages.append(page)
                panel = None
            elif level == 3:
                require(page is not None, f"{identity}: 格前缺少页")
                require(identity.startswith("PANEL-" + page["id"][5:] + "-"),
                        f"{identity}: 格编号与所在页不符")
                panel = current
                panel["texts"] = []
                page["panels"].append(panel)
            else:
                require(panel is not None, f"{identity}: 文字前缺少格")
                require(identity.startswith("TEXT-" + page["id"][5:] + "-"),
                        f"{identity}: 文字编号与所在页不符")
                panel["texts"].append(current)
        elif current is not None:
            match = re.fullmatch(r"- ([^：]+)：(.*)", line)
            if match:
                key, value = match[1].strip(), match[2].strip()
                require(key not in current["fields"], f"{current['id']}: 重复字段 {key}")
                current["fields"][key] = value
            elif line.strip():
                raise ComicError(f"分镜第 {number} 行: 字段必须使用单行 '- 名称：正文' 格式，不能静默忽略续行")
    require(not fenced, "分镜存在未闭合的代码块")
    require(bool(pages), "分镜没有 PAGE 页")
    for page in pages:
        require(bool(page["fields"].get("本页职责")), f"{page['id']}: 缺少本页职责")
        require(bool(page["panels"]), f"{page['id']}: 没有格")
        for panel in page["panels"]:
            for key in ("来源", "信息", "画面", "衔接", "提示词"):
                require(bool(panel["fields"].get(key)), f"{panel['id']}: 缺少{key}")
            for text in panel["texts"]:
                data = text["fields"]
                require(data.get("类型") in KINDS, f"{text['id']}: 未知文字类型")
                require(bool(data.get("正文")), f"{text['id']}: 缺少正文")
                if data["类型"] in {"dialogue", "thought"}:
                    require(bool(data.get("说话人")) and data["说话人"] != "无",
                            f"{text['id']}: 缺少说话人")
                if data["类型"] == "dialogue":
                    require(bool(data.get("对话对象")) and data["对话对象"] != "无",
                            f"{text['id']}: 缺少对话对象")
                if data["类型"] == "narration":
                    require(bool(data.get("叙述身份")) and data["叙述身份"] != "无",
                            f"{text['id']}: 缺少叙述身份")
    return pages


def read_episode(path: Path, pages: list[dict[str, Any]]) -> dict[str, Any]:
    """Read only declared handoff facts; anchors are not proof of narrative truth."""
    required = {"本话编号", "连载关系", "上话编号", "入口状态", "出口状态"}
    records = {"承接事件": {}, "待续事件": {}}
    empty: set[str] = set()
    metadata: dict[str, str] = {}
    anchors = {panel["id"] for page in pages for panel in page["panels"]}
    anchors.update(text["id"] for page in pages for panel in page["panels"] for text in panel["texts"])
    fenced = False
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith("```"):
            fenced = not fenced
            continue
        if fenced:
            continue
        if line.startswith("## PAGE-"):
            break
        match = re.fullmatch(r"- ([^：]+)：(.*)", line)
        if not match:
            continue
        key, value = match[1].strip(), match[2].strip()
        if key in required | {"独立篇依据"}:
            require(key not in metadata, f"话头重复字段: {key}")
            require(bool(value), f"话头缺少{key}")
            metadata[key] = value
        elif key in records:
            require(key not in empty, f"{key}: 无不能与其他记录并存或重复")
            if value == "无":
                require(not records[key], f"{key}: 无不能与事件并存")
                empty.add(key)
                continue
            count = 4 if key == "承接事件" else 3
            parts = [part.strip() for part in value.split("|", count - 1)]
            require(len(parts) == count and all(parts), f"{key}: 事件记录字段不全")
            identity, *_, where, state = parts
            require(re.fullmatch(r"EVT-[A-Z0-9]+(?:-[A-Z0-9]+)*", identity) is not None,
                    f"{key}: 事件 ID 不规范 {identity!r}")
            require(identity not in records[key], f"{key}: 重复事件 {identity}")
            references = [item.strip() for item in re.split(r"[,、]", where)]
            require(all(item in anchors for item in references),
                    f"{identity}: 落点必须指向本话存在的 PANEL/TEXT，不能仅写制作备注")
            record = {"anchors": references, "state": state}
            if key == "承接事件":
                require(parts[1] in {"继续", "解决", "明确暂缓"}, f"{identity}: 未知承接状态")
                record["status"] = parts[1]
            records[key][identity] = record
    require(required <= metadata.keys(), f"话头缺少字段: {sorted(required - metadata.keys())}")
    for key in records:
        require(bool(records[key]) or key in empty, f"话头缺少{key}；没有事件也需明确写无")
    identity, relation, previous = (metadata[key] for key in ("本话编号", "连载关系", "上话编号"))
    require(re.fullmatch(r"CH[0-9]{3,}", identity) is not None and int(identity[2:]) > 0,
            "本话编号必须为 CH001 等正整数编号")
    require(relation in {"首话", "续话", "独立篇"}, "连载关系必须为首话/续话/独立篇")
    if relation == "续话":
        require(re.fullmatch(r"CH[0-9]{3,}", previous) is not None, "续话必须记录有效上话编号")
    else:
        require(previous == "无" and not records["承接事件"], "首话/独立篇不能伪称承接上话")
        if relation == "首话":
            require(int(identity[2:]) == 1, "首话必须从 CH001 开始；后续不能重置为首话")
        else:
            require(bool(metadata.get("独立篇依据")), "独立篇缺少独立篇依据：须记录创作者已批准独立选段，不能借此丢弃待续")
    for event, record in records["承接事件"].items():
        if record["status"] == "解决":
            require(event not in records["待续事件"], f"{event}: 已解决不能同时待续")
        else:
            require(event in records["待续事件"], f"{event}: 继续/明确暂缓的事件必须保留待续")
    return {"id": identity, "relation": relation, "previous": previous,
            "entry": metadata["入口状态"], "exit": metadata["出口状态"],
            "incoming": records["承接事件"], "outgoing": records["待续事件"]}


def check_continuity(path: Path, pages: list[dict[str, Any]], previous: Path | None) -> dict[str, Any]:
    episode = read_episode(path, pages)
    episode["checked_previous"] = None
    if episode["relation"] != "续话":
        require(previous is None, "提供了上话却标首话/独立篇；不能静默忽略上话或清空待续")
        return episode
    require(previous is not None, "续话必须提供 --previous 上一话/漫画分镜.md，不能略过上话核对")
    previous = previous.resolve()
    require(previous != path.resolve(), "上一话不能指向本话自己")
    prior = read_episode(previous, read_script(previous))
    require(episode["previous"] == prior["id"], "上话编号与实际提供的上一话不一致")
    require(int(episode["id"][2:]) == int(prior["id"][2:]) + 1, "必须逐话承接，不能跳话")
    missing = prior["outgoing"].keys() - episode["incoming"].keys()
    extra = episode["incoming"].keys() - prior["outgoing"].keys()
    require(not missing and not extra,
            f"跨话事件未对齐；未承接 {sorted(missing)}；不在上话待续 {sorted(extra)}")
    episode["checked_previous"] = prior["id"]
    return episode


def rectangle(value: Any, width: int, height: int, margin: int, where: str) -> None:
    require(isinstance(value, list) and len(value) == 4, f"{where}: rect 必须有四个整数")
    for i, component in enumerate(value):
        integer(component, 0 if i < 2 else 1, where)
    x, y, w, h = value
    require(x >= margin and y >= margin and x + w <= width - margin
            and y + h <= height - margin, f"{where}: 框体超出边界或安全边距")


def intersects(a: list[int], b: list[int]) -> bool:
    return a[0] < b[0] + b[2] and b[0] < a[0] + a[2] and a[1] < b[1] + b[3] and b[1] < a[1] + a[3]


def matching(actual: Any, expected: list[dict[str, Any]], where: str) -> None:
    require(isinstance(actual, list), f"{where}: 必须是列表")
    require(all(isinstance(item, dict) for item in actual), f"{where}: 条目必须是对象")
    require([item.get("id") for item in actual] == [item["id"] for item in expected],
            f"{where}: ID/顺序与分镜不一致，必须逐一匹配且不丢项")


def unique_json(pairs: list[tuple[str, Any]]) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for key, value in pairs:
        require(key not in result, f"JSON 重复字段: {key}")
        result[key] = value
    return result


def lettering_config(layout: dict[str, Any]) -> dict[str, Any]:
    """Keep speaker/type in the source while allowing different visible strategies."""
    value = layout.get("lettering", {"mode": "labelled"})
    fields(value, {"mode"}, {"bubble_opacity", "speakers"}, "lettering")
    require(isinstance(value["mode"], str) and value["mode"] in {"labelled", "embedded"}, "lettering/mode 必须为 labelled 或 embedded")
    require(value["mode"] == "embedded" or value.keys() == {"mode"},
            "透明度/人物样式仅用于 embedded；旧标签模式不静默忽略样式")
    opacity = value.get("bubble_opacity", 96)
    integer(opacity, 0, "lettering/bubble_opacity")
    require(opacity <= 255, "lettering/bubble_opacity 必须在 0–255")
    speakers = value.get("speakers", {})
    require(isinstance(speakers, dict), "lettering/speakers 必须为对象")
    for name, style in speakers.items():
        require(isinstance(name, str) and bool(name.strip()) and name == name.strip(),
                "lettering/speakers 人物名必须为非空完整姓名，不含首尾空白")
        fields(style, set(), {"color", "dialogue_shape", "thought_shape"}, "lettering/" + name)
        if "color" in style:
            require(isinstance(style["color"], str)
                    and re.fullmatch(r"#[0-9a-fA-F]{6}", style["color"]) is not None,
                    "lettering/color 必须为 #RRGGBB")
        for key in ("dialogue_shape", "thought_shape"):
            if key in style:
                require(isinstance(style[key], str) and style[key] in {"round", "oval", "rect", "none"},
                        "lettering/shape 必须为 round、oval、rect 或 none")
    return value


def lettering_style(config: dict[str, Any], source: dict[str, Any]) -> dict[str, Any]:
    kind = source["fields"]["类型"]
    mode = config["mode"]
    actor = config.get("speakers", {}).get(source["fields"].get("说话人"), {}) \
        if kind in {"dialogue", "thought"} else {}
    shape = {"dialogue": "round", "thought": "oval", "narration": "rect", "sfx": "none"}[kind]
    if mode == "embedded":
        shape = actor.get(kind + "_shape", shape)
    return {"mode": mode, "shape": shape, "opacity": config.get("bubble_opacity", 96),
            "color": actor.get("color", "#20282C")}


def load_project(path: Path, media: bool = False, previous: Path | None = None) -> dict[str, Any]:
    path = path.resolve()
    root = path.parent
    data = json.loads(path.read_text(encoding="utf-8-sig"), object_pairs_hook=unique_json)
    fields(data, {"version", "storyboard", "canvas", "pages"}, {"lettering"}, "排版")
    lettering_config(data)
    require(type(data["version"]) is int and data["version"] == 1, "不支持的排版 version")
    canvas = data["canvas"]
    fields(canvas, {"width", "height", "margin"}, set(), "canvas")
    for key in ("width", "height", "margin"):
        integer(canvas[key], 0 if key == "margin" else 1, key)
    w, h, margin = (canvas[key] for key in ("width", "height", "margin"))
    require(max(w, h) <= 8192 and w * h <= 32_000_000, "画布超出本地工具资源上限")
    require(2 * margin < min(w, h), "页边距吃完了画布")
    script_path = local_file(root, data["storyboard"])
    script = read_script(script_path)
    continuity = check_continuity(script_path, script, previous)
    matching(data["pages"], script, "pages")
    for page, authored in zip(data["pages"], script):
        fields(page, {"id", "panels"}, set(), page["id"])
        matching(page["panels"], authored["panels"], page["id"])
        placed: list[list[int]] = []
        row_top, row_bottom, right = -1, 0, 0
        for panel, source in zip(page["panels"], authored["panels"]):
            identity = panel["id"]
            fields(panel, {"id", "rect", "image", "texts"}, {"focus", "image_rect"}, identity)
            rectangle(panel["rect"], w, h, margin, identity)
            box = panel["rect"]
            require(not any(intersects(box, other) for other in placed), f"{identity}: 漫画格相交")
            x, y, pw, ph = box
            if "image_rect" in panel:
                rectangle(panel["image_rect"], pw, ph, 0, identity + "/image_rect")
            if y == row_top:
                require(x >= right, f"{identity}: 同行必须从左到右")
                row_bottom = max(row_bottom, y + ph)
            else:
                require(y >= row_bottom, f"{identity}: 必须按从上到下的矩形行带阅读")
                row_top, row_bottom = y, y + ph
            right = x + pw
            placed.append(box)
            focus = panel.get("focus", [0.5, 0.5])
            require(isinstance(focus, list) and len(focus) == 2
                    and all(type(n) in (int, float) and math.isfinite(n) and 0 <= n <= 1 for n in focus),
                    f"{identity}: focus 必须是两个 0–1 数值")
            image = local_file(root, panel["image"])
            require(image.suffix.lower() in IMAGE_SUFFIXES, f"{identity}: 不支持的格图格式")
            if media:
                require(image.is_file() and image.stat().st_size > 0, f"{identity}: 格图缺失或为空")
            matching(panel["texts"], source["texts"], identity + "/texts")
            text_boxes: list[list[int]] = []
            for text, written in zip(panel["texts"], source["texts"]):
                tid = text["id"]
                fields(text, {"id", "rect", "font_size"}, {"padding", "tail", "breaks"}, tid)
                if "breaks" in text:
                    check_breaks(written["fields"]["正文"], text["breaks"], tid)
                rectangle(text["rect"], pw, ph, 0, tid)
                require(not any(intersects(text["rect"], other) for other in text_boxes), f"{tid}: 文字框相交")
                text_boxes.append(text["rect"])
                integer(text["font_size"], 1, tid + "/font_size")
                require(text["font_size"] <= 8192, f"{tid}: 字号超出资源上限")
                padding = text.get("padding", 20)
                integer(padding, 0, tid + "/padding")
                require(2 * padding < min(text["rect"][2:]), f"{tid}: 内边距吃完了文字框")
                if "tail" in text:
                    require(written["fields"]["类型"] in {"dialogue", "thought"}, f"{tid}: 当前文字类型不能有尾巴")
                    tail = text["tail"]
                    require(isinstance(tail, list) and len(tail) == 2, f"{tid}: tail 必须有两个整数")
                    for component in tail:
                        integer(component, 0, tid + "/tail")
                    tx, ty = tail
                    require(tx < pw and ty < ph, f"{tid}: 气泡尾巴超出格子")
                    bx, by, bw, bh = text["rect"]
                    require(not (bx <= tx <= bx + bw and by <= ty <= by + bh), f"{tid}: 尾端点必须在本气泡框外")
    return {"root": root, "layout": data, "script": script, "continuity": continuity}


def summary(plan: dict[str, Any], media: bool) -> dict[str, Any]:
    pages = plan["layout"]["pages"]
    return {"status": "valid", "pages": len(pages),
            "panels": sum(len(page["panels"]) for page in pages),
            "texts": sum(len(panel["texts"]) for page in pages for panel in page["panels"]),
            "media_checked": media, "episode": plan["continuity"]["id"],
            "checked_previous": plan["continuity"]["checked_previous"],
            "pending_events": list(plan["continuity"]["outgoing"]),
            "note": "仅结构/相邻交接记录核对；不证明事件真的解决、图文准确、授权或平台发布通过"}


def preview_plan(plan: dict[str, Any], page_ids: list[str]) -> dict[str, Any]:
    """Select existing pages without disguising a partial episode as a new one."""
    require(isinstance(page_ids, list) and bool(page_ids)
            and all(isinstance(identity, str) for identity in page_ids),
            "preview 必须明确选择非空页 ID 列表")
    require(len(page_ids) == len(set(page_ids)), "preview 页 ID 不能重复")
    wanted = set(page_ids)
    known = {page["id"] for page in plan["layout"]["pages"]}
    require(wanted <= known, f"preview 未知页 ID: {sorted(wanted - known)}")
    pairs = [(page, source) for page, source in zip(plan["layout"]["pages"], plan["script"])
             if page["id"] in wanted]
    for page, _ in pairs:
        for panel in page["panels"]:
            image = local_file(plan["root"], panel["image"])
            require(image.is_file() and image.stat().st_size > 0,
                    f"{panel['id']}: 预览所选页格图缺失或为空")
    return {**plan, "layout": {**plan["layout"], "pages": [page for page, _ in pairs]},
            "script": [source for _, source in pairs],
            "preview_scope": {"selected_pages": [page["id"] for page, _ in pairs],
                              "episode_pages": plan.get("preview_scope", {}).get(
                                  "episode_pages", len(plan["layout"]["pages"]))}}


def wrap_text(text: str, font: Any, width: int) -> list[str]:
    def measured(value: str) -> float:
        box = font.getbbox(value)
        return max(font.getlength(value), box[2] - box[0])

    lines: list[str] = []
    remaining = text
    while remaining:
        end = 0
        while end < len(remaining) and measured(remaining[:end + 1]) <= width:
            end += 1
        require(end > 0, "文字框过窄，单个字也放不下")
        if end < len(remaining):
            while end > 0 and (remaining[end] in NO_START or remaining[end - 1] in NO_END):
                end -= 1
            require(end > 0, "文字框过窄，无法在保留标点位置的情况下换行")
        lines.append(remaining[:end])
        remaining = remaining[end:]
    return lines


def visible_label(source: dict[str, Any], language: str = "zh") -> str:
    """Derive reader-visible identity from the same Markdown as the body."""
    require(language in {"zh", "en"}, "名签语言必须为 zh 或 en")
    data = source["fields"]
    kind = data["类型"]
    if kind == "sfx":
        return ""
    if kind == "narration":
        identity = data["叙述身份"]
        return f"旁白｜{identity}" if language == "zh" else f"Narration / {identity}"
    identity = data["说话人"]
    names = {"dialogue": "对白", "thought": "内心"}
    return f"{identity}｜{names[kind]}" if language == "zh" else f"{identity} / {kind}"


def check_breaks(value: str, breaks: Any, where: str) -> None:
    require(isinstance(breaks, list) and all(type(i) is int and 0 < i < len(value) for i in breaks),
            f"{where}: breaks 必须为正文内的正整数断点列表")
    require(breaks == sorted(set(breaks)), f"{where}: breaks 必须递增且不重复")
    require(all(value[i] not in NO_START and value[i - 1] not in NO_END for i in breaks),
            f"{where}: 手工断行不能把标点放到行首或把开括号放到行尾")


def measured_lines(value: str, font: Any, width: int, where: str,
                   breaks: list[int] | None = None) -> dict[str, Any]:
    require(len(value) <= 100_000, f"{where}: 文字超出排字资源上限")
    missing = font.getmask("\U0010ffff")
    signature = missing.size, bytes(missing)
    for character in set(value) - set(" \t"):
        mask = font.getmask(character)
        require((mask.size, bytes(mask)) != signature, f"{where}: 字体缺字 {character!r}")
    if breaks is not None:
        check_breaks(value, breaks, where)
    points = [0, *(breaks or []), len(value)]
    lines = [line for start, end in zip(points, points[1:])
             for line in wrap_text(value[start:end], font, width)]
    boxes = [font.getbbox(line, anchor="ls") for line in lines]
    top = min(box[1] for box in boxes)
    bottom = max(box[3] for box in boxes)
    step = math.ceil(font.size * 1.3)
    used = step * (len(lines) - 1) + bottom - top
    return {"lines": lines, "boxes": boxes, "top": top, "step": step, "used": used}


def letter_metrics(text: dict[str, Any], source: dict[str, Any], font: Any,
                   label_font: Any = None, label_language: str = "zh",
                   style: dict[str, Any] | None = None) -> dict[str, Any]:
    kind = source["fields"]["类型"]
    style = style or lettering_style({"mode": "labelled"}, source)
    embedded = style["mode"] == "embedded"
    _, _, width, height = text["rect"]
    padding = text.get("padding", 20)
    iw, ih = width - 2 * padding, height - 2 * padding
    if embedded:
        iw, ih = iw - 4, ih - 4  # Keep the opaque two-pixel text halo inside the measured box.
    if style["shape"] == "oval":
        iw, ih = math.floor(iw / math.sqrt(2)), math.floor(ih / math.sqrt(2))
    if kind == "sfx":
        iw, ih = iw - 4, ih - 4
    body = measured_lines(source["fields"]["正文"], font, iw, text["id"], text.get("breaks"))
    label_value = "" if embedded else visible_label(source, label_language)
    label, gap = None, 0
    if label_value:
        if label_font is None:
            label_font = font.font_variant(size=max(1, round(font.size * 0.75)))
        label = measured_lines(label_value, label_font, iw, f"{text['id']} 名签")
        label["font"] = label_font
        gap = max(4, math.ceil(font.size * 0.2))
    used = body["used"] + (label["used"] + gap if label else 0)
    require(used <= ih,
            f"{text['id']}: 文字高度溢出（{'画内正文' if embedded else '含可见名签'}）；增框、改版式或回分镜改字，不能自动缩字")
    return {**body, "used": used, "label": label, "gap": gap, "style": style}


def draw_lettering(draw: Any, text: dict[str, Any], source: dict[str, Any],
                   font: Any, metrics: dict[str, Any], offset: tuple[int, int]) -> None:
    px, py = offset
    x, y, w, h = text["rect"]
    x, y = px + x, py + y
    bounds = (x, y, x + w - 1, y + h - 1)
    kind = source["fields"]["类型"]
    style = metrics["style"]
    embedded = style["mode"] == "embedded"
    shape = style["shape"]
    color = tuple(int(style["color"][i:i + 2], 16) for i in (1, 3, 5))
    fill = (255, 255, 255, style["opacity"]) if embedded else "white"
    outline = (*color, round(style["opacity"] * 0.6)) if embedded else "black"
    border = 1 if embedded else 2
    if "tail" in text:
        tx, ty = px + text["tail"][0], py + text["tail"][1]
        cx, cy = x + w / 2, y + h / 2
        dx, dy = tx - cx, ty - cy
        scale = min((w / 2) / abs(dx) if dx else math.inf,
                    (h / 2) / abs(dy) if dy else math.inf)
        bx, by = cx + dx * scale, cy + dy * scale
        if kind == "thought":
            if shape == "oval":
                # Start on the ellipse only when there actually is an ellipse.
                scale = 1 / math.sqrt((dx / (w / 2)) ** 2 + (dy / (h / 2)) ** 2)
                bx, by = cx + dx * scale, cy + dy * scale
            for fraction, radius in ((0.3, 6), (0.7, 4)):
                dotx, doty = bx + (tx - bx) * fraction, by + (ty - by) * fraction
                radius = min(radius, dotx - px, doty - py)
                draw.ellipse((dotx - radius, doty - radius, dotx + radius, doty + radius),
                             fill=fill, outline=outline, width=border)
        else:
            delta = min(12, w / 8, h / 8)
            # Inset the base so its black edge is covered by the balloon.
            if abs(dx) / w > abs(dy) / h:
                base = [(bx - math.copysign(4, dx), by - delta),
                        (bx - math.copysign(4, dx), by + delta)]
            else:
                base = [(bx - delta, by - math.copysign(4, dy)),
                        (bx + delta, by - math.copysign(4, dy))]
            draw.polygon([*base, (tx, ty)], fill=fill, outline=outline, width=border)
    if shape == "round":
        draw.rounded_rectangle(bounds, radius=min(w, h) // 5, fill=fill, outline=outline, width=border)
    elif shape == "oval":
        draw.ellipse(bounds, fill=fill, outline=outline, width=border)
    elif shape == "rect":
        draw.rectangle(bounds, fill=fill, outline=outline, width=border)
    content_top = y + (h - metrics["used"]) / 2
    label = metrics["label"]
    if label:
        baseline = content_top - label["top"]
        for index, (line, box) in enumerate(zip(label["lines"], label["boxes"])):
            left = x + (w - (box[2] - box[0])) / 2 - box[0]
            draw.text((left, baseline + index * label["step"]), line,
                      font=label["font"], fill="black", anchor="ls")
        content_top += label["used"] + metrics["gap"]
    baseline = content_top - metrics["top"]
    for index, (line, box) in enumerate(zip(metrics["lines"], metrics["boxes"])):
        left = (x + text.get("padding", 20) - box[0] if embedded and shape == "none"
                else x + (w - (box[2] - box[0])) / 2 - box[0])
        draw.text((left, baseline + index * metrics["step"]), line, font=font,
                  fill=(*color, 255) if embedded else "black", anchor="ls",
                  stroke_width=2 if kind == "sfx" or embedded else 0,
                  stroke_fill=(255, 255, 255, 255) if embedded else "white")


def speaker_font_options(values: list[str]) -> dict[str, Path]:
    result: dict[str, Path] = {}
    for value in values:
        name, separator, filename = value.partition("=")
        name, filename = name.strip(), filename.strip()
        require(bool(separator and name and filename), "--speaker-font 必须为 姓名=字体文件路径")
        require(name not in result, f"--speaker-font 重复人物: {name}")
        result[name] = Path(filename)
    return result


def render(plan: dict[str, Any], font_path: Path, out: Path, image_format: str,
           speaker_fonts: dict[str, Path] | None = None, label_language: str = "zh") -> dict[str, Any]:
    try:
        from PIL import Image, ImageDraw, ImageFont, ImageOps
    except ImportError as exc:
        raise ComicError('渲染需要先安装 "Pillow>=10.4,<12"；check 不需要此依赖') from exc
    require(image_format in {"png", "jpg"}, "输出格式必须是 png 或 jpg")
    require(font_path.is_file(), "必须显式提供实际可用的中文字体文件")
    require(label_language in {"zh", "en"}, "名签语言必须为 zh 或 en")
    config = lettering_config(plan["layout"])
    embedded = config["mode"] == "embedded"
    speaker_fonts = speaker_fonts or {}
    for name, path in speaker_fonts.items():
        require(bool(name.strip()) and path.is_file(),
                f"{name}: {'专属字体' if embedded else '专属名签字体'}不存在")
    require(not out.is_symlink(), "输出不能是符号链接")
    out = out.resolve()
    require(not out.exists(), "输出目录已存在；请选新目录，不覆盖旧版")
    layout = plan["layout"]
    canvas = layout["canvas"]
    fonts: dict[tuple[Path, int], Any] = {}
    label_fonts: dict[tuple[Path, int], Any] = {}
    prepared: dict[str, Any] = {}
    for page, authored in zip(layout["pages"], plan["script"]):
        for panel, source in zip(page["panels"], authored["panels"]):
            for text, written in zip(panel["texts"], source["texts"]):
                size = text["font_size"]
                actor_path = speaker_fonts.get(written["fields"].get("说话人", ""), font_path) \
                    if written["fields"]["类型"] in {"dialogue", "thought"} else font_path
                body_key = (actor_path if embedded else font_path), size
                if body_key not in fonts:
                    fonts[body_key] = ImageFont.truetype(str(body_key[0]), size)
                key = actor_path, max(1, round(size * 0.75))
                label_font = None
                if not embedded:
                    if key not in label_fonts:
                        label_fonts[key] = ImageFont.truetype(str(key[0]), key[1])
                    label_font = label_fonts[key]
                metrics = letter_metrics(text, written, fonts[body_key], label_font, label_language,
                                         lettering_style(config, written))
                prepared[text["id"]] = {**metrics, "body_font": fonts[body_key]}
    out.parent.mkdir(parents=True, exist_ok=True)
    outputs: list[str] = []
    with tempfile.TemporaryDirectory(prefix=".comic-render-", dir=out.parent) as temporary:
        staged = Path(temporary) / "pages"
        staged.mkdir()
        for page, authored in zip(layout["pages"], plan["script"]):
            with Image.new("RGB", (canvas["width"], canvas["height"]), "white") as sheet:
                draw = ImageDraw.Draw(sheet)
                for panel, source in zip(page["panels"], authored["panels"]):
                    x, y, w, h = panel["rect"]
                    ix, iy, iw, ih = panel.get("image_rect", [0, 0, w, h])
                    image_path = local_file(plan["root"], panel["image"])
                    try:
                        original = Image.open(image_path)
                    except Image.DecompressionBombError as exc:
                        raise ComicError(f"{panel['id']}: 格图超出解码资源上限") from exc
                    with original:
                        require(original.width * original.height <= 32_000_000,
                                f"{panel['id']}: 格图超出 3200 万像素的解码资源上限")
                        require(getattr(original, "n_frames", 1) == 1, f"{panel['id']}: 格图必须是静态图片")
                        oriented = ImageOps.exif_transpose(original).convert("RGBA")
                        backing = Image.new("RGBA", oriented.size, "white")
                        backing.alpha_composite(oriented)
                        fitted = ImageOps.fit(backing.convert("RGB"), (iw, ih),
                                              method=Image.Resampling.LANCZOS,
                                              centering=tuple(panel.get("focus", [0.5, 0.5])))
                        sheet.paste(fitted, (x + ix, y + iy))
                        fitted.close()
                        backing.close()
                        oriented.close()
                    if "image_rect" in panel:
                        draw.rectangle((x + ix, y + iy, x + ix + iw - 1, y + iy + ih - 1),
                                       outline="black", width=2)
                    draw.rectangle((x, y, x + w - 1, y + h - 1), outline="black", width=3)
                    # Paint into the panel crop so tails/outlines cannot leak into another panel.
                    with sheet.crop((x, y, x + w, y + h)).convert("RGBA" if embedded else "RGB") as lettered:
                        local_draw = ImageDraw.Draw(lettered)
                        for text, written in zip(panel["texts"], source["texts"]):
                            metrics = prepared[text["id"]]
                            if embedded:
                                # Draw translucent balloons once, then composite; keep glyphs opaque.
                                with Image.new("RGBA", (w, h), (0, 0, 0, 0)) as overlay:
                                    draw_lettering(ImageDraw.Draw(overlay), text, written,
                                                   metrics["body_font"], metrics, (0, 0))
                                    lettered.alpha_composite(overlay)
                            else:
                                draw_lettering(local_draw, text, written, metrics["body_font"], metrics, (0, 0))
                        sheet.paste(lettered, (x, y))
                name = f"{page['id']}.{image_format}"
                sheet.save(staged / name, **({"quality": 95, "subsampling": 0} if image_format == "jpg" else {}))
                outputs.append(str(out / name))
        # Only a completed batch becomes visible. Never merge with an existing directory.
        require(not out.exists(), "输出目录在渲染期间出现；未覆盖该目录")
        staged.rename(out)
    result = {"status": "rendered", "pages": len(outputs), "outputs": outputs,
            "episode": plan["continuity"]["id"], "checked_previous": plan["continuity"]["checked_previous"],
            "visible_labels": False if embedded else label_language,
            "lettering_mode": config["mode"], "speaker_font_names": sorted(speaker_fonts),
            "note": "仅本地静态图片；仍需手机/平台预览、授权与内容检查，未上传"}
    if "preview_scope" in plan:
        result.update({"status": "preview_rendered", "scope": "selected_pages",
                       **plan["preview_scope"], "selected_media_checked": True,
                       "episode_media_checked": False,
                       "note": "局部实图试排；已核全话结构/相邻交接及所选页媒体，未核其余格图；不是全话发布、手机/平台或内容验收"})
    return result


def main(argv: list[str] | None = None) -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    check = commands.add_parser("check", help="检查结构与几何，不生成媒体")
    check.add_argument("layout", type=Path)
    check.add_argument("--media", action="store_true", help="同时检查格图文件就位")
    export = commands.add_parser("render", help="全话格图齐后导出静态 PNG/JPG")
    preview = commands.add_parser("preview", help="明确选择已齐图的局部页试排，不冒称全话媒体齐套")
    preview.add_argument("--page", action="append", required=True, metavar="PAGE-001",
                         help="可重复；只导出指定页，保持原分镜阅读顺序")
    for target in (export, preview):
        target.add_argument("layout", type=Path)
        target.add_argument("--font", type=Path, required=True)
        target.add_argument("--speaker-font", action="append", default=[], metavar="姓名=字体路径",
                            help="可重复；embedded 用于此人物全部正文，labelled 仅换名签；其余用 --font")
        target.add_argument("--label-language", choices=("zh", "en"), default="zh",
                            help="可见类型标签语言，默认中文；字体必须覆盖名签与正文")
        target.add_argument("--out", type=Path, required=True)
        target.add_argument("--format", choices=("png", "jpg"), default="png")
    for command in (check, export, preview):
        command.add_argument("--previous", type=Path, help="续话必填：实际上一话的漫画分镜 Markdown")
    args = parser.parse_args(argv)
    try:
        media = args.command == "render" or (args.command == "check" and args.media)
        plan = load_project(args.layout, media=media, previous=args.previous)
        if args.command == "check":
            result = summary(plan, media)
        else:
            if args.command == "preview":
                plan = preview_plan(plan, args.page)
            result = render(plan, args.font, args.out, args.format,
                            speaker_font_options(args.speaker_font), args.label_language)
    except (ValueError, OSError, RuntimeError) as exc:
        print(json.dumps({"status": "invalid", "error": str(exc)}, ensure_ascii=False))
        return 1
    print(json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

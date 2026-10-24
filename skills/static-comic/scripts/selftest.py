#!/usr/bin/env python3
"""Exercise the standalone static-comic contract without images or Pillow."""
from __future__ import annotations

import copy
import json
import shutil
import tempfile
from pathlib import Path

from comic_tool import ComicError, load_project, preview_plan, require, summary

MINIMUM_PYTHON = (3, 9)


def main() -> int:
    assets = Path(__file__).resolve().parents[1] / "assets"
    with tempfile.TemporaryDirectory(prefix="static-comic-") as directory:
        root = Path(directory)
        shutil.copyfile(assets / "漫画分镜.md", root / "漫画分镜.md")
        layout = root / "排版.json"
        original = json.loads((assets / "page-layout.example.json").read_text(encoding="utf-8"))

        def write(data: dict) -> None:
            layout.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")

        write(original)
        result = summary(load_project(layout), media=False)
        require((result["pages"], result["panels"], result["texts"]) == (2, 7, 7), "合成示例计数不符")
        windowed = copy.deepcopy(original)
        first = windowed["pages"][0]["panels"][0]
        first["image_rect"] = [0, 0, first["rect"][2], first["rect"][3] // 2]
        write(windowed)
        load_project(layout)
        outside = copy.deepcopy(windowed)
        outside["pages"][0]["panels"][0]["image_rect"][2] += 1
        mutations = [outside]
        omitted = copy.deepcopy(original)
        omitted["pages"][0]["panels"][0]["texts"] = []
        mutations.append(omitted)
        omitted_end_card = copy.deepcopy(original)
        omitted_end_card["pages"][-1]["panels"][-1]["texts"].pop()
        mutations.append(omitted_end_card)
        overlap = copy.deepcopy(original)
        overlap["pages"][0]["panels"][1]["rect"] = overlap["pages"][0]["panels"][0]["rect"]
        mutations.append(overlap)
        escaped = copy.deepcopy(original)
        escaped["pages"][0]["panels"][0]["image"] = "../outside.png"
        mutations.append(escaped)
        wrong_type = copy.deepcopy(original)
        wrong_type["canvas"]["width"] = True
        mutations.append(wrong_type)
        for candidate in mutations:
            write(candidate)
            try:
                load_project(layout)
            except ComicError:
                continue
            raise ComicError("结构守卫未拒绝损坏的夹具")
        write(original)
        for identities in ([], ["PAGE-999"], ["PAGE-001", "PAGE-001"]):
            try:
                preview_plan(load_project(layout), identities)
            except ComicError:
                pass
            else:
                raise ComicError("局部预览未拒绝无效页选择")
        sequel = root / "续话"
        shutil.copytree(assets / "续话示例", sequel)
        sequel_layout = sequel / "排版.json"
        sequel_script = sequel / "漫画分镜.md"
        previous = root / "漫画分镜.md"
        result = summary(load_project(sequel_layout, previous=previous), media=False)
        require((result["pages"], result["panels"], result["texts"], result["checked_previous"])
                == (3, 9, 10, "CH001"), "配对续话计数或上话引用不符")
        try:
            load_project(sequel_layout)
        except ComicError:
            pass
        else:
            raise ComicError("续话缺上话输入却通过")
        baseline = sequel_script.read_text(encoding="utf-8")
        candidates = [
            "\n".join(line for line in baseline.splitlines()
                      if not line.startswith("- 承接事件：EVT-LETTER-RETURN")),
            baseline.replace("EVT-MISSING-RETURN", "EVT-RENAMED"),
            "\n".join("- 待续事件：无" if line.startswith("- 待续事件：") else line
                      for line in baseline.splitlines()),
        ]
        for candidate in candidates:
            sequel_script.write_text(candidate, encoding="utf-8")
            try:
                load_project(sequel_layout, previous=previous)
            except ComicError:
                continue
            raise ComicError("跨话守卫未拒绝丢失、改名或清空待续的夹具")
        sequel_script.write_text(baseline, encoding="utf-8")
        try:
            load_project(layout, media=True)
        except ComicError:
            pass
        else:
            raise ComicError("未提供真实图片却通过媒体就位检查")
    print("static-comic self-tests passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

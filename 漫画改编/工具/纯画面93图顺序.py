#!/usr/bin/env python3
"""融合读本版·纯画面阅读线构建器（r63·0付费调用）。

创作者 r63 终决："不要桥接卡……观众本来看漫画突然看到变成文字会觉得很奇怪……就只要漫画画面。"
=> 读者流＝纯漫画画面 93 张（新冻结54＋旧稿贴字39），**零文字卡、零幕间文字**。
来龙去脉补叙不删除、改放侧车文件 `融合读本版/幕间旁注-文案用.md`（文案/旁注用途，不进读者图流）。
产出：融合读本版/融合阅读顺序.md / .json（纯画面主读线，覆盖 r58/r61/r62 版）。
"""
from __future__ import annotations

import json
import re
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "发布准备-一次性全量" / "发布包-全量12话-20261030"
NEW = "../发布包-全量54页-20261030/{}"
EP_TITLES = {
    1: "葬礼→密室（新·已冻结）", 2: "重生→系统→初遇（新·已冻结）", 3: "对质→收养（新·已冻结）",
    4: "两次救人失败·系统惩罚暗示 ch9–10（旧稿）", 5: "小花登场·杀狗闪回·苏澄伏笔 ch11–12（旧稿）",
    6: "村庄舆论战·平板揭密 ch13–15（旧稿）", 7: "木坠信物·溺压逼系统·挡刀 ch16–18（旧稿）",
    8: "中段·去留+蟹肉 ch18–21（新·已冻结）", 9: "长大打脸·荒郊私刑·心跳铃声 ch22–25（旧稿）",
    10: "霍启珏风波·自割掌嫁祸·舔血宣言 ch26–30（旧稿·P4缺页跳过）",
    11: "礼物·反客为主 ch31–33（旧稿·贴字版）", 12: "音音·怪物 ch34–37（旧稿·贴字版）",
}


def old(ep: str, n=None):
    files = sorted(glob.glob(str(ROOT / f"旧稿存档-第{ep}话/P*-贴字.png")),
                   key=lambda p: int(re.match(r"P(\d+)-", Path(p).name).group(1)))
    return files if n is None else [f for f in files if Path(f).name.startswith(f"P{n}-")]


def rel(p: str) -> str:
    q = Path(p)
    try:
        return q.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return q.as_posix()


def main() -> int:
    eps: list[tuple[int, list[str]]] = []
    eps.append((1, [NEW.format(f"第001话/PAGE-00{i}.png") for i in range(1, 10)]))
    eps.append((2, [NEW.format(f"第002话/PAGE-0{i:02d}.png") for i in range(1, 13)]))
    eps.append((3, [NEW.format(f"第003话/PAGE-00{i}.png") for i in range(1, 9)]))
    eps.append((4, [rel(f) for f in old("04")]))
    eps.append((5, [rel(f) for f in old("05")]))
    eps.append((6, [rel(f) for f in old("06")]))
    eps.append((7, [rel(f) for f in old("07")]))
    eps.append((8, [NEW.format(f"中段-去留/PAGE-{i:03d}.png") for i in range(1, 12)]
                   + [NEW.format(f"中段-蟹肉/PAGE-{i:03d}.png") for i in range(1, 15)]))
    eps.append((9, [rel(f) for f in old("09")]))
    eps.append((10, [rel(f) for f in old("10", 1) + old("10", 2) + old("10", 3) + old("10", 5)]))
    eps.append((11, [rel(f) for f in old("11")]))
    eps.append((12, [rel(f) for f in old("12")]))
    total = sum(len(v) for _, v in eps)
    assert total == 93, total
    for _, items in eps:
        for it in items:
            assert (ROOT / it).resolve().exists(), it
    data = {"schema_version": 3, "date": "2026-10-31", "variant": "纯画面93图版（主读线）",
            "nature": "融合读本版·内部阅读辅助·非发布件",
            "rule": "r63 创作者终决：读者流只放漫画画面，零文字卡零幕间文字；来龙去脉旁注见 幕间旁注-文案用.md",
            "episodes": [{"episode": e, "title": EP_TITLES[e], "items": v} for e, v in eps]}
    (ROOT / "融合读本版/融合阅读顺序.json").write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = ["# 融合阅读顺序·纯画面93图（r63 主读线）", "",
             "> 创作者 r63 终决：读者流里不放任何文字卡/幕间文字——看漫画突然变文字很怪。**本顺序＝纯漫画画面 93 张**"
             "（新冻结54＋旧稿贴字39），一页不砍、一卡不放。",
             "> 来龙去脉补叙未删除：改放侧车文件 `幕间旁注-文案用.md`（发帖文案/创作者旁注用途，不进读者图流）。",
             "> 发布仍仅五帖新冻结件；旧稿页=读本占位。历史版本：107件版(r61)/99图版(r62) 已被本版取代（文件留档加 superseded 头）。", ""]
    no = 0
    for e, items in eps:
        lines.append(f"## 第{e:02d}话｜{EP_TITLES[e]}")
        for it in items:
            no += 1
            lines.append(f"{no:02d}. {it}")
        lines.append("")
    lines.append(f"合计 {total} 张纯画面。第10话 P4 缺页（手部畸变待重出）按空位跳过，因果见旁注 NJ/GP 条。")
    (ROOT / "融合读本版/融合阅读顺序.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"OK pure images={total}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

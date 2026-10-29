#!/usr/bin/env python3
"""融合读本版·手机99图版顺序构建器（r62·0付费调用）。

口径：图位≤99（移动端单帖/单相册）。故事页93张一页不砍（新冻结54＋旧稿贴字39）；
卡只保留6张图位：GP-10P4(缺页替代)/FC-07P5(边界标注)/BR-07→08(旧→新换轨)/
BR-08→09(跨年)/BR-10→11(时间口径)/ED-12(卷末揭示)；
其余8张补叙卡(BR-03→04/04→05/05→06/06→07/09→10＋NJ×3)降级为**文字幕间**——
内容逐字保留，插在原来卡的位置，不占图位。
产出：融合读本版/融合阅读顺序-手机99图版.md / .json（items 带 t=img|txt）。
"""
from __future__ import annotations

import json
import re
import glob
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / "发布准备-一次性全量" / "发布包-全量12话-20261030"
CARD = "融合读本版/桥接卡/{}"
NEW = "../发布包-全量54页-20261030/{}"
IMG_CARDS = {"GP-10P4.png", "FC-07P5.png", "BR-07→08.png", "BR-08→09.png", "BR-10→11.png", "ED-12.png"}
EP_TITLES = {
    1: "葬礼→密室（新·已冻结）", 2: "重生→系统→初遇（新·已冻结）", 3: "对质→收养（新·已冻结）",
    4: "两次救人失败·系统惩罚暗示 ch9–10（旧稿）", 5: "小花登场·杀狗闪回·苏澄伏笔 ch11–12（旧稿）",
    6: "村庄舆论战·平板揭密 ch13–15（旧稿）", 7: "木坠信物·溺压逼系统·挡刀 ch16–18（旧稿）",
    8: "中段·去留+蟹肉 ch18–21（新·已冻结）", 9: "长大打脸·荒郊私刑·心跳铃声 ch22–25（旧稿）",
    10: "霍启珏风波·自割掌嫁祸·舔血宣言 ch26–30（旧稿·P4缺）",
    11: "礼物·反客为主 ch31–33（旧稿·贴字版）", 12: "音音·怪物 ch34–37（旧稿·贴字版）",
}


def old(ep: str, n=None):
    files = sorted(glob.glob(str(ROOT / f"旧稿存档-第{ep}话/P*-贴字.png")),
                   key=lambda p: int(re.match(r"P(\d+)-", Path(p).name).group(1)))
    return files if n is None else [f for f in files if Path(f).name.startswith(f"P{n}-")]


def rel(p: str) -> str:
    return Path(p).as_posix()


def main() -> int:
    cards = {c["id"]: c for c in json.loads((ROOT / "融合读本版/卡文案-r61.json").read_text(encoding="utf-8"))}
    seq: list[tuple] = []  # (episode, "img"|"txt", value)

    def img(ep, src): seq.append((ep, "img", src))
    def card(ep, cid):
        if cid + ".png" in IMG_CARDS:
            img(ep, CARD.format(cid + ".png"))
        else:
            seq.append((ep, "txt", cid))

    for i in range(1, 10): img(1, NEW.format(f"第001话/PAGE-00{i}.png"))
    for i in range(1, 13): img(2, NEW.format(f"第002话/PAGE-0{i:02d}.png"))
    for i in range(1, 9): img(3, NEW.format(f"第003话/PAGE-00{i}.png"))
    card(4, "BR-03→04")
    for f in old("04"): img(4, rel(f))
    card(5, "BR-04→05")
    for f in old("05"): img(5, rel(f))
    card(6, "BR-05→06")
    for f in old("06"): img(6, rel(f))
    card(7, "BR-06→07")
    for f in old("07", 1) + old("07", 2) + old("07", 3) + old("07", 4): img(7, rel(f))
    img(7, CARD.format("FC-07P5.png"))
    img(7, rel(old("07", 5)[0]))
    img(8, CARD.format("BR-07→08.png"))
    for i in range(1, 12): img(8, NEW.format(f"中段-去留/PAGE-{i:03d}.png"))
    for i in range(1, 15): img(8, NEW.format(f"中段-蟹肉/PAGE-{i:03d}.png"))
    img(9, CARD.format("BR-08→09.png"))
    img(9, rel(old("09", 1)[0]))
    card(9, "NJ-09P1-P2")
    for f in old("09", 2) + old("09", 3) + old("09", 4) + old("09", 5): img(9, rel(f))
    card(10, "BR-09→10")
    for f in old("10", 1) + old("10", 2): img(10, rel(f))
    card(10, "NJ-10P2-P3")
    img(10, rel(old("10", 3)[0]))
    img(10, CARD.format("GP-10P4.png"))
    img(10, rel(old("10", 5)[0]))
    img(11, CARD.format("BR-10→11.png"))
    for f in old("11"): img(11, rel(f))
    for f in old("12", 1) + old("12", 2) + old("12", 3) + old("12", 4): img(12, rel(f))
    card(12, "NJ-12P4-P5")
    for f in old("12", 5) + old("12", 6) + old("12", 7) + old("12", 8): img(12, rel(f))
    img(12, CARD.format("ED-12.png"))

    n_img = sum(1 for _, t, _ in seq if t == "img")
    n_txt = sum(1 for _, t, _ in seq if t == "txt")
    assert n_img == 99, f"图位={n_img}"
    for _, t, v in seq:
        if t == "img":
            assert (ROOT / v).resolve().exists(), v
    items = []
    for ep, t, v in seq:
        if t == "img":
            items.append({"episode": ep, "t": "img", "src": v})
        else:
            c = cards[v]
            items.append({"episode": ep, "t": "txt", "id": v, "title": c["title"], "body": c["paras"]})
    data = {"schema_version": 1, "date": "2026-10-31", "variant": "手机99图版",
            "nature": "融合读本版·内部阅读辅助·非发布件",
            "rule": "图位99=故事页93+卡6；补叙8条为文字幕间不占图位；全量107件版见 融合阅读顺序.md",
            "items": items}
    (ROOT / "融合读本版/融合阅读顺序-手机99图版.json").write_text(
        json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")
    lines = ["# 融合阅读顺序·手机99图版（r62）", "",
             "> 口径：图位=99（移动端单帖/单相册）。故事页93张一页不砍；卡6张图位；"
             "其余8条补叙=文字幕间（内容逐字保留、不占图位）。发布仍仅五帖新冻结件；本版=阅读辅助。", "",
             f"图位合计 {n_img} 张＋文字幕间 {n_txt} 条。全量107件版见 `融合阅读顺序.md`。", ""]
    cur = 0
    no = 0
    for ep, t, v in seq:
        if ep != cur:
            cur = ep
            lines.append(f"## 第{ep:02d}话｜{EP_TITLES[ep]}")
        if t == "img":
            no += 1
            lines.append(f"{no:02d}. 图：{v}")
        else:
            c = cards[v]
            lines.append(f"── 文字幕间｜{c['kicker']}｜{c['title']}")
            lines += [f"   {p}" for p in c["paras"]]
    (ROOT / "融合读本版/融合阅读顺序-手机99图版.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"OK images={n_img} text_interludes={n_txt}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""CH001 冻结＋三话发布整合执行器。

默认 dry-run：只校验前置并打印"将会修改"的清单，不写任何文件。
加 --execute 且 --note 非空才真正写入（创作者整读反馈通过后使用）。
步骤：v8回执冻结 → 冻结回执副本 → 三连读frozen标志/index重生 → 三话草案件转正(带备份)。
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
EP1 = ROOT / "漫画改编/开篇修订/第001话"
V8 = EP1 / "制作成果/画内贴字-v8"
PKG = ROOT / "漫画改编/开篇修订/三连读预览-开篇三话"
PREP = ROOT / "漫画改编/发布准备-CH002-CH003"


def sha(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def load(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--note", default="", help="创作者反馈摘要（execute 必填）")
    ap.add_argument("--execute", action="store_true", help="真正写入；缺省 dry-run")
    args = ap.parse_args()
    if args.execute and not args.note.strip():
        print("REFUSED: --execute 必须带 --note（创作者反馈摘要）")
        return 2
    today = date.today().isoformat()

    rec_path = V8 / "试排来源.json"
    rec = load(rec_path)
    man_path = PKG / "来源.json"
    man = load(man_path)
    checks = []
    checks.append((rec["status"] == "preview_pending_creator_review", "v8回执仍待反馈（未误冻结）"))
    for o in rec["outputs"]:
        f = V8 / o["file"]
        checks.append((f.is_file() and sha(f) == o["sha256"], f"v8页sha {o['file']}"))
    ch001 = [r for r in man["pages"] if r["episode"] == "CH001"]
    checks.append((len(ch001) == 9 and all(not r["frozen"] for r in ch001), "三连读CH001九行未冻结"))
    checks.append((all(sha(PKG / r["file"]) == r["sha256"] for r in ch001), "三连读CH001副本sha一致"))
    for name in ("素材清单-三话草案.json", "发布顺序与文案汇编-三话草案.md"):
        checks.append(((PREP / name).is_file(), f"草案存在 {name}"))
    bad = [m for ok, m in checks if not ok]
    for ok, m in checks:
        print(("PASS " if ok else "FAIL ") + m)
    if bad:
        print("PREFLIGHT FAILED，不执行")
        return 1
    plan = [
        f"{rec_path.relative_to(ROOT)}: status=frozen, creator_acceptance(passed/mobile_viewed/note)",
        f"{(V8 / '冻结回执.json').relative_to(ROOT)}: 回执副本",
        f"{man_path.relative_to(ROOT)}: CH001九行 frozen=true/frozen_basis/completeness",
        f"{(PKG / 'index.html').relative_to(ROOT)}: 重生（冻结标注）",
        f"{(PREP / '素材清单.json').relative_to(ROOT)}: 三话草案转正（原文件备份为 素材清单-两话备份.json）",
        f"{(PREP / '发布顺序与文案汇编.md').relative_to(ROOT)}: 三话草案转正（原文件备份为 发布顺序与文案汇编-两话备份.md）",
    ]
    if not args.execute:
        print("DRY-RUN 将修改：")
        for line in plan:
            print("  -", line)
        return 0

    rec["status"] = "frozen"
    rec["creator_acceptance"] = {
        "mobile_viewed": True,
        "passed": True,
        "scope": "PAGE-001..009",
        "note": args.note.strip(),
        "date": today,
    }
    rec_path.write_text(json.dumps(rec, ensure_ascii=False, indent=1), encoding="utf-8")
    shutil.copy(rec_path, V8 / "冻结回执.json")
    for r in man["pages"]:
        if r["episode"] == "CH001":
            r["frozen"] = True
            r["frozen_basis"] = f"创作者整读反馈通过（{today}）：{args.note.strip()}"
    man["completeness"] = "CH001 9/9冻结、CH002 12/12冻结、CH003 8/8冻结；发布包三话整合已转正"
    man["date"] = today
    man_path.write_text(json.dumps(man, ensure_ascii=False, indent=1), encoding="utf-8")
    eps = {
        "CH001": "第001话（9页·已冻结）",
        "CH002": "第002话（12页·已冻结）",
        "CH003": "第003话（8页·已冻结）",
    }
    html = [
        '<!doctype html><html lang="zh"><head><meta charset="utf-8">',
        '<meta name="viewport" content="width=device-width,initial-scale=1">',
        "<title>三连读整读画廊·开篇三话</title>",
        "<style>body{margin:0;background:#111;color:#eee;font-family:system-ui,sans-serif}"
        ".hd{position:sticky;top:0;background:#000c;padding:10px 12px;font-size:13px;line-height:1.5;border-bottom:1px solid #333}"
        "figure{margin:0;padding:8px 0;border-bottom:2px solid #000}figcaption{padding:6px 12px;font-size:12px;color:#bbb}"
        "img{display:block;width:100%;max-width:640px;margin:0 auto;background:#fff}"
        ".ep{padding:14px 12px 6px;font-size:15px;color:#ffd479;background:#1a1a1a}</style></head><body>",
        '<div class="hd"><b>三连读整读画廊（开篇三话·29页·已全部冻结）</b><br>'
        "阅读顺序：第001话1→9 → 第002话1→12 → 第003话1→8。发布形态=抖音图文帖；未上传。</div>",
    ]
    cur = None
    for r in man["pages"]:
        if r["episode"] != cur:
            cur = r["episode"]
            html.append(f'<div class="ep">{eps[cur]}</div>')
        html.append(
            f'<figure><img src="{r["file"]}" alt="{cur} {r["page"]}" loading="lazy">'
            f'<figcaption>{cur} {r["page"]}｜已冻结</figcaption></figure>'
        )
    html.append("</body></html>")
    (PKG / "index.html").write_text("\n".join(html), encoding="utf-8")
    shutil.copy(PREP / "素材清单.json", PREP / "素材清单-两话备份.json")
    shutil.copy(PREP / "素材清单-三话草案.json", PREP / "素材清单.json")
    shutil.copy(PREP / "发布顺序与文案汇编.md", PREP / "发布顺序与文案汇编-两话备份.md")
    shutil.copy(PREP / "发布顺序与文案汇编-三话草案.md", PREP / "发布顺序与文案汇编.md")
    print("EXECUTED：", today)
    for line in plan:
        print("  -", line)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

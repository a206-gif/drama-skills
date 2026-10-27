#!/usr/bin/env python3
"""只读预检：冻结+裁决+整合执行前的齐套校验（不改任何文件）。"""
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[3]
def sha(p): return hashlib.sha256(Path(p).read_bytes()).hexdigest()
plan = json.loads((ROOT / "漫画改编/发布准备-CH002-CH003/freeze_plan.json").read_text(encoding="utf-8"))
man = json.loads((ROOT / "漫画改编/开篇修订/三连读预览-开篇三话/来源.json").read_text(encoding="utf-8"))
ok = True
def check(cond, msg):
    global ok
    print(("PASS " if cond else "FAIL ") + msg)
    ok = ok and cond
rec = json.loads((ROOT / plan["preflight"]["v8_receipt"]).read_text(encoding="utf-8"))
check(rec["status"] == "preview_pending_creator_review", "v8回执仍为preview待反馈（未误冻结）")
for o in rec["outputs"]:
    f = ROOT / "漫画改编/开篇修订/第001话/制作成果/画内贴字-v8" / o["file"]
    check(f.is_file() and sha(f) == o["sha256"], f"v8页sha {o['file']}")
rowmap = {(r["episode"], r["page"]): r for r in man["pages"]}
for o in rec["outputs"]:
    r = rowmap[("CH001", o["file"].replace(".png", "").replace("PAGE-00", "PAGE-00"))]
    copy = ROOT / "漫画改编/开篇修订/三连读预览-开篇三话" / r["file"]
    check(sha(copy) == o["sha256"], f"三连读副本sha {r['file']}")
    check(r["frozen"] is False, f"三连读行未冻结 {r['file']}")
# 2026-10-27 创作者撤销安全区裁决：A件仅作历史归档，降为提示项不阻断。
for key, want in (("adjudication_imgs", 15), ("A_formal_CH002", 12), ("A_formal_CH003", 8)):
    files = plan["preflight"][key]
    print(f"INFO {key} 归档件 {sum((ROOT / f).is_file() for f in files)}/{want}（裁决已撤销，不阻断）")
for f in plan["preflight"]["A_layouts"] + [plan["preflight"]["runbook"], plan["preflight"]["feedback_template"]]:
    check((ROOT / f).is_file(), f"存在 {Path(f).name}")
print("PREFLIGHT", "OK" if ok else "INCOMPLETE")
sys.exit(0 if ok else 1)

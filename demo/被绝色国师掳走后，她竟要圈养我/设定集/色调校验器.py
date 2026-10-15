#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
色调基准校验器 —— 《被绝色国师掳走后，她竟要圈养我》
用途：① 校验任何新生成的场景/角色图是否命中本项目色调锚点
      ② 可选：对偏离的图做自适应校色（--fix）

锚点来源：画风图/微信图片_20261015005004_111_160.jpg（唯一基础底图）
         + 4 张冷调角色板（IMG-01/03/05/08）实测共识

用法：
  python3 色调校验器.py 图片路径...             # 只校验
  python3 色调校验器.py 图片路径... --fix       # 校验并输出校色版（_调色.jpg）
  python3 色调校验器.py 目录路径 --fix --out 输出目录
"""
import sys, os, argparse
import numpy as np
from PIL import Image

LUM = (0.2126, 0.7152, 0.0722)

# ── 锚点：本项目色调合同 ──────────────────────────────────────────
ANCHOR = {
    'band': {'暗部': (0, 80), '中间': (80, 170), '亮部': (170, 255)},
    'blue_over_red':  {'暗部': 1.15, '中间': 1.12, '亮部': 0.95},   # 下限
    'blue_over_green':{'暗部': 1.05, '中间': 1.05, '亮部': 0.95},   # 下限（铁规则 >1）
    # 饱和度：上限 28% 才对得起基准底图(18.9%)；角色板因服装含色可达 35%，
    # 故按资产类型分档，不搞一刀切。
    'saturation': {'scene': 28.0, 'character': 36.0},
    # 影调按光态分档：昼景 vs 夜景/内景（烛火、油灯、室内）
    # 注意：影调是「生成阶段」指标，调色无法补救 —— 不达标说明该重出图或补光。
    'tone_tier': {
        'day':   {'mid_tone_share': 30.0, 'lum_range': (80.0, 135.0)},
        'night': {'mid_tone_share': 10.0, 'lum_range': (25.0, 100.0)},
    },
}

def guess_tier(path, st):
    """按平均明度粗判光态；也可用 --tier 强制指定。"""
    return 'day' if st['luminance'] >= 78 else 'night'

def band_stats(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = a.mean(axis=2)
    m = (lum > 4) & (lum < 251)
    px, lm = a[m], lum[m]
    mx, mn = px.max(axis=1), px.min(axis=1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    out = {'saturation': sat.mean() * 100, 'luminance': lm.mean(), 'bands': {}}
    for nm, (lo, hi) in ANCHOR['band'].items():
        s = (lm >= lo) & (lm <= hi)
        if s.sum() < 300:
            out['bands'][nm] = None; continue
        b = px[s].mean(axis=0); c = b / b.mean() * 3
        out['bands'][nm] = {'b_over_r': c[2] / c[0], 'b_over_g': c[2] / c[1],
                            'share': s.sum() / len(lm) * 100}
    return out

def check(path, tier=None, kind='scene'):
    st = band_stats(path)
    issues = []
    for nm, v in st['bands'].items():
        if v is None: continue
        if v['b_over_g'] < ANCHOR['blue_over_green'][nm]:
            issues.append(f"{nm}蓝/绿 {v['b_over_g']:.3f} < {ANCHOR['blue_over_green'][nm]}（绿压过蓝）")
        if v['b_over_r'] < ANCHOR['blue_over_red'][nm]:
            issues.append(f"{nm}蓝/红 {v['b_over_r']:.3f} < {ANCHOR['blue_over_red'][nm]}（不够冷）")
    cap = ANCHOR['saturation'][kind]
    if st['saturation'] > cap:
        issues.append(f"饱和 {st['saturation']:.1f}% 超出场景上限 {cap}%"
                      f"（场景板超过 {cap}% 会与角色板抢色；若为角色板请加 --kind character）")
    t = tier or guess_tier(path, st)
    T = ANCHOR['tone_tier'][t]
    if st['bands']['中间'] and st['bands']['中间']['share'] < T['mid_tone_share']:
        issues.append(f"[{t}] 中间调占比 {st['bands']['中间']['share']:.1f}% < {T['mid_tone_share']}%（影调塌进暗部）")
    lo_l, hi_l = T['lum_range']
    if not (lo_l <= st['luminance'] <= hi_l):
        issues.append(f"[{t}] 平均明度 {st['luminance']:.1f} 超出 {lo_l}–{hi_l}")
    return st, issues

def _pass(a, green_cut, blue_add, cool_sh, sat_target, LUM=LUM):
    from scipy.ndimage import gaussian_filter
    mx, mn = a.max(axis=2), a.min(axis=2)
    S = gaussian_filter(np.clip((mx - mn) / np.maximum(mx, 1e-6), 0, 1), sigma=6)[..., None]
    lowsat = 1.0 - S * 0.6
    L = LUM[0]*a[:,:,0] + LUM[1]*a[:,:,1] + LUM[2]*a[:,:,2]
    wsh = np.clip((75 - L) / 75, 0, 1)[..., None]
    a = a + np.array([-9.0, 1.0, 13.0]) * wsh * cool_sh
    a = np.clip(a, 0, 255)
    ge = a[:,:,1] - a[:,:,2]
    gm = np.clip(ge / 35.0, 0, 1)
    a[:,:,1] = a[:,:,1] - ge * green_cut * gm
    a[:,:,2] = a[:,:,2] + a[:,:,2] * blue_add * lowsat[:,:,0]
    a = np.clip(a, 0, 255)
    L2 = LUM[0]*a[:,:,0] + LUM[1]*a[:,:,1] + LUM[2]*a[:,:,2]
    mx2, mn2 = a.max(axis=2), a.min(axis=2)
    s = np.where(mx2 > 0, (mx2 - mn2) / np.maximum(mx2, 1), 0)
    k = np.clip(sat_target / (s.mean() * 100 + 1e-6), 0.55, 1.15)
    return np.clip(L2[...,None] + (a - L2[...,None]) * k, 0, 255)

def fix(path, out, sat_target=22.5, iters=14):
    """自适应：二分搜索 green_cut / blue_add，使图恰好命中锚点。"""
    a0 = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    def score(a):
        L = LUM[0]*a[:,:,0] + LUM[1]*a[:,:,1] + LUM[2]*a[:,:,2]
        m = (L > 4) & (L < 251)
        lm = L[m]; px = a[m]
        s = {'b_over_g': [], 'b_over_r': []}
        for nm, (lo, hi) in [('暗部', (0,80)), ('中间', (80,170))]:
            sel = (lm >= lo) & (lm <= hi)
            if sel.sum() < 200: continue
            b = px[sel].mean(axis=0); c = b / b.mean() * 3
            s['b_over_g'].append(c[2] / c[1]); s['b_over_r'].append(c[2] / c[0])
        return min(s['b_over_g'] or [9]), min(s['b_over_r'] or [9])
    best = None
    lo_gc, hi_gc = 0.10, 0.75
    for _ in range(iters):
        gc = (lo_gc + hi_gc) / 2
        for ba in (0.07, 0.11, 0.16):
            a = _pass(a0.copy(), gc, ba, 0.20, sat_target)
            bg, br = score(a)
            # 目标 1.06 / 1.17 留一点余量，避免过冲
            ok = bg >= 1.06 and br >= 1.17
            err = abs(max(0, 1.06 - bg)) + abs(max(0, 1.17 - br)) + 0.02*max(0, ba-0.11)
            if best is None or (ok and not best[0]) or (ok == best[0] and err < best[2] - 1e-4):
                best = (ok, a, err, gc, ba, bg, br)
        if best[0]: hi_gc = gc
        else: lo_gc = gc
        if hi_gc - lo_gc < 0.008: break
    Image.fromarray(best[1].astype(np.uint8)).save(out, quality=94)
    return best[3], best[4], best[5], best[6]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('paths', nargs='+')
    ap.add_argument('--fix', action='store_true')
    ap.add_argument('--out', default=None)
    ap.add_argument('--tier', choices=['day', 'night'], default=None,
                    help='强制光态分档；默认按平均明度自动判定')
    ap.add_argument('--kind', choices=['scene', 'character'], default='scene',
                    help='资产类型，影响饱和上限（场景 28% / 角色 36%）')
    args = ap.parse_args()
    files = []
    for p in args.paths:
        if os.path.isdir(p):
            files += [os.path.join(p, f) for f in sorted(os.listdir(p))
                      if f.lower().endswith(('.png', '.jpg', '.jpeg'))]
        else: files.append(p)
    print(f"{'文件':<34}{'饱和%':>7}{'明度':>7}{'暗蓝/红':>9}{'暗蓝/绿':>9}{'中蓝/红':>9}{'中蓝/绿':>9}  判定")
    print("-" * 108)
    for f in files:
        st, iss = check(f, args.tier, args.kind)
        b = st['bands']
        def g(k, i): return b[k][i] if b[k] else float('nan')
        verdict = '✅ 合格' if not iss else f"❌ {len(iss)} 项偏离"
        print(f"{os.path.basename(f)[:32]:<34}{st['saturation']:>7.1f}{st['luminance']:>7.1f}"
              f"{g('暗部','b_over_r'):>9.3f}{g('暗部','b_over_g'):>9.3f}"
              f"{g('中间','b_over_r'):>9.3f}{g('中间','b_over_g'):>9.3f}  {verdict}")
        for i in iss: print(f"{'':<34}   ↳ {i}")
        if args.fix and iss:
            outdir = args.out or os.path.dirname(os.path.abspath(f))
            os.makedirs(outdir, exist_ok=True)
            stem = os.path.splitext(os.path.basename(f))[0]
            out = os.path.join(outdir, stem + '_调色.jpg')
            gc, ba, bg, br = fix(f, out)
            print(f"{'':<34}   → 已校色 {out}  (绿切 {gc:.2f} 蓝补 {ba:.2f} → 蓝/绿 {bg:.3f} 蓝/红 {br:.3f})")

if __name__ == '__main__':
    main()

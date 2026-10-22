'use strict';

/** 商品库：查询、编辑、批量改写、删除 */

const express = require('express');
const store = require('../lib/store');
const transform = require('../lib/transform');

const router = express.Router();

/** GET /api/items?q=&status=&shopId=&page=&size=&sort= */
router.get('/', (req, res) => {
  const { q = '', status = '', shopId = '', via = '', page = 1, size = 50, sort = 'newest' } = req.query;
  let list = store.all();
  if (q) {
    const kw = String(q).toLowerCase();
    list = list.filter(
      (it) =>
        (it.title || '').toLowerCase().includes(kw) ||
        String(it.sourceItemId || '').includes(kw) ||
        (it.sourceUrl || '').toLowerCase().includes(kw) ||
        (it.sourceShop?.title || '').toLowerCase().includes(kw)
    );
  }
  if (status) list = list.filter((it) => it.status === status);
  if (shopId) list = list.filter((it) => String(it.sourceShop?.shopId || '') === String(shopId));
  if (via) list = list.filter((it) => it.collectedVia === via);

  if (sort === 'price-asc') list = [...list].sort((a, b) => (a.price || 0) - (b.price || 0));
  else if (sort === 'price-desc') list = [...list].sort((a, b) => (b.price || 0) - (a.price || 0));
  else if (sort === 'title') list = [...list].sort((a, b) => (a.title || '').localeCompare(b.title || '', 'zh'));
  else list = [...list].sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

  const total = list.length;
  const p = Math.max(1, Number(page));
  const s = Math.min(500, Math.max(1, Number(size)));
  const items = list.slice((p - 1) * s, p * s).map((it) => ({ ...it, raw: undefined }));

  // 状态统计，前端顶栏用
  const counts = {};
  for (const it of store.all()) counts[it.status || 'collected'] = (counts[it.status || 'collected'] || 0) + 1;

  res.json({ ok: true, total, page: p, size: s, items, counts, shops: store.listShops() });
});

router.get('/:id', (req, res) => {
  const it = store.get(req.params.id);
  if (!it) return res.status(404).json({ ok: false, error: '商品不存在' });
  res.json({ ok: true, item: it });
});

/** 单条编辑（人工改过的打 edited 标记，之后重复采集不会覆盖） */
router.put('/:id', (req, res) => {
  const it = store.get(req.params.id);
  if (!it) return res.status(404).json({ ok: false, error: '商品不存在' });
  const patch = { ...req.body, id: it.id, edited: true };
  delete patch.createdAt;
  delete patch.fingerprint;
  res.json({ ok: true, item: store.patch(it.id, patch) });
});

router.delete('/:id', (req, res) => {
  res.json({ ok: true, removed: store.remove([req.params.id]) });
});

router.post('/delete', (req, res) => {
  const ids = req.body.ids || [];
  res.json({ ok: true, removed: store.remove(ids) });
});

/**
 * 批量应用改写规则。
 * body: { ids: [...], rules: {...}, preview: bool }
 * preview=true 时只返回前 5 条改写前后对比，不落库 —— 先看清效果再动手，
 * 批量改错几百条标题是很惨的。
 */
router.post('/transform', (req, res) => {
  const { ids = [], rules = {}, preview = false, all: applyAll = false } = req.body || {};
  const targets = applyAll ? store.all() : ids.map((id) => store.get(id)).filter(Boolean);
  if (!targets.length) return res.status(400).json({ ok: false, error: '没有选中任何商品' });

  const diffs = targets.slice(0, preview ? 5 : targets.length).map((it, i) => {
    const next = transform.applyRules(it, rules, i);
    return {
      id: it.id,
      before: { title: it.title, price: it.price, quantity: it.quantity, images: (it.images || []).slice(0, 3) },
      after: { title: next.title, price: next.price, quantity: next.quantity, images: (next.images || []).slice(0, 3) },
      titleBytes: transform.byteLength(next.title),
      warnings: next.warnings || [],
    };
  });

  if (preview) return res.json({ ok: true, preview: true, count: targets.length, diffs });

  let n = 0;
  targets.forEach((it, i) => {
    const next = transform.applyRules(it, rules, i);
    next.edited = true;
    delete next.raw; // raw 保持原样，别把改写后的当原始数据
    store.patch(it.id, next);
    n++;
  });
  store.saveNow();
  res.json({ ok: true, updated: n, diffs: diffs.slice(0, 20) });
});

/** 导出选中的商品（JSON / CSV），CSV 可直接给千牛批量上传或淘宝助理 */
router.post('/export', (req, res) => {
  const { ids = [], format = 'json', all: exportAll = false } = req.body || {};
  const list = exportAll ? store.all() : ids.map((id) => store.get(id)).filter(Boolean);

  if (format === 'csv') {
    const header = ['标题', '价格', '库存', '类目ID', '主图', '链接', '原商品ID', '来源店铺', '状态'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [header.join(',')];
    for (const it of list) {
      lines.push(
        [it.title, it.price, it.quantity, it.categoryId, (it.images || []).join('|'), it.sourceUrl, it.sourceItemId, it.sourceShop?.title || '', it.status]
          .map(esc)
          .join(',')
      );
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="items-${Date.now()}.csv"`);
    return res.send('\uFEFF' + lines.join('\n'));
  }

  res.json({ ok: true, count: list.length, items: list });
});

module.exports = router;

'use strict';

/** 商品库：查询、编辑、批量改写、删除 */

const express = require('express');
const store = require('../lib/store');
const images = require('../lib/images');

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

/** 导出选中的商品（JSON / CSV） */
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

/**
 * 下载某商品的所有图片（主图 + 属性图 + 详情图）到本地图片库。
 * 下载后 item 的图片地址改写成本地 /media/xxx，前端画廊和 ZIP 打包都用本地图。
 */
router.post('/:id/download-images', async (req, res) => {
  const it = store.get(req.params.id);
  if (!it) return res.status(404).json({ ok: false, error: '商品不存在' });
  try {
    const r = await images.localizeItemImages(it, {
      concurrency: Number(req.body?.concurrency) || 3,
      includeDescImages: req.body?.includeDescImages !== false,
      allowAnyUrl: Boolean(req.body?.allowAnyUrl),
    });
    store.patch(it.id, {
      images: r.images,
      propImages: r.propImages,
      descImages: r.descImages,
      description: r.description,
      imagesLocalized: true,
      imagesLocalizedAt: new Date().toISOString(),
    });
    store.saveNow();
    res.json({ ok: true, report: r.report, images: r.images, descImages: r.descImages });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/**
 * 批量下载多个商品的图片。body: { ids:[...] } 或 { all:true }
 * 串行下载，返回每个商品的成败汇总（不阻塞：量大时前端可轮询 item 状态）。
 */
router.post('/download-images', async (req, res) => {
  const { ids = [], all = false, concurrency = 3, includeDescImages = true } = req.body || {};
  const targets = all ? store.all() : ids.map((id) => store.get(id)).filter(Boolean);
  if (!targets.length) return res.status(400).json({ ok: false, error: '没有选中任何商品' });
  const results = [];
  let okCount = 0;
  let imgCount = 0;
  for (const it of targets) {
    try {
      const r = await images.localizeItemImages(it, { concurrency, includeDescImages });
      store.patch(it.id, {
        images: r.images,
        propImages: r.propImages,
        descImages: r.descImages,
        description: r.description,
        imagesLocalized: true,
        imagesLocalizedAt: new Date().toISOString(),
      });
      const n = r.report.ok.length;
      okCount++;
      imgCount += n;
      results.push({ id: it.id, title: it.title, ok: true, downloaded: n, failed: r.report.failed.length });
    } catch (e) {
      results.push({ id: it.id, title: it.title, ok: false, error: e.message });
    }
  }
  store.saveNow();
  res.json({ ok: true, items: okCount, images: imgCount, results });
});

module.exports = router;

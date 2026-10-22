'use strict';

/**
 * 采集入口。浏览器扩展、手动粘贴、文件导入都往这里投。
 *
 * 安全上做了两件事：
 *   1) 服务只监听 127.0.0.1，外网进不来
 *   2) 采集需要 X-Collector-Token，令牌在「设置」页显示、扩展里填一样的。
 *      没有令牌的话，你浏览器里任意网页都能往你的商品库塞数据。
 */

const express = require('express');
const store = require('../lib/store');
const parser = require('../lib/parser');
const { fingerprint } = require('../lib/model');

const router = express.Router();

function checkToken(req, res, next) {
  const s = store.getSettings();
  if (!s.collectorToken) return next(); // 未启用
  const got = req.header('X-Collector-Token') || req.query.token || '';
  if (got !== s.collectorToken) {
    return res.status(401).json({
      ok: false,
      error: '采集口令不对。打开本地控制台「设置」页复制口令，填到浏览器扩展里。',
    });
  }
  next();
}

/** 存一条草稿；同来源已存在则合并，不重复建 */
function saveDraft(draft, extra = {}) {
  const fp = fingerprint(draft);
  const existing = store.all().find((it) => it.fingerprint === fp);
  if (existing) {
    const merged = {
      ...existing,
      ...draft,
      // 已经人工改过的字段不要被新采集覆盖
      title: existing.edited ? existing.title : draft.title,
      price: existing.edited ? existing.price : draft.price,
      warnings: draft.warnings,
      raw: draft.raw ?? existing.raw,
      updatedAt: new Date().toISOString(),
      collectCount: (existing.collectCount || 1) + 1,
      ...extra,
    };
    store.patch(existing.id, merged);
    return { item: store.get(existing.id), created: false };
  }
  const item = store.create({ ...draft, fingerprint: fp, collectCount: 1, ...extra });
  return { item, created: true };
}

/** 扩展回传：单个商品（结构化 JSON） */
router.post('/item', checkToken, (req, res) => {
  try {
    const body = req.body || {};
    const payload = body.item || body.data || body;
    const draft = payload.html
      ? parser.parseItemHtml(payload.html, {
          sourceUrl: payload.sourceUrl || req.header('X-Page-Url') || '',
          ...payload.meta,
        })
      : parser.parseItemJson(payload, {
          sourceUrl: payload.sourceUrl || req.header('X-Page-Url') || '',
          sourceShop: payload.sourceShop || payload.shop,
        });
    draft.collectedVia = body.via || 'extension';
    const r = saveDraft(draft, {
      sourceShop: draft.sourceShop || payload.sourceShop,
    });
    res.json({ ok: true, created: r.created, id: r.item.id, item: r.item });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** 扩展回传：整店宝贝列表 */
router.post('/shop', checkToken, (req, res) => {
  try {
    const body = req.body || {};
    const list = body.items || body.list || [];
    const shopMeta = {
      shopId: body.shopId || '',
      sellerId: body.sellerId || '',
      title: body.shopTitle || body.shopName || '',
      url: body.shopUrl || req.header('X-Shop-Url') || '',
    };
    if (shopMeta.url) store.upsertShop({ ...shopMeta, itemCount: body.total ?? list.length, via: body.via || 'extension' });

    let created = 0;
    let updated = 0;
    const ids = [];
    for (const raw of list) {
      const draft = raw.html
        ? parser.parseItemHtml(raw.html, { sourceUrl: raw.sourceUrl || raw.url, sourceShop: shopMeta })
        : parser.parseItemJson(
            { ...raw, shop: shopMeta },
            { sourceUrl: raw.sourceUrl || raw.url || raw.itemUrl, sourceShop: shopMeta }
          );
      draft.collectedVia = body.via || 'extension-shop';
      draft.sourceShop = { ...shopMeta, ...(draft.sourceShop || {}) };
      const r = saveDraft(draft, { shopBatchId: body.batchId || '' });
      ids.push(r.item.id);
      r.created ? created++ : updated++;
    }
    res.json({ ok: true, received: list.length, created, updated, ids, shop: shopMeta });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** 手动粘贴：HTML / JSON / CSV 自动识别 */
router.post('/paste', checkToken, (req, res) => {
  try {
    const { content, sourceUrl, kind, shopUrl, shopTitle } = req.body || {};
    const text = String(content || '');
    if (!text.trim()) return res.status(400).json({ ok: false, error: '内容为空' });

    const auto = kind || detectKind(text);
    const results = [];

    if (auto === 'csv') {
      for (const d of parser.parseCsvItems(text)) results.push(saveDraft(d, {}));
    } else if (auto === 'shop-html') {
      const list = parser.parseShopItems(text, { sourceShop: { url: shopUrl || '', title: shopTitle || '' } });
      if (!list.length) return res.status(400).json({ ok: false, error: '没从这段 HTML 里认出任何宝贝链接（找 href 里带 id= 的卡片）' });
      for (const d of list) results.push(saveDraft(d, {}));
    } else if (auto === 'html') {
      results.push(saveDraft(parser.parseItemHtml(text, { sourceUrl }), {}));
    } else {
      let json;
      try {
        json = JSON.parse(text);
      } catch (e) {
        return res.status(400).json({ ok: false, error: `内容既不是 HTML 也不是合法 JSON：${e.message}` });
      }
      const arr = Array.isArray(json) ? json : json.items || json.list || [json];
      for (const one of arr) results.push(saveDraft(parser.parseItemJson(one, { sourceUrl }), {}));
    }

    res.json({
      ok: true,
      kind: auto,
      count: results.length,
      created: results.filter((r) => r.created).length,
      items: results.map((r) => r.item),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

function detectKind(text) {
  const head = text.slice(0, 4000);
  if (/^\s*[{[]/.test(text)) return 'json';
  if (/<html|<!doctype|<body/i.test(head)) {
    // 页面里出现 3 个以上宝贝链接 → 当成店铺页处理
    const hits = (text.match(/[?&]id=\d{6,}/g) || []).length;
    return hits >= 3 ? 'shop-html' : 'html';
  }
  if (/<div|<img|<script/i.test(head)) return 'html';
  if (text.split('\n')[0].includes(',')) return 'csv';
  return 'html';
}

/**
 * 扩展心跳。
 * 扩展每 5 秒打一次 POST /api/ingest/heartbeat；前端轮询 GET /api/ingest/ping
 * 看 lastExtensionBeat，就能在顶栏显示「扩展在线 / 待连接」。
 */
let lastExtensionBeat = null;
let lastBeatInfo = null;

router.post('/heartbeat', checkToken, (req, res) => {
  lastExtensionBeat = new Date().toISOString();
  lastBeatInfo = req.body || null;
  // 顺手把待采集任务发给扩展，省掉一个轮询请求
  const job = takeJob();
  res.json({ ok: true, job, time: lastExtensionBeat });
});

router.get('/ping', (req, res) => {
  res.json({
    ok: true,
    needToken: Boolean(store.getSettings().collectorToken),
    items: store.all().length,
    lastExtensionBeat,
    lastBeatInfo,
    time: new Date().toISOString(),
  });
});

/* ---- 采集任务的内存队列：shops 路由投递，扩展心跳领取 ---- */
const jobQueue = [];

function pushJob(job) {
  jobQueue.push(job);
}

function takeJob() {
  return jobQueue.shift() || null;
}

router.jobs = { pushJob, takeJob, queue: jobQueue };

module.exports = router;

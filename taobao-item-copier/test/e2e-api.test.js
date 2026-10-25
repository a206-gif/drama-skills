'use strict';

/**
 * 端到端：起真实的 Express 服务，用真 HTTP 走一遍「采集链接 → 提取图片 → 打包下载」链路。
 *
 * 单元测试能证明每个函数对，但证明不了「扩展 POST 进来的数据最后真能被下载成图片包」——
 * 路由挂载、CORS、采集口令、去重合并、图片下载、ZIP 导出这些接缝处最容易出问题。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用临时目录做数据区，避免污染真实的 data/
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'img-extractor-e2e-'));
const store = require('../server/lib/store');
store.setDataDir(TMP);
store.init();
// init() 会自动生成随机采集口令，那会让所有 /api/ingest 请求 401。
// 口令本身有专门的用例覆盖，其余用例先关掉，只测业务链路。
store.updateSettings({ collectorToken: '' });

const { app } = require('../server/index');

let server;
let base;

test.before(async () => {
  await new Promise((resolve) => {
    server = app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(TMP, { recursive: true, force: true });
});

async function req(method, p, body, headers = {}) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 200) }; }
  return { status: res.status, data, headers: res.headers, text };
}

const sampleHtml = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-item.html'), 'utf8');
const shopHtml = fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'sample-shop.html'), 'utf8');

/* ---------------- 健康 & 采集入库 ---------------- */

test('健康检查：返回商品数与图片数统计', async () => {
  const r = await req('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ok, true);
  assert.strictEqual(typeof r.data.items, 'number');
  assert.strictEqual(typeof r.data.images, 'number', '应统计已提取的图片数');
});

test('采集入口：扩展回传的 HTML 能入库，并返回商品 id', async () => {
  const r = await req('POST', '/api/ingest/item', {
    item: { html: sampleHtml, sourceUrl: 'https://item.taobao.com/item.htm?id=723456789012' },
    via: 'e2e-test',
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ok, true);
  assert.strictEqual(r.data.created, true);
  assert.ok(r.data.id);
  assert.strictEqual(r.data.item.title, '2026新款纯棉宽松短袖T恤女夏季ins潮百搭打底衫上衣');
  assert.ok((r.data.item.images || []).length > 0, '应从商品页提取到图片链接');
});

test('重复采集同一商品：合并不新建，collectCount 递增', async () => {
  const before = await req('GET', '/api/items');
  const r = await req('POST', '/api/ingest/item', {
    item: { html: sampleHtml, sourceUrl: 'https://item.taobao.com/item.htm?id=723456789012' },
  });
  assert.strictEqual(r.data.created, false, '同一来源第二次采集不应新建');
  assert.strictEqual(r.data.item.collectCount, 2);
  const after = await req('GET', '/api/items');
  assert.strictEqual(after.data.total, before.data.total, '商品总数不应变');
});

test('人工改过的标题不会被后续采集覆盖', async () => {
  const list = await req('GET', '/api/items');
  const id = list.data.items[0].id;
  await req('PUT', `/api/items/${id}`, { title: '我自己的标题' });
  await req('POST', '/api/ingest/item', { item: { html: sampleHtml } });
  const after = await req('GET', `/api/items/${id}`);
  assert.strictEqual(after.data.item.title, '我自己的标题', 'edited 标记应保护人工修改');
  assert.strictEqual(after.data.item.edited, true);
});

/* ---------------- 整店扫描：从店铺页认出所有商品链接 ---------------- */

test('店铺页 HTML 批量入库（扫出店内所有商品链接），并记下店铺', async () => {
  const r = await req('POST', '/api/ingest/paste', {
    content: shopHtml,
    kind: 'shop-html',
    shopUrl: 'https://shop111222333.taobao.com',
    shopTitle: '样例女装旗舰店',
  });
  assert.strictEqual(r.data.ok, true);
  assert.strictEqual(r.data.kind, 'shop-html');
  assert.strictEqual(r.data.count, 3, '店铺页里 3 个宝贝链接都要认出来');

  const items = await req('GET', '/api/items?q=连衣裙');
  assert.ok(items.data.total >= 1);
  assert.ok(items.data.items[0].sourceUrl, '每个商品都应带上它的网址链接');
});

test('采集内容自动识别类型（JSON / CSV / HTML）', async () => {
  const json = await req('POST', '/api/ingest/paste', {
    content: JSON.stringify({ title: 'JSON 来源的商品', price: 12.5, images: ['https://img.alicdn.com/x.jpg'] }),
  });
  assert.strictEqual(json.data.kind, 'json');
  assert.strictEqual(json.data.count, 1);

  const csv = await req('POST', '/api/ingest/paste', {
    content: '标题,价格,库存\nCSV 来源的商品,88.00,7\n',
  });
  assert.strictEqual(csv.data.kind, 'csv');
  assert.strictEqual(csv.data.items[0].price, 88);
});

test('粘贴空内容报 400 而不是静默成功', async () => {
  const r = await req('POST', '/api/ingest/paste', { content: '   ' });
  assert.strictEqual(r.status, 400);
  assert.match(r.data.error, /内容为空/);
});

/* ---------------- 图片提取（下载落地） ---------------- */

test('图片下载：不存在的商品返回 404', async () => {
  const r = await req('POST', '/api/items/it_doesnotexist/download-images', {});
  assert.strictEqual(r.status, 404);
});

test('图片下载：没有选中任何商品时报 400', async () => {
  const r = await req('POST', '/api/items/download-images', { ids: [] });
  assert.strictEqual(r.status, 400);
  assert.match(r.data.error, /没有选中/);
});

test('图片下载：批量端点诚实汇报每张图的成败，不假装成功', async () => {
  const list = await req('GET', '/api/items');
  const withImg = list.data.items.filter((it) => (it.images || []).length > 0).slice(0, 1);
  assert.ok(withImg.length, '库里应至少有一个带图片链接的商品');
  const r = await req('POST', '/api/items/download-images', { ids: withImg.map((x) => x.id) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ok, true);
  assert.ok(Array.isArray(r.data.results));
  // 测试环境连不上淘宝 CDN，下载会失败——但端点必须如实汇报失败，而不是崩掉或谎报成功
  const one = r.data.results[0];
  assert.strictEqual(one.id, withImg[0].id);
  assert.ok('ok' in one, '每条结果都要有明确的 ok 标记');
});

/* ---------------- 采集口令（防止本机其他网页乱投数据） ---------------- */

test('采集口令：设置后缺令牌的请求被拒', async () => {
  store.updateSettings({ collectorToken: 'secret-e2e' });
  const denied = await req('POST', '/api/ingest/item', { item: { html: sampleHtml } });
  assert.strictEqual(denied.status, 401);
  assert.match(denied.data.error, /口令/);

  const allowed = await req('POST', '/api/ingest/item', { item: { html: sampleHtml } }, { 'X-Collector-Token': 'secret-e2e' });
  assert.strictEqual(allowed.status, 200);

  const wrong = await req('POST', '/api/ingest/item', { item: { html: sampleHtml } }, { 'X-Collector-Token': 'wrong' });
  assert.strictEqual(wrong.status, 401);

  store.updateSettings({ collectorToken: '' }); // 复原，别影响别的用例
});

/* ---------------- 导出 ---------------- */

test('导出：CSV 带 BOM 且字段转义正确', async () => {
  const list = await req('GET', '/api/items');
  const res = await fetch(`${base}/api/items/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: list.data.items.slice(0, 2).map((x) => x.id), format: 'csv' }),
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf[0], 0xef, 'CSV 必须以 UTF-8 BOM (EF BB BF) 开头');
  assert.strictEqual(buf[1], 0xbb);
  assert.strictEqual(buf[2], 0xbf);
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  assert.ok(text.split('\n')[0].includes('标题'), '首行应是表头');
});

test('导出：图片包 zip 结构合法', async () => {
  const res = await fetch(`${base}/api/export/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true, includeImages: false }),
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/zip/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 100);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, '导出的 zip 找不到 EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  assert.ok(count >= 1, `zip 里应至少有条目，实际 ${count} 条`);
});

test('导出：没选中任何商品时报错，不产出空包', async () => {
  const res = await fetch(`${base}/api/export/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['it_doesnotexist'], includeImages: false }),
  });
  assert.strictEqual(res.status, 400);
});

/* ---------------- 静态页 & CORS ---------------- */

test('前端静态页与 SPA 回退可访问', async () => {
  const index = await fetch(`${base}/`);
  assert.strictEqual(index.status, 200);
  assert.match(await index.text(), /图片提取/);
  const spa = await fetch(`${base}/some/deep/route`);
  assert.strictEqual(spa.status, 200, '非 /api 路径应回退到 index.html');
  const apiMiss = await fetch(`${base}/api/nope`);
  assert.strictEqual(apiMiss.status, 404, '/api 下未命中的路径不该回退成 HTML');
});

test('CORS：带 Origin 的请求返回允许头，预检通过', async () => {
  const pre = await fetch(`${base}/api/ingest/item`, {
    method: 'OPTIONS',
    headers: { Origin: 'chrome-extension://abcdefghijklmnop', 'Access-Control-Request-Method': 'POST' },
  });
  assert.strictEqual(pre.status, 204);
  assert.ok(pre.headers.get('access-control-allow-origin'), '必须回 Allow-Origin，否则扩展的请求会被浏览器拦掉');
  assert.match(pre.headers.get('access-control-allow-headers'), /X-Collector-Token/);
});

/* ---------------- 整店扫描任务队列 & 进度 ---------------- */

test('店铺采集任务能排队，扩展心跳能领到', async () => {
  const c = await req('POST', '/api/shops/collect', { shopUrl: 'https://shop111222333.taobao.com' });
  assert.strictEqual(c.data.ok, true);
  assert.strictEqual(c.data.job.state, 'waiting');

  const shops = await req('GET', '/api/shops');
  assert.strictEqual(shops.data.pending >= 1, true);

  const beat = await req('POST', '/api/ingest/heartbeat', { version: 'e2e' });
  assert.strictEqual(beat.data.ok, true);
  assert.strictEqual(beat.data.job?.id, c.data.job.id, '心跳应领到刚排队的采集任务');

  const beat2 = await req('POST', '/api/ingest/heartbeat', {});
  assert.strictEqual(beat2.data.job, null, '队列空了就该返回 null');
});

test('进度上报能通过 SSE 读到', async () => {
  await req('POST', '/api/shops/progress', { jobId: 'job_x', message: '第 1 页拿到 40 个', page: 1, found: 40, state: 'running' });
  const res = await fetch(`${base}/api/shops/progress-stream`);
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader();
  const { value } = await reader.read();
  const text = new TextDecoder().decode(value);
  assert.match(text, /第 1 页拿到 40 个/);
  await reader.cancel();
});

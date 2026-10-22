'use strict';

/**
 * 端到端：起真实的 Express 服务，用真 HTTP 走一遍完整链路。
 *
 * 单元测试能证明每个函数对，但证明不了「扩展 POST 进来的数据最后真的能被发布」——
 * 路由挂载、CORS、采集口令、去重合并、批量改写、试运行发布这些接缝处最容易出问题。
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// 用临时目录做数据区，避免污染真实的 data/
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'copier-e2e-'));
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

test('健康检查：未配置凭据时如实报告，不假装可用', async () => {
  const r = await req('GET', '/api/health');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.ok, true);
  assert.strictEqual(r.data.top.configured, false, '没填 appkey 就该是 false');
  assert.strictEqual(r.data.top.authorized, false);
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
  assert.strictEqual(r.data.item.price, 39.9);
  assert.strictEqual(r.data.item.sourceShop.shopId, '111222333');
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

test('店铺页 HTML 批量入库，并记下店铺', async () => {
  const r = await req('POST', '/api/ingest/paste', {
    content: shopHtml,
    kind: 'shop-html',
    shopUrl: 'https://shop111222333.taobao.com',
    shopTitle: '样例女装旗舰店',
  });
  assert.strictEqual(r.data.ok, true);
  assert.strictEqual(r.data.kind, 'shop-html');
  assert.strictEqual(r.data.count, 3, '店铺页里 3 个宝贝都要入库');

  const items = await req('GET', '/api/items?q=连衣裙');
  assert.ok(items.data.total >= 1);
  assert.ok(items.data.items[0].title.includes('法式复古碎花连衣裙'));
  assert.strictEqual(items.data.items[0].price, 129);
});

test('采集内容自动识别类型（JSON / CSV / HTML）', async () => {
  const json = await req('POST', '/api/ingest/paste', {
    content: JSON.stringify({ title: 'JSON 来源的商品', price: 12.5, images: ['https://img.alicdn.com/x.jpg'], categoryId: '50000671' }),
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

test('批量改写：预览不落库，应用才落库', async () => {
  const list = await req('GET', '/api/items');
  const target = list.data.items.find((it) => it.price > 1);
  const rules = { title: { prefix: '现货' }, price: { multiplier: 1.35 } };

  const preview = await req('POST', '/api/items/transform', {
    ids: [target.id], rules, preview: true,
  });
  assert.strictEqual(preview.data.preview, true);
  assert.ok(preview.data.diffs[0].after.title.startsWith('现货'));
  assert.ok(preview.data.diffs[0].after.price > preview.data.diffs[0].before.price);

  const unchanged = await req('GET', `/api/items/${target.id}`);
  assert.strictEqual(unchanged.data.item.title, target.title, '预览绝不能改库');

  const apply = await req('POST', '/api/items/transform', { ids: [target.id], rules });
  assert.strictEqual(apply.data.updated, 1);
  const changed = await req('GET', `/api/items/${target.id}`);
  assert.ok(changed.data.item.title.startsWith('现货'), '应用后必须真的改了');
});

test('批量改写：合理的前后缀都保留，且总长守在 60 字节内', async () => {
  const list = await req('GET', '/api/items');
  const long = list.data.items.find((it) => (it.title || '').length > 20);
  const r = await req('POST', '/api/items/transform', {
    ids: [long.id],
    rules: { title: { prefix: '现货', suffix: '包邮' } },
    preview: true,
  });
  const d = r.data.diffs[0];
  assert.ok(d.titleBytes <= 60, `标题 ${d.titleBytes} 字节，超了淘宝上限`);
  assert.ok(d.after.title.startsWith('现货'), '前缀必须保留');
  assert.ok(d.after.title.endsWith('包邮'), '后缀必须保留（正文被裁，前后缀不能丢）');
});

test('批量改写：前后缀本身超长时，宁可丢正文也不能突破 60 字节', async () => {
  const list = await req('GET', '/api/items');
  const long = list.data.items.find((it) => (it.title || '').length > 20);
  const r = await req('POST', '/api/items/transform', {
    ids: [long.id],
    // 这对前后缀合计已 57 字节，几乎吃满预算，是用户会犯的错
    rules: { title: { prefix: '【本店现货秒发】', suffix: '顺丰包邮七天无理由退换' } },
    preview: true,
  });
  const d = r.data.diffs[0];
  assert.ok(d.titleBytes <= 60, `即便前后缀过长，标题 ${d.titleBytes} 字节也必须 ≤60`);
});

test('发布：没配凭据时拒绝真实发布，但试运行可以跑', async () => {
  const list = await req('GET', '/api/items');
  const ids = list.data.items.slice(0, 2).map((it) => it.id);

  const real = await req('POST', '/api/tasks/publish', {
    itemIds: ids, options: { categoryId: '50000671' },
  });
  assert.strictEqual(real.status, 400);
  assert.match(real.data.error, /appkey|凭据/, '必须说清是凭据问题，而不是抛个 500');

  const dry = await req('POST', '/api/tasks/publish', {
    itemIds: ids, options: { categoryId: '50000671', dryRun: true, skipPropCheck: true },
  });
  assert.strictEqual(dry.data.ok, true);
  assert.ok(dry.data.task.id);
});

test('试运行任务跑完后每条商品都有步骤记录，且没有真发布', async () => {
  const list = await req('GET', '/api/items');
  // 选一个有主图的商品：dry-run 仍会校验主图，CSV 来源的空壳商品会在这一步合理失败。
  // 这里要测的是「完整发布链路能跑通」，所以得喂它一个能发布到底的对象。
  const one = list.data.items.filter((x) => (x.images || []).length > 0).slice(0, 1);
  assert.ok(one.length, '库里应至少有一个带主图的商品供试运行');
  const t = await req('POST', '/api/tasks/publish', {
    itemIds: one.map((x) => x.id),
    options: { categoryId: '50000671', dryRun: true, skipPropCheck: true },
  });
  const taskId = t.data.task.id;

  // 等任务结束（试运行不访问网络，很快）
  for (let i = 0; i < 40; i++) {
    const st = await req('GET', `/api/tasks/${taskId}`);
    if (['done', 'failed', 'cancelled'].includes(st.data.task?.state)) break;
    await new Promise((r) => setTimeout(r, 100));
  }
  const st = await req('GET', `/api/tasks/${taskId}`);
  assert.strictEqual(st.data.task.state, 'done', `任务应完成，实际 ${st.data.task.state}：${JSON.stringify(st.data.task.logs?.slice(-3))}`);
  assert.strictEqual(st.data.task.succeeded, 1);
  assert.strictEqual(st.data.task.failed, 0);

  const item = await req('GET', `/api/items/${one[0].id}`);
  assert.ok(item.data.item.publishSteps?.length > 0, '应记录发布步骤');
  assert.ok(item.data.item.publishSteps.some((s) => s.name === 'taobao.item.add'));
  assert.ok(!item.data.item.publishedItemId, '试运行不能产生真实 num_iid');
});

test('任务列表可见，且不存在的任务返回 404', async () => {
  const list = await req('GET', '/api/tasks');
  assert.ok(list.data.tasks.length > 0);
  const missing = await req('GET', '/api/tasks/tk_nonexistent');
  assert.strictEqual(missing.status, 404);
});

test('采集口令：设置后缺令牌的请求被拒', async () => {
  await req('PUT', '/api/settings', { collectorToken: 'secret-e2e' });
  const denied = await req('POST', '/api/ingest/item', { item: { html: sampleHtml } });
  assert.strictEqual(denied.status, 401);
  assert.match(denied.data.error, /口令/);

  const allowed = await req('POST', '/api/ingest/item', { item: { html: sampleHtml } }, { 'X-Collector-Token': 'secret-e2e' });
  assert.strictEqual(allowed.status, 200);

  const wrong = await req('POST', '/api/ingest/item', { item: { html: sampleHtml } }, { 'X-Collector-Token': 'wrong' });
  assert.strictEqual(wrong.status, 401);

  await req('PUT', '/api/settings', { collectorToken: '' }); // 复原，别影响别的用例
});

test('设置：secret 只回掩码，不回明文', async () => {
  await req('PUT', '/api/settings', { appKey: 'AK123456', appSecret: 'SUPERSECRETVALUE' });
  const r = await req('GET', '/api/settings');
  assert.strictEqual(r.data.settings.appKey, 'AK123456');
  assert.ok(!JSON.stringify(r.data.settings).includes('SUPERSECRETVALUE'), '明文 secret 绝不能返回给前端');
  assert.match(r.data.settings.appSecret, /\*\*\*\*/);
  assert.strictEqual(r.data.settings.hasAppSecret, true);
});

test('设置：前端回传掩码时不能把真 secret 冲掉', async () => {
  const r = await req('PUT', '/api/settings', { appKey: 'AK123456', appSecret: 'SUPE****LUE' });
  assert.strictEqual(r.data.settings.hasAppSecret, true);
  const test = await req('POST', '/api/settings/test');
  const signCheck = test.data.checks.find((c) => c.name.includes('签名'));
  assert.ok(signCheck, '应有签名检查项');
});

test('导出：CSV 带 BOM 且字段转义正确', async () => {
  const list = await req('GET', '/api/items');
  const res = await fetch(`${base}/api/items/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: list.data.items.slice(0, 2).map((x) => x.id), format: 'csv' }),
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/csv/);
  // 必须读原始字节：res.text() 按 WHATWG 规范会剥掉开头的 BOM，用它判断 BOM 永远失败
  const buf = Buffer.from(await res.arrayBuffer());
  assert.strictEqual(buf[0], 0xef, 'CSV 必须以 UTF-8 BOM (EF BB BF) 开头');
  assert.strictEqual(buf[1], 0xbb);
  assert.strictEqual(buf[2], 0xbf);
  const text = buf.toString('utf8').replace(/^\uFEFF/, '');
  assert.ok(text.split('\n')[0].includes('标题'), '首行应是表头');
  assert.ok(text.includes('"'), '字段应带引号转义');
});

test('导出：素材包 zip 结构合法，且含 README 与总表', async () => {
  const res = await fetch(`${base}/api/export/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ all: true, includeImages: false }),
  });
  assert.strictEqual(res.status, 200);
  assert.match(res.headers.get('content-type'), /application\/zip/);
  const buf = Buffer.from(await res.arrayBuffer());
  assert.ok(buf.length > 100);
  // EOCD 存在且条目数 > 0
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, '导出的 zip 找不到 EOCD');
  const count = buf.readUInt16LE(eocd + 10);
  assert.ok(count >= 3, `至少应有 README + 总表 + 商品 JSON，实际 ${count} 条`);
});

test('导出：没选中任何商品时报错，不产出空包', async () => {
  const res = await fetch(`${base}/api/export/package`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['it_doesnotexist'], includeImages: false }),
  });
  assert.strictEqual(res.status, 400);
});

test('前端静态页与 SPA 回退可访问', async () => {
  const index = await fetch(`${base}/`);
  assert.strictEqual(index.status, 200);
  assert.match(await index.text(), /淘宝商品搬运台/);
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

test('类目接口在未配置凭据时给出可操作的错误，而不是崩掉', async () => {
  await req('PUT', '/api/settings', { appKey: '', appSecret: '' });
  const r = await req('GET', '/api/categories?parentCid=0');
  assert.strictEqual(r.status, 400);
  assert.match(r.data.error, /appkey|凭据|session/i);
});

'use strict';

/**
 * 扩展后台（MV3 service worker）。
 *
 * 职责：
 *   1. 心跳：每 5 秒向本地服务报到一次，顺便领取待办的整店采集任务
 *   2. mtop 调用：用你浏览器里的淘宝登录态发请求，sign = md5(token&t&appKey&data)
 *      token 取自 _m_h5_tk cookie 下划线前半段；令牌为空/过期时自动重试一次
 *   3. 整店枚举：三种策略依次兜底（mtop 接口 → 店铺搜索页 DOM → 当前页链接）
 *   4. 回传：把结构化数据 POST 给本地服务
 *
 * 为什么必须在扩展里做：mtop 的 sign 依赖 .taobao.com 域下的 _m_h5_tk cookie，
 * 本地服务的页面跨域拿不到这个 cookie，也就签不出名。
 */

importScripts('md5.js');

const md5 = globalThis.__copierMd5;

const DEFAULTS = {
  localBase: 'http://127.0.0.1:8787',
  token: '',
  mtopAppKey: '12574478',
  mtopGateway: 'https://h5api.m.taobao.com/h5/',
  /**
   * 店铺内宝贝列表的 mtop 接口。淘宝改版比较勤，这里做成可配置：
   * 如果默认这个不通，打开店铺页 F12 → Network → 过滤 mtop，
   * 找到返回宝贝列表的那个请求，把 api / v / data 三个值抄到扩展选项里即可。
   */
  shopItemsApi: {
    api: 'mtop.taobao.wsearch.appsearch',
    v: '1.0',
    dataTemplate: {
      m: 'shopitemsearch',
      vm: 'nw',
      sversion: '4.6',
      shopId: '{{shopId}}',
      sellerId: '{{sellerId}}',
      page: '{{page}}',
      pageSize: '{{pageSize}}',
    },
  },
  heartbeatSeconds: 5,
  // 商品发布页地址，淘宝改版时可在扩展选项里改
  publishUrl: 'https://myseller.taobao.com/',
};

let cfg = { ...DEFAULTS };
const busy = { jobId: null };

/* ------------------------------ 配置 ------------------------------ */

async function loadConfig() {
  const got = await chrome.storage.local.get('cfg');
  cfg = { ...DEFAULTS, ...(got.cfg || {}) };
  cfg.shopItemsApi = { ...DEFAULTS.shopItemsApi, ...((got.cfg || {}).shopItemsApi || {}) };
  return cfg;
}

async function saveConfig(patch) {
  await loadConfig();
  cfg = { ...cfg, ...patch };
  if (patch.shopItemsApi) cfg.shopItemsApi = { ...DEFAULTS.shopItemsApi, ...patch.shopItemsApi };
  await chrome.storage.local.set({ cfg });
  return cfg;
}

/* ------------------------------ 本地服务通信 ------------------------------ */

async function local(path, body, headers = {}) {
  const res = await fetch(`${cfg.localBase}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.token ? { 'X-Collector-Token': cfg.token } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, data: text ? JSON.parse(text) : {} };
  } catch {
    return { status: res.status, data: { ok: false, error: text.slice(0, 200) } };
  }
}

/** 心跳：报到 + 领任务 */
async function heartbeat() {
  await loadConfig();
  try {
    const res = await fetch(`${cfg.localBase}/api/ingest/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.token ? { 'X-Collector-Token': cfg.token } : {}),
      },
      body: JSON.stringify({
        version: '0.2.0',
        busy: busy.jobId,
        extId: chrome.runtime.id, // 控制台页面靠这个 id 反向唤起扩展做「一键发布」
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (data && data.job && !busy.jobId) {
      runJob(data.job).catch((e) => reportProgress(data.job.id, `任务失败：${e.message}`, 0, 0, 'error'));
    }
  } catch {
    // 本地服务没启动，安静失败，下次心跳再试
  }
}

chrome.alarms.create('heartbeat', { periodInMinutes: 1 / 12 }); // ~5 秒
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'heartbeat') heartbeat();
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create('heartbeat', { periodInMinutes: 1 / 12 });
  heartbeat();
});
chrome.runtime.onStartup.addListener(() => heartbeat());

/* ------------------------------ mtop 调用 ------------------------------ */

async function getMtopToken() {
  const cookie = await chrome.cookies.get({ url: 'https://h5api.m.taobao.com', name: '_m_h5_tk' });
  if (!cookie) {
    const alt = await chrome.cookies.get({ url: 'https://acs.m.taobao.com', name: '_m_h5_tk' });
    if (!alt) return '';
    return String(alt.value).split('_')[0];
  }
  return String(cookie.value).split('_')[0];
}

/**
 * 发一个 mtop 请求。
 * @param {string} api    例如 mtop.taobao.detail.getdetail
 * @param {string} v      例如 6.0
 * @param {object} data   业务参数（会被 JSON.stringify 后参与签名）
 */
async function mtop(api, v, data, opts = {}) {
  await loadConfig();
  const appKey = opts.appKey || cfg.mtopAppKey;
  const dataStr = typeof data === 'string' ? data : JSON.stringify(data);

  const attempt = async (token) => {
    const t = String(Date.now());
    const sign = md5(`${token}&${t}&${appKey}&${dataStr}`);
    const q = new URLSearchParams({
      jsv: '2.7.2',
      appKey,
      t,
      sign,
      api,
      v,
      type: 'originaljson',
      dataType: 'json',
      timeout: '20000',
      ...(opts.extraQuery || {}),
    });
    const url = `${opts.gateway || cfg.mtopGateway}${api}/${v}/?${q.toString()}&data=${encodeURIComponent(dataStr)}`;
    const res = await fetch(url, {
      method: opts.method || 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json', Referer: opts.referer || 'https://www.taobao.com/' },
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      throw new Error(`mtop ${api} 返回非 JSON：${text.slice(0, 160)}`);
    }
  };

  let token = await getMtopToken();
  let json = await attempt(token);
  const ret = String((json && json.ret && json.ret[0]) || '');

  // FAIL_SYS_TOKEN_EMPTY / EXPIRED：第一次请求会把 _m_h5_tk 种下来，重签一次即可
  if (/TOKEN_EMPTY|TOKEN_EXPIRED|ILLEGAL_ACCESS/.test(ret) && !opts.noRetry) {
    await new Promise((r) => setTimeout(r, 350));
    token = await getMtopToken();
    if (token) json = await attempt(token);
  }
  json.__token = token;
  return json;
}

function mtopOk(json) {
  const ret = String((json && json.ret && json.ret[0]) || '');
  return ret.startsWith('SUCCESS');
}

/* ------------------------------ 商品详情 ------------------------------ */

/** 用 mtop 补全一个宝贝的详情（SKU、属性图、详情图都在这里） */
async function fetchItemDetail(itemId) {
  const json = await mtop('mtop.taobao.detail.getdetail', '6.0', { itemNumId: String(itemId) });
  if (!mtopOk(json)) return { error: String(json.ret && json.ret[0]) };
  const d = json.data || {};
  const item = d.item || {};
  const price = d.price || {};
  const seller = d.seller || {};
  const skuBase = d.skuBase || {};
  const skuCore = d.skuCore || {};
  const props = (d.components && d.components.data) || d.props || {};

  return {
    sourceItemId: String(itemId),
    sourceUrl: `https://item.taobao.com/item.htm?id=${itemId}`,
    title: item.title,
    images: item.images || [],
    videoUrl: item.videoUrl || (d.item && d.item.cartoonVideo && d.item.cartoonVideo.videoUrl) || '',
    price: (price.price && (price.price.priceText || price.price)) || d.apiStack?.[0]?.value?.price?.price?.priceText || 0,
    originalPrice: (price.extraPrices && price.extraPrices[0] && price.extraPrices[0].priceText) || 0,
    quantity: (d.item && d.item.quantity) || (skuCore.sku2info && skuCore.sku2info['0'] && skuCore.sku2info['0'].quantity) || 0,
    categoryId: item.categoryId || item.catId || '',
    shop: {
      shopId: String(seller.shopId || seller.shop_id || ''),
      sellerId: String(seller.userId || seller.user_id || seller.uid || ''),
      title: seller.shopName || seller.nick || '',
      url: seller.shopUrl || seller.pcUrl || '',
    },
    skusRaw: { skuBase, skuCore },
    propsRaw: props,
    descUrl: d.item && (d.item.pcADescUrl || d.item.descUrl) || '',
    __raw: json.data,
  };
}

/* ------------------------------ 整店枚举 ------------------------------ */

function parseShopIdentity(url) {
  const out = { shopId: '', sellerId: '', url };
  const sid = /shop(\d+)\.taobao/.exec(url);
  if (sid) out.shopId = sid[1];
  const qid = /[?&]shopId=(\d+)/.exec(url);
  if (qid) out.shopId = qid[1];
  const uid = /[?&](?:userId|sellerId|user_number_id)=(\d+)/.exec(url);
  if (uid) out.sellerId = uid[1];
  return out;
}

/** 策略 A：mtop 店铺宝贝搜索接口（翻页快、字段全） */
async function collectByMtop(job, onProgress) {
  const id = parseShopIdentity(job.shopUrl);
  // 店铺页里往往能直接读到 shopId / sellerId，先让内容脚本去拿一次
  const fromPage = await readIdentityFromPage(job.shopUrl);
  if (fromPage.shopId) id.shopId = id.shopId || fromPage.shopId;
  if (fromPage.sellerId) id.sellerId = id.sellerId || fromPage.sellerId;
  if (fromPage.title) id.title = fromPage.title;

  if (!id.shopId && !id.sellerId) {
    throw new Error('没能从店铺链接或页面里解析出 shopId / sellerId。请在店铺页点扩展图标 →「采集本页全部宝贝链接」。');
  }

  const tpl = cfg.shopItemsApi.dataTemplate || {};
  const items = new Map();
  let lastError = '';

  for (let page = 1; page <= job.maxPages; page++) {
    const data = {};
    for (const [k, v] of Object.entries(tpl)) {
      data[k] = String(v)
        .replace('{{shopId}}', id.shopId)
        .replace('{{sellerId}}', id.sellerId)
        .replace('{{page}}', String((page - 1) * job.pageSize))
        .replace('{{pageNo}}', String(page))
        .replace('{{pageSize}}', String(job.pageSize));
    }
    let json;
    try {
      json = await mtop(cfg.shopItemsApi.api, cfg.shopItemsApi.v, data, { referer: job.shopUrl });
    } catch (e) {
      lastError = e.message;
      break;
    }
    if (!mtopOk(json)) {
      lastError = String(json.ret && json.ret[0]);
      break;
    }
    const list = pickItemList(json.data || {});
    if (!list.length) break;
    for (const it of list) {
      const itemId = String(it.itemId || it.item_id || it.nid || it.numIid || '');
      if (!itemId || items.has(itemId)) continue;
      items.set(itemId, normalizeListItem(it, id));
    }
    onProgress(`mtop 第 ${page} 页，拿到 ${list.length} 个`, page, items.size);
    if (list.length < Math.max(1, job.pageSize / 2)) break;
    await sleep(700 + Math.random() * 600); // 翻页加随机延迟，降低风控概率
  }

  if (!items.size) throw new Error(`mtop 没取到宝贝：${lastError || '接口返回空列表'}。请换成 DOM 方式，或按 README 抓一下当前接口名填进扩展选项。`);
  return { items: [...items.values()], shop: id, via: 'mtop' };
}

function pickItemList(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 8) return [];
  for (const k of ['itemsArray', 'listItems', 'auctions', 'items', 'itemList', 'list', 'result', 'shopItems']) {
    const v = node[k];
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object')) return v;
  }
  for (const v of Object.values(node)) {
    const inner = pickItemList(v, depth + 1);
    if (inner.length) return inner;
  }
  return [];
}

function normalizeListItem(it, shop) {
  const itemId = String(it.itemId || it.item_id || it.nid || it.numIid || '');
  const pic = it.pic || it.picUrl || it.pic_path || it.img || it.image || (Array.isArray(it.pics) ? it.pics[0] : '');
  return {
    sourceItemId: itemId,
    sourceUrl: it.itemUrl || it.url || it.auctionUrl || `https://item.taobao.com/item.htm?id=${itemId}`,
    title: it.title || it.name || it.rawTitle || '',
    price: Number((it.price && (it.price.priceText || it.price)) || it.priceShow?.price || it.reservePrice || 0),
    quantity: Number(it.quantity || it.totalQuantity || 0),
    sold: it.sold || it.saleCount || it.totalSoldQuantity || '',
    images: typeof pic === 'string' && pic ? [pic] : [],
    shop,
  };
}

/**
 * 策略 B：DOM 解析店铺「所有宝贝」页。
 * 让内容脚本在真实页面里翻页，把所有带 id= 的宝贝链接捞出来。
 * 这条路不依赖任何接口名，淘宝改版也基本不会坏。
 */
async function collectByDom(job, onProgress) {
  const items = new Map();
  let tab = null;
  try {
    tab = await chrome.tabs.create({ url: job.shopUrl, active: false });
    await waitForTabComplete(tab.id, 30000);
    await sleep(2500); // 店铺页是异步渲染的，等它把宝贝卡片画出来

    for (let page = 1; page <= job.maxPages; page++) {
      const found = await chrome.tabs.sendMessage(tab.id, { type: 'scrape-shop-page' }).catch(() => null);
      if (!found) break;
      let added = 0;
      for (const it of found.items || []) {
        if (!it.sourceItemId || items.has(it.sourceItemId)) continue;
        items.set(it.sourceItemId, it);
        added++;
      }
      if (found.shopTitle) job.__shopTitle = found.shopTitle;
      if (found.shopId) job.__shopId = found.shopId;
      if (found.sellerId) job.__sellerId = found.sellerId;
      onProgress(`DOM 第 ${page} 页，新增 ${added} 个`, page, items.size);
      if (!found.hasNextPage || added === 0) break;
      // 让页面自己点下一页
      const ok = await chrome.tabs.sendMessage(tab.id, { type: 'goto-next-page' }).catch(() => false);
      if (!ok) break;
      await sleep(1800);
      await waitForTabComplete(tab.id, 20000).catch(() => {});
      await sleep(1200);
    }
  } finally {
    if (tab) chrome.tabs.remove(tab.id).catch(() => {});
  }
  if (!items.size) throw new Error('DOM 方式也没抓到宝贝。请在店铺「所有宝贝」页手动点一次扩展图标 →「采集本页全部宝贝链接」。');
  return {
    items: [...items.values()],
    shop: { shopId: job.__shopId || '', sellerId: job.__sellerId || '', title: job.__shopTitle || '', url: job.shopUrl },
    via: 'dom',
  };
}

/** 在已打开的页面里读 shopId / sellerId（比后台猜 URL 可靠） */
async function readIdentityFromPage(url) {
  try {
    const tab = await chrome.tabs.create({ url, active: false });
    await waitForTabComplete(tab.id, 25000);
    await sleep(2000);
    const r = await chrome.tabs.sendMessage(tab.id, { type: 'read-shop-identity' }).catch(() => null);
    chrome.tabs.remove(tab.id).catch(() => {});
    return r || {};
  } catch {
    return {};
  }
}

function waitForTabComplete(tabId, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error('页面加载超时'));
    }, timeout);
    const listener = (id, info) => {
      if (id !== tabId || info.status !== 'complete') return;
      clearTimeout(timer);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    // 有可能在我们加监听之前就已经 complete 了
    chrome.tabs.get(tabId).then((t) => {
      if (t.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }).catch(() => {});
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------ 任务执行 ------------------------------ */

async function reportProgress(jobId, message, page, found, state) {
  try {
    await local('/api/shops/progress', { jobId, message, page, found, state });
  } catch {}
}

async function runJob(job) {
  busy.jobId = job.id;
  await reportProgress(job.id, `开始采集：${job.shopUrl}（方式 ${job.mode}）`, 0, 0, 'running');
  let result = null;
  const errors = [];

  const strategies = job.mode === 'mtop' ? ['mtop'] : job.mode === 'dom' ? ['dom'] : ['mtop', 'dom'];
  for (const s of strategies) {
    try {
      result = s === 'mtop'
        ? await collectByMtop(job, (m, p, f) => reportProgress(job.id, m, p, f, 'running'))
        : await collectByDom(job, (m, p, f) => reportProgress(job.id, m, p, f, 'running'));
      break;
    } catch (e) {
      errors.push(`${s}: ${e.message}`);
      await reportProgress(job.id, `${s} 方式失败：${e.message}`, 0, 0, 'running');
    }
  }

  if (!result) {
    busy.jobId = null;
    return reportProgress(job.id, `全部策略失败。${errors.join(' ｜ ')}`, 0, 0, 'error');
  }

  // 需要逐个进详情页补全字段时（慢，但 SKU / 属性图 / 详情才有）
  if (job.depth === 'detail') {
    await reportProgress(job.id, `列表拿到 ${result.items.length} 个，开始逐个抓详情…`, 0, result.items.length, 'running');
    const detailed = [];
    for (let i = 0; i < result.items.length; i++) {
      const it = result.items[i];
      try {
        const d = await fetchItemDetail(it.sourceItemId);
        if (!d.error) detailed.push({ ...it, ...d, shop: result.shop });
        else detailed.push(it);
      } catch {
        detailed.push(it);
      }
      if (i % 5 === 0 || i === result.items.length - 1) {
        await reportProgress(job.id, `详情进度 ${i + 1}/${result.items.length}`, 0, result.items.length, 'running');
      }
      await sleep(900 + Math.random() * 700);
    }
    result.items = detailed;
  }

  const r = await local('/api/ingest/shop', {
    shopId: result.shop.shopId,
    sellerId: result.shop.sellerId,
    shopTitle: result.shop.title || '',
    shopUrl: result.shop.url || job.shopUrl,
    total: result.items.length,
    items: result.items,
    via: result.via,
    batchId: job.id,
  });

  busy.jobId = null;
  await reportProgress(
    job.id,
    r.status === 200 && r.data.ok
      ? `采集完成：${result.items.length} 个宝贝，新增 ${r.data.created} 条，更新 ${r.data.updated} 条`
      : `回传失败（HTTP ${r.status}）：${r.data?.error || ''}`,
    0,
    result.items.length,
    r.status === 200 && r.data.ok ? 'done' : 'error'
  );
}

/* ------------------------------ 发布页自动填表 ------------------------------ */

// 商品发布页地址（通用「发布宝贝」页，会先让你选类目）
const PUBLISH_URL = 'https://myseller.taobao.com/';

/** 把一条商品的图片下载下来转成 base64，供发布页注入 <input type=file> */
async function imagesToFiles(item) {
  const urls = [];
  for (const u of item.images || []) {
    if (u.startsWith('/media/')) urls.push(`${cfg.localBase}${u}`);
    else if (/^https?:/.test(u)) urls.push(u);
    if (urls.length >= 5) break; // 淘宝主图上限 5 张
  }
  const out = [];
  for (let i = 0; i < urls.length; i++) {
    try {
      const res = await fetch(urls[i]);
      if (!res.ok) continue;
      const blob = await res.blob();
      const b64 = await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(String(fr.result).split(',')[1]);
        fr.onerror = () => reject(fr.error);
        fr.readAsDataURL(blob);
      });
      const ext = (blob.type && blob.type.split('/')[1]) || 'jpeg';
      out.push({ b64, name: `${i + 1}.${ext === 'jpeg' ? 'jpg' : ext}`, type: blob.type || 'image/jpeg' });
    } catch {
      /* 这张图拉不到就跳过，不阻断其余 */
    }
  }
  return out;
}

/**
 * 把商品数据广播到某个标签页的所有 frame，谁 frame 里有发布表单谁就填。
 * 千牛是 SPA，发布表单可能嵌在 iframe 里，所以逐 frame 试，取第一个成功的结果。
 */
async function broadcastFill(tabId, item) {
  if (!tabId) return { ok: false, error: '拿不到当前标签页' };
  let frames = [{ frameId: 0 }];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
    if (!frames || !frames.length) frames = [{ frameId: 0 }];
  } catch {
    frames = [{ frameId: 0 }];
  }
  let firstReport = null;
  let filledAny = false;
  for (const f of frames) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'copier:do-fill', item }, { frameId: f.frameId });
      if (resp && resp.ok && resp.report) {
        filledAny = true;
        if (!firstReport) firstReport = resp.report;
      }
    } catch {
      /* 这个 frame 没注入 autofill 或没表单，跳过 */
    }
  }
  if (filledAny) return { ok: true, report: firstReport };
  return { ok: false, report: null, reason: '所有 frame 里都没找到发布表单' };
}

/** 打开发布页 → 注入填表引擎 → 把商品数据交给它填 */
async function publishViaAutofill(item) {
  const publishUrl = cfg.publishUrl || PUBLISH_URL;
  const imageFiles = await imagesToFiles(item);
  const tab = await chrome.tabs.create({ url: publishUrl, active: true });
  await waitForTabComplete(tab.id, 40000);

  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['fill-engine.js'] });
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['autofill.js'] });

  // 发布页会先停在「选类目」，表单是选完类目才异步渲染的；
  // autofill.js 内部会等标题框出现再填，所以这里直接投递即可。
  const resp = await chrome.tabs.sendMessage(tab.id, {
    type: 'copier:fill-item',
    item: { ...item, imageFiles },
  }).catch((e) => ({ ok: false, error: e.message }));
  return { tabId: tab.id, imageCount: imageFiles.length, resp };
}

/* ------------------------------ 消息路由 ------------------------------ */

/** 本地控制台页面（http://127.0.0.1:8787）直接唤起扩展 */
chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  (async () => {
    await loadConfig();
    try {
      if (msg.type === 'copier:ping') {
        sendResponse({ ok: true, version: '0.2.0' });
      } else if (msg.type === 'copier:publish') {
        const r = await publishViaAutofill(msg.item || {});
        sendResponse({ ok: true, ...r });
      } else {
        sendResponse({ ok: false, error: `未知外部消息：${msg.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    await loadConfig();
    try {
      switch (msg.type) {
        case 'get-config':
          sendResponse({ ok: true, cfg });
          break;
        case 'save-config':
          sendResponse({ ok: true, cfg: await saveConfig(msg.patch || {}) });
          break;
        case 'status': {
          const ping = await fetch(`${cfg.localBase}/api/ingest/ping`).then((r) => r.json()).catch(() => null);
          const token = await getMtopToken();
          const loginCookie = await chrome.cookies.get({ url: 'https://www.taobao.com', name: '_nk_' }).catch(() => null)
            || await chrome.cookies.get({ url: 'https://www.taobao.com', name: 'tracknick' }).catch(() => null);
          sendResponse({
            ok: true,
            localOnline: Boolean(ping && ping.ok),
            items: ping ? ping.items : 0,
            hasMtopToken: Boolean(token),
            taobaoNick: loginCookie ? decodeURIComponent(loginCookie.value) : '',
            busy: busy.jobId,
            cfg,
          });
          break;
        }
        case 'post-item': {
          const r = await local('/api/ingest/item', { item: msg.item, via: msg.via || 'extension', sourceUrl: msg.sourceUrl }, { 'X-Page-Url': msg.sourceUrl || '' });
          sendResponse({ ok: r.status === 200 && r.data.ok !== false, status: r.status, data: r.data });
          break;
        }
        case 'post-shop': {
          const r = await local('/api/ingest/shop', msg.payload);
          sendResponse({ ok: r.status === 200 && r.data.ok !== false, status: r.status, data: r.data });
          break;
        }
        case 'enqueue-shop': {
          const r = await local('/api/shops/collect', msg.payload);
          sendResponse({ ok: r.status === 200 && r.data.ok !== false, status: r.status, data: r.data });
          break;
        }
        case 'fetch-detail': {
          const d = await fetchItemDetail(msg.itemId);
          sendResponse({ ok: !d.error, data: d });
          break;
        }
        case 'mtop': {
          const json = await mtop(msg.api, msg.v, msg.data, msg.opts || {});
          sendResponse({ ok: mtopOk(json), json });
          break;
        }
        case 'copier:prep-images': {
          // 千牛页面里的面板没有跨域下载图片的权限，交给背景脚本来拉图转 base64
          const files = await imagesToFiles(msg.item || {});
          sendResponse({ ok: true, files });
          break;
        }
        case 'copier:broadcast-fill': {
          // 发布表单可能在 iframe 里，广播到当前标签页的所有 frame，谁有表单谁填
          const tabId = sender.tab && sender.tab.id;
          const r = await broadcastFill(tabId, msg.item || {});
          sendResponse(r);
          break;
        }
        case 'copier:publish-batch': {
          // 批量发布：把多条商品推送到已打开的千牛面板队列，用户在一个标签页里逐条填+提交
          const items = Array.isArray(msg.items) ? msg.items : [];
          if (!items.length) { sendResponse({ ok: false, error: '没有选中商品' }); break; }
          const SELLER_RE = /^https?:\/\/(myseller|seller|sell|work|qianniu|qianiu|qn)\.taobao\.com\//;
          const allTabs = await chrome.tabs.query({});
          let tab = allTabs.find((t) => t.url && SELLER_RE.test(t.url));
          let opened = false;
          if (!tab) {
            tab = await chrome.tabs.create({ url: cfg.publishUrl || PUBLISH_URL, active: true });
            await waitForTabComplete(tab.id, 40000).catch(() => {});
            opened = true;
          } else {
            await chrome.tabs.update(tab.id, { active: true }).catch(() => {});
          }
          // 把队列投递给该标签页所有 frame 的面板（顶层那个会收下并展示）
          await chrome.tabs.sendMessage(tab.id, { type: 'copier:queue-items', items }).catch(() => {});
          sendResponse({ ok: true, count: items.length, opened });
          break;
        }
        case 'copier:publish': {
          const r = await publishViaAutofill(msg.item || {});
          sendResponse({ ok: true, ...r });
          break;
        }
        default:
          sendResponse({ ok: false, error: `未知消息类型：${msg.type}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true; // 异步响应
});

// service worker 一被唤醒就报到一次
heartbeat();

'use strict';

/**
 * 采集数据解析。
 *
 * 三种输入都能吃：
 *   1) 扩展回传的 JSON（已结构化，最省事）
 *   2) 保存下来的商品页 HTML / 直接粘贴的页面源码（离线解析，不用装扩展也能跑）
 *   3) 任意 mtop 详情 JSON 转储（字段名各版本不一样，用启发式递归扫描）
 *
 * HTML 解析刻意不引入 cheerio：淘宝页面结构变动很勤，正则 + JSON 提取反而更好维护，
 * 而且真正的结构化数据都在页面内嵌 JSON 里，DOM 只是兜底。
 */

const { normalizeItem, itemIdFromUrl } = require('./model');
const { normalizeUrl, extractDescImages } = require('./transform');

/* ------------------------------ HTML 解析 ------------------------------ */

/** 从一段页面源码里把商品数据抠出来 */
function parseItemHtml(html, meta = {}) {
  const h = String(html || '');
  if (!h.trim()) throw new Error('HTML 内容为空');

  const found = { ...(meta || {}) };

  // 1) 页面内嵌的大 JSON（window.__INITIAL_DATA__ / g_page_config / __NEXT_DATA__ / TShop.Setup）
  //    这是页面真正的数据源，字段最全（SKU、店铺、价格结构都在里面），优先级最高。
  for (const blob of extractInlineJson(h)) {
    mergeDeep(found, scanForItemFields(blob));
  }

  // 2) JSON-LD（天猫/部分淘宝页有）：只用来补内嵌 JSON 没给的字段，不覆盖已有值。
  //    它的 image 常常只有 1 张封面，先入为主会把内嵌 JSON 里的完整主图列表挤掉。
  const jsonld = extractJsonLd(h);
  if (jsonld) mergeDeep(found, jsonld);

  // 3) DOM / meta 兜底
  if (!found.title) found.title = firstGroup(h, /<title[^>]*>([^<]+)<\/title>/i)?.replace(/[-_|].*(淘宝网|天猫|taobao|tmall).*$/i, '').trim()
    || attr(h, /<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    || attr(h, /<meta[^>]+name="keywords"[^>]+content="([^"]+)"/i);
  if (!found.images || !found.images.length) {
    const og = attr(h, /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i);
    const imgs = [...h.matchAll(/<img[^>]+(?:data-src|data-ks-lazyload|src)=["']([^"']+)["']/gi)]
      .map((m) => normalizeUrl(m[1]))
      .filter((u) => /alicdn\.com|taobaocdn\.com/.test(u));
    found.images = [og && normalizeUrl(og), ...imgs].filter(Boolean);
  }
  if (!found.price) {
    const p = firstGroup(h, /[¥￥]\s*(\d+(?:\.\d{1,2})?)/) || firstGroup(h, /"price"\s*:\s*"?(\d+(?:\.\d{1,2})?)/i);
    if (p) found.price = Number(p);
  }
  if (!found.sourceItemId) {
    found.sourceItemId = itemIdFromUrl(meta.sourceUrl || '') || firstGroup(h, /[?&]id=(\d{6,})/);
  }
  // 详情区通常是一堆连续的 alicdn 图片
  const descImgs = extractDescImages(h).filter((u) => /alicdn\.com|taobaocdn\.com/.test(u));
  found.descImages = descImgs;
  if (!found.description) {
    if (descImgs.length > 3) {
      found.description = descImgs.map((u) => `<p><img src="${u}" alt=""/></p>`).join('\n');
    }
  } else if (descImgs.length && !/alicdn\.com|taobaocdn\.com/.test(found.description)) {
    // 文字详情（如 JSON-LD 的 description）里没有图，把页面详情图接在后面
    found.description = `${found.description}\n${descImgs.map((u) => `<p><img src="${u}" alt=""/></p>`).join('\n')}`;
  }

  reassembleShop(found);
  const draft = normalizeItem(found);
  draft.collectedVia = 'html';
  return draft;
}

function extractJsonLd(html) {
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try {
      const data = JSON.parse(m[1].trim());
      const list = Array.isArray(data) ? data : [data];
      const product = list.find((x) => x && /product/i.test(x['@type'] || ''));
      if (!product) continue;
      const offers = product.offers || {};
      return {
        title: product.name,
        description: product.description,
        price: offers.price || offers.lowPrice,
        images: [].concat(product.image || []),
      };
    } catch {
      /* 页面里的 JSON-LD 经常是残缺的，跳过 */
    }
  }
  return null;
}

/** 抓页面里所有像"数据对象"的 script 内容 */
function extractInlineJson(html) {
  const out = [];
  const markers = [
    /window\.__INITIAL_DATA__\s*=\s*/,
    /window\.g_page_config\s*=\s*/,
    /window\.g_config\s*=\s*/,
    /window\.__NEXT_DATA__\s*=\s*/,
    /window\.rawData\s*=\s*/,
    /TShop\.Setup\(\s*/,
    /window\.__GLOBAL_DATA\s*=\s*/,
    /Hub\s*=\s*/,
  ];
  for (const marker of markers) {
    const re = new RegExp(marker.source, 'g');
    let m;
    while ((m = re.exec(html))) {
      const json = sliceBalancedJson(html, m.index + m[0].length);
      if (json) {
        try {
          out.push(JSON.parse(json));
        } catch {
          /* 尾部常被截断，忽略 */
        }
      }
    }
  }
  // 兜底：<script id="__NEXT_DATA__" type="application/json">{...}</script>
  const nd = /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i.exec(html);
  if (nd) {
    try {
      out.push(JSON.parse(nd[1]));
    } catch {}
  }
  return out;
}

/** 从某个位置开始，按括号配对切出一个完整的 JSON 片段 */
function sliceBalancedJson(text, start) {
  let i = start;
  while (i < text.length && !/[{[]/.test(text[i])) i++;
  if (i >= text.length) return null;
  const open = text[i];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let j = i; j < text.length; j++) {
    const c = text[j];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === open || c === '{' || c === '[') depth++;
    else if (c === close || c === '}' || c === ']') {
      depth--;
      if (depth === 0) return text.slice(i, j + 1);
    }
  }
  return null;
}

/* ------------------------- 启发式字段扫描（mtop JSON） ------------------------- */

const KEY_MAP = {
  title: ['title', 'itemTitle', 'subject', 'name'],
  price: ['price', 'priceText', 'salePrice', 'promotionPrice', 'newPrice'],
  originalPrice: ['originPrice', 'originalPrice', 'tagPrice', 'zprice'],
  quantity: ['quantity', 'totalQuantity', 'sellCount', 'stock'],
  images: ['images', 'pics', 'picUrls', 'gallery', 'itemImgs', 'topImages'],
  picUrl: ['picUrl', 'pic', 'mainPic', 'itemPic'],
  itemId: ['itemId', 'numIid', 'num_iid', 'itemNumId'],
  shopId: ['shopId', 'sid'],
  sellerId: ['sellerId', 'userId', 'uid'],
  shopTitle: ['shopName', 'shopTitle', 'sellerNick', 'nick'],
  categoryId: ['categoryId', 'catId', 'cid', 'rootCategoryId'],
  descUrl: ['descUrl', 'wdescUrl', 'pcDescUrl'],
};

/**
 * 递归扫一棵任意结构的 JSON，把符合关键字的叶子值收集起来。
 * 淘宝 mtop 各接口返回层级差异极大，写死路径必然三天两头坏，
 * 用「按 key 名匹配 + 就近原则」更耐改版。
 */
function scanForItemFields(node, depth = 0) {
  const out = {};
  if (depth > 12 || node === null || typeof node !== 'object') return out;

  for (const [field, keys] of Object.entries(KEY_MAP)) {
    const hit = findFirstByKeys(node, keys, depth);
    if (hit !== undefined) out[field] = hit;
  }
  if (out.images) {
    out.images = flattenImages(out.images);
  } else if (out.picUrl) {
    out.images = [out.picUrl];
  }

  // 划线价：mtop 把它放在 price.extraPrices[0].priceText，不在常规 key 里
  if (out.originalPrice === undefined) {
    const priceNode = findFirstNode(node, ['price', 'priceInfo', 'extraPrices'], depth);
    const extra =
      (priceNode && priceNode.extraPrices) ||
      (Array.isArray(priceNode) ? priceNode : null) ||
      findFirstNode(node, ['extraPrices'], depth);
    if (Array.isArray(extra) && extra.length) {
      const first = extra[0];
      const v = first && typeof first === 'object' ? first.priceText || first.price || first.text : first;
      if (v !== undefined && v !== null && v !== '') out.originalPrice = v;
    }
  }

  const sku = findFirstNode(node, ['skuBase', 'skuModel', 'skuInfo', 'skus'], depth);
  if (sku) out.skusRaw = sku;

  const comps = findFirstNode(node, ['components', 'props', 'itemProps', 'propertyList'], depth);
  if (comps) out.propsRaw = comps;

  return out;
}

function findFirstByKeys(node, keys, depth) {
  if (depth > 12 || node === null || typeof node !== 'object') return undefined;
  if (!Array.isArray(node)) {
    for (const k of keys) {
      const v = node[k];
      if (v !== undefined && v !== null && v !== '') {
        if (typeof v === 'string' || typeof v === 'number') return v;
        if (Array.isArray(v)) return v;
        // price 常是 { priceText: '39.9' } 这种壳
        const inner = findFirstByKeys(v, keys, depth + 1);
        if (inner !== undefined) return inner;
      }
    }
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const inner = findFirstByKeys(v, keys, depth + 1);
    if (inner !== undefined) return inner;
  }
  return undefined;
}

function findFirstNode(node, keys, depth) {
  if (depth > 12 || node === null || typeof node !== 'object') return undefined;
  if (!Array.isArray(node)) {
    for (const k of keys) if (node[k]) return node[k];
  }
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const inner = findFirstNode(v, keys, depth + 1);
    if (inner) return inner;
  }
  return undefined;
}

function flattenImages(v) {
  const out = [];
  const walk = (x) => {
    if (!x) return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (typeof x === 'string') {
      const u = normalizeUrl(x);
      if (/^(https?:\/\/)/.test(u) && /\.(jpg|jpeg|png|webp)/i.test(u) && !out.includes(u)) out.push(u);
      return;
    }
    walk(x.url || x.picUrl || x.pic || x.path || x.src || x.imgUrl);
  };
  walk(v);
  return out;
}

/**
 * 启发式扫描的结果是扁平的 shopId / sellerId / shopTitle，
 * 而模型层读的是 shop 对象，这里拼回去。HTML 和 JSON 两条解析路径都要走这一步。
 */
function reassembleShop(target) {
  if (!target || typeof target !== 'object') return target;
  const flatId = target.shopId || target.sid;
  const flatSeller = target.sellerId || target.userId;
  const flatTitle = target.shopTitle || target.shopName || target.sellerNick;
  if (target.shop && typeof target.shop === 'object') {
    target.shop = {
      shopId: target.shop.shopId || flatId || '',
      sellerId: target.shop.sellerId || flatSeller || '',
      title: target.shop.title || flatTitle || '',
      url: target.shop.url || '',
    };
  } else if (flatId || flatSeller || flatTitle) {
    target.shop = { shopId: flatId || '', sellerId: flatSeller || '', title: flatTitle || '' };
  }
  return target;
}

/** 价格字段常是 {priceText, priceMoney} 这种壳，取里面的标量 */
function flattenPrice(v) {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v === 'string' || typeof v === 'number') return v;
  if (Array.isArray(v)) return v.length ? flattenPrice(v[0]) : undefined;
  if (typeof v === 'object') {
    for (const k of ['priceText', 'price', 'text', 'priceMoney', 'value']) {
      const inner = flattenPrice(v[k]);
      if (inner !== undefined) return inner;
    }
  }
  return undefined;
}

/** 解析任意 mtop / 接口 JSON 转储 */
function parseItemJson(input, meta = {}) {
  const merged = { ...(meta || {}) };
  mergeDeep(merged, scanForItemFields(input));
  // 如果输入本身就是规整结构，直接盖上去（优先级最高）；
  // 但价格这类字段可能是对象壳，必须展平成标量，否则 toNumber 会得到 0
  for (const k of ['title', 'images', 'skus', 'props', 'description', 'sourceUrl', 'sourceItemId', 'categoryId', 'quantity']) {
    if (input && input[k] !== undefined && input[k] !== null && input[k] !== '') merged[k] = input[k];
  }
  for (const k of ['price', 'originalPrice']) {
    const flat = input ? flattenPrice(input[k]) : undefined;
    if (flat !== undefined) merged[k] = flat;
  }
  reassembleShop(merged);
  if (merged.skusRaw && !merged.skus) merged.skus = normalizeSkuBase(merged.skusRaw);
  if (merged.propsRaw && !merged.props) merged.props = normalizeProps(merged.propsRaw);
  const draft = normalizeItem(merged);
  draft.collectedVia = 'json';
  return draft;
}

/** mtop 的 skuBase 是 {props:[{pid,name,values:[{vid,name,image}]}], skus:[{skuId,propPath}]} */
function normalizeSkuBase(skuBase) {
  if (!skuBase) return [];
  if (Array.isArray(skuBase)) return skuBase;
  const base = skuBase.skuBase || skuBase;
  const core = skuBase.skuCore || {};
  const info = core.sku2info || {};
  const propList = base.props || [];
  const valueName = new Map();
  const propImages = [];
  for (const p of propList) {
    for (const v of p.values || []) {
      valueName.set(`${p.pid}:${v.vid}`, `${p.name}:${v.name}`);
      if (v.image) propImages.push({ propText: `${p.name}:${v.name}`, url: normalizeUrl(v.image) });
    }
  }
  const skus = (base.skus || []).map((s) => {
    const texts = String(s.propPath || '')
      .split(';')
      .map((x) => valueName.get(x))
      .filter(Boolean);
    const c = info[s.skuId] || {};
    return {
      propPath: s.propPath || String(s.skuId || ''),
      propText: texts.join(';'),
      price: Number((c.price && (c.price.priceText || c.price)) || s.price || 0),
      quantity: Number(c.quantity || s.quantity || 0),
      outerId: '',
    };
  });
  skus.propImages = propImages;
  return skus;
}

function normalizeProps(raw) {
  if (!raw) return {};
  const out = {};
  const walk = (x) => {
    if (!x || typeof x !== 'object') return;
    if (Array.isArray(x)) return x.forEach(walk);
    if (x.name && (x.value || x.values || x.text)) {
      out[String(x.name)] = Array.isArray(x.values) ? x.values.map((v) => v.name || v).join(',') : String(x.value || x.text);
      return;
    }
    Object.values(x).forEach(walk);
  };
  walk(raw);
  return out;
}

/* ------------------------------ CSV ------------------------------ */

/** 极简 CSV（支持引号转义），用于批量导入已经整理好的表格 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let inQuote = false;
  const s = String(text || '').replace(/^\uFEFF/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuote) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuote = false;
      } else cell += c;
      continue;
    }
    if (c === '"') inQuote = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (c !== '\r') cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const CSV_HEADER_MAP = {
  标题: 'title', title: 'title', 商品标题: 'title',
  价格: 'price', price: 'price', 一口价: 'price',
  库存: 'quantity', quantity: 'quantity', num: 'quantity',
  主图: 'images', images: 'images', 图片: 'images', pic: 'images',
  链接: 'sourceUrl', url: 'sourceUrl', sourceUrl: 'sourceUrl', 商品链接: 'sourceUrl',
  商品id: 'sourceItemId', numiid: 'sourceItemId', itemid: 'sourceItemId', id: 'sourceItemId',
  类目: 'categoryId', cid: 'categoryId', categoryid: 'categoryId',
  详情: 'description', desc: 'description', description: 'description',
};

function parseCsvItems(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = header.map((h) => CSV_HEADER_MAP[h.toLowerCase()] || null);
  return rows
    .slice(1)
    .filter((r) => r.some((c) => String(c).trim()))
    .map((r) => {
      const o = {};
      idx.forEach((key, i) => {
        if (!key) return;
        const v = String(r[i] ?? '').trim();
        if (!v) return;
        o[key] = key === 'images' ? v.split(/[;|\s]+/).filter(Boolean) : v;
      });
      const d = normalizeItem(o);
      d.collectedVia = 'csv';
      return d;
    });
}

/* ------------------------------ 店铺页面 ------------------------------ */

/**
 * 从店铺页 / 搜索结果页 HTML 里抽出宝贝列表。
 * 这是「给个店铺链接就抓全部宝贝」的 DOM 兜底路径：
 * 所有宝贝卡片的链接都带 id=，比依赖具体 class 名耐改版得多。
 */
function parseShopItems(html, meta = {}) {
  const h = String(html || '');
  const items = new Map();

  // 以每个宝贝 id 的出现位置为中心取一段上下文。
  // 不能只截 <a> 标签内部：卡片结构通常是 <dl><dt><a><img></a></dt><dd>标题+价格</dd></dl>，
  // 价格躺在同一张卡片的另一个子节点里，窗口太小就会漏。
  const seen = new Set();
  for (const m of h.matchAll(/[?&]id=(\d{6,})/g)) {
    const id = m[1];
    const start = Math.max(0, m.index - 400);
    const ctx = h.slice(start, m.index + 1400);
    // 同一张卡片里图片链接和标题链接会各命中一次，用位置去重避免重复解析
    const bucket = `${id}:${Math.floor(m.index / 2000)}`;
    if (seen.has(bucket)) continue;
    seen.add(bucket);

    const rec = items.get(id) || { sourceItemId: id, images: [], ...(meta || {}) };

    const href = new RegExp(`href=["']([^"']*id=${id}[^"']*)["']`, 'i').exec(ctx);
    if (href && !rec.sourceUrl) rec.sourceUrl = normalizeUrl(href[1]);

    const img = /(?:data-src|data-ks-lazyload|src)=["']([^"']+)["']/i.exec(ctx);
    if (img) {
      const u = normalizeUrl(img[1]);
      if (/alicdn\.com|taobaocdn\.com/.test(u) && !rec.images.includes(u)) rec.images.push(u);
    }
    if (!rec.title) {
      const t =
        new RegExp(`title=["']([^"']{6,})["'][^>]*>`, 'i').exec(ctx) ||
        new RegExp(`>\\s*([^<>]{8,60})\\s*</a>`, 'i').exec(ctx);
      if (t && !/[¥￥]/.test(t[1])) rec.title = t[1].trim();
    }
    if (!rec.price) {
      const p = /[¥￥]\s*(\d+(?:\.\d{1,2})?)/.exec(ctx);
      if (p) rec.price = Number(p[1]);
    }
    if (!rec.sold) {
      const s = /(\d+)\s*人(?:付款|收货)/.exec(ctx) || /已售\s*(?:<[^>]+>\s*)*(\d+)/.exec(ctx);
      if (s) rec.sold = Number(s[1]);
    }
    items.set(id, rec);
  }

  // 内嵌 JSON 里的列表（shopitemsearch 之类）
  for (const blob of extractInlineJson(h)) {
    const list = findItemList(blob);
    for (const it of list) {
      const id = String(it.itemId || it.item_id || it.numIid || it.nid || '');
      if (!id) continue;
      const rec = items.get(id) || { sourceItemId: id, ...(meta || {}) };
      rec.title = rec.title || it.title || it.name;
      rec.price = rec.price || Number(it.price || (it.priceShow && it.priceShow.price) || 0);
      rec.sourceUrl = rec.sourceUrl || normalizeUrl(it.itemUrl || it.url || it.auctionUrl || `https://item.taobao.com/item.htm?id=${id}`);
      const pics = flattenImages(it.pic || it.picUrl || it.pic_path || it.images || it.img);
      if (pics.length) rec.images = [...new Set([...(rec.images || []), ...pics])];
      rec.sold = rec.sold || it.sold || it.saleCount || it.totalSoldQuantity;
      items.set(id, rec);
    }
  }

  return [...items.values()].map((r) => {
    const d = normalizeItem(r);
    d.collectedVia = 'shop-html';
    return d;
  });
}

function findItemList(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 10) return [];
  for (const k of ['itemsArray', 'listItems', 'auctions', 'items', 'itemList', 'list', 'result']) {
    const v = node[k];
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === 'object')) return v;
  }
  for (const v of Object.values(node)) {
    const inner = findItemList(v, depth + 1);
    if (inner.length) return inner;
  }
  return [];
}

/* ------------------------------ utils ------------------------------ */

function firstGroup(text, re) {
  const m = re.exec(String(text || ''));
  return m ? m[1].trim() : '';
}

function attr(text, re) {
  const m = re.exec(String(text || ''));
  return m ? m[1].trim() : '';
}

function mergeDeep(target, src) {
  for (const [k, v] of Object.entries(src || {})) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (!target[k] || (Array.isArray(target[k]) && !target[k].length)) target[k] = v;
    } else if (typeof v === 'object') {
      target[k] = target[k] && typeof target[k] === 'object' ? mergeDeep(target[k], v) : v;
    } else if (target[k] === undefined || target[k] === null || target[k] === '' || target[k] === 0) {
      target[k] = v;
    }
  }
  return target;
}

module.exports = {
  parseItemHtml,
  parseItemJson,
  parseShopItems,
  parseCsvItems,
  parseCsv,
  extractInlineJson,
  sliceBalancedJson,
  scanForItemFields,
  normalizeSkuBase,
  mergeDeep,
};

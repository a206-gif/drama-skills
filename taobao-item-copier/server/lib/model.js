'use strict';

/**
 * 商品数据模型。
 *
 * 采集端来源很杂（扩展抓的 DOM、mtop 详情、保存的网页、CSV 导出），
 * 全部先归一成 DraftItem，后面的图片提取和展示只认这一个结构。
 */

const crypto = require('node:crypto');

/** 把 //xxx 和 http:// 统一成 https://（内联在此，避免与 parser.js 循环依赖） */
function normalizeUrl(u) {
  if (!u) return '';
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  if (s.startsWith('http://')) s = `https://${s.slice(7)}`;
  return s;
}

/** 空的草稿结构，字段含义都写在注释里，前端画廊按这个结构展示 */
function emptyDraft() {
  return {
    sourceUrl: '', // 原商品链接
    sourceItemId: '', // 原 num_iid
    sourcePlatform: 'taobao', // taobao | tmall | 1688 | other
    sourceShop: { shopId: '', sellerId: '', title: '', url: '' },
    title: '',
    price: 0, // 一口价
    originalPrice: 0, // 划线价（选填）
    quantity: 0,
    images: [], // 主图 URL 列表，第一张是封面
    videoUrl: '',
    categoryId: '', // 原商品叶子类目（解析到就留档）
    categoryName: '',
    props: {}, // 关键属性 {品牌: '其他', 材质: '棉'}
    skus: [
      // { propPath: '1627207:28320;20509:28314', propText: '颜色:白;尺码:M', price, quantity, outerId }
    ],
    propImages: [], // 颜色属性图 [{ propText:'颜色:白', url }]
    description: '', // 详情 HTML
    descImages: [],
    location: { state: '', city: '' },
    keywords: [],
    collectedAt: '',
    warnings: [],
    raw: null, // 原始数据留档，出问题时能回溯
  };
}

/**
 * 归一化：接受任意来源的对象，尽力填出一个 DraftItem。
 * 找不到的字段留空并进 warnings，交给前端提示 —— 不猜，避免提取到错误数据。
 */
function normalizeItem(input = {}) {
  const d = emptyDraft();
  const src = input.item || input.data || input;

  d.title = pick(src, ['title', 'subject', 'itemTitle', 'name']) || '';
  d.sourceUrl = normalizeUrl(pick(src, ['sourceUrl', 'itemUrl', 'url', 'detailUrl', 'detail_url', 'pcUrl']) || '');
  d.sourceItemId = String(pick(src, ['sourceItemId', 'numIid', 'num_iid', 'itemId', 'item_id', 'id']) || '');
  if (!d.sourceItemId && d.sourceUrl) d.sourceItemId = itemIdFromUrl(d.sourceUrl);
  d.sourcePlatform = pick(src, ['sourcePlatform', 'platform']) || platformFromUrl(d.sourceUrl);

  const shop = src.shop || src.shopInfo || src.seller || {};
  d.sourceShop = {
    shopId: String(pick(shop, ['shopId', 'shop_id', 'sid']) || ''),
    sellerId: String(pick(shop, ['sellerId', 'seller_id', 'userId', 'user_id', 'uid']) || ''),
    title: pick(shop, ['title', 'shopName', 'nick', 'name']) || '',
    url: normalizeUrl(pick(shop, ['url', 'shopUrl', 'pcUrl']) || ''),
  };

  d.price = toNumber(pick(src, ['price', 'salePrice', 'promotionPrice', 'reservePrice', 'reserve_price']));
  d.originalPrice = toNumber(pick(src, ['originalPrice', 'originPrice', 'zprice', 'tagPrice']));
  d.quantity = toNumber(pick(src, ['quantity', 'num', 'stock', 'totalQuantity'])) || 0;
  d.categoryId = String(pick(src, ['categoryId', 'cid', 'catId', 'category_id']) || '');
  d.categoryName = pick(src, ['categoryName', 'catName']) || '';
  d.location = {
    state: pick(src, ['province', 'state', 'locState']) || (src.location && src.location.state) || '',
    city: pick(src, ['city', 'locCity']) || (src.location && src.location.city) || '',
  };

  d.images = collectImages(src);
  d.videoUrl = normalizeUrl(pick(src, ['videoUrl', 'video', 'mainVideoUrl']) || '');
  d.propImages = collectPropImages(src);
  d.skus = collectSkus(src);
  d.props = collectProps(src);
  d.description = pick(src, ['description', 'desc', 'detail', 'descHtml', 'content', 'mobileDesc']) || '';
  d.descImages = pick(src, ['descImages']) || [];
  d.keywords = pick(src, ['keywords']) || [];
  d.collectedAt = pick(src, ['collectedAt', 'collectTime']) || new Date().toISOString();
  d.raw = src;

  // 一致性检查：图片提取器关心的是「有没有图可提」
  if (!d.title) d.warnings.push('标题为空');
  if (!d.images.length) d.warnings.push('没有解析到主图');
  if (!d.images.length && !d.descImages.length && !d.propImages.length) {
    d.warnings.push('没有解析到任何图片，可能页面结构变了或还没下载详情');
  }

  return d;
}

function pick(obj, keys) {
  for (const k of keys) {
    const v = obj && obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

function toNumber(v) {
  if (v === undefined || v === null || v === '') return 0;
  const n = Number(String(v).replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function itemIdFromUrl(url) {
  const m = /[?&]id=(\d+)/.exec(String(url || ''));
  return m ? m[1] : '';
}

function platformFromUrl(url) {
  const s = String(url || '');
  if (s.includes('tmall.com')) return 'tmall';
  if (s.includes('1688.com')) return '1688';
  if (s.includes('taobao.com')) return 'taobao';
  return 'other';
}

/** 主图来源五花八门：数组 / 逗号串 / {url} 对象数组 / itemImgs 结构 */
function collectImages(src) {
  const out = [];
  const push = (v) => {
    if (!v) return;
    if (Array.isArray(v)) return v.forEach(push);
    const u = normalizeUrl(typeof v === 'string' ? v : v.url || v.picUrl || v.pic_url || v.path || v.src || '');
    if (u && !out.includes(u)) out.push(u);
  };
  push(src.images);
  push(src.pics);
  push(src.picUrls);
  push(src.itemImgs || src.item_imgs);
  push(src.gallery);
  push(src.mainPic);
  push(src.picUrl || src.pic_url || src.pic);
  push(src.image);
  return out;
}

function collectPropImages(src) {
  const rawList = src.propImages || src.propImgs || src.prop_imgs || src.prop_imgs?.prop_img || [];
  const list = Array.isArray(rawList) ? rawList : rawList.prop_img || [];
  return (list || [])
    .map((p) => ({
      propText: p.properties_name || p.propText || p.name || '',
      url: normalizeUrl(p.url || p.picUrl || p.pic_url || ''),
      position: p.position || 0,
    }))
    .filter((p) => p.url);
}

function collectSkus(src) {
  let list = src.skus || src.skuList || src.skuBase || src.sku || null;
  if (list && !Array.isArray(list)) list = list.skus || list.sku || list.list || [];
  if (!Array.isArray(list)) return [];

  // 有的接口给的是 skuBase(规格名) + skuCore(价格库存) 两段，需要拼
  const coreMap = new Map();
  const core = src.skuCore || src.skuCoreData;
  if (core && core.sku2info) {
    for (const [k, v] of Object.entries(core.sku2info)) {
      coreMap.set(k, {
        price: toNumber(v.price && (v.price.priceText || v.price.price) || v.price),
        quantity: toNumber(v.quantity || (v.quantityText)),
      });
    }
  }

  return list
    .map((s) => {
      const propPath = String(s.propPath || s.properties || s.prop_path || s.skuId || s.id || '');
      const fromCore = coreMap.get(propPath) || {};
      return {
        propPath,
        propText: s.propText || s.propertiesName || s.properties_name || s.name || s.text || '',
        price: toNumber(s.price) || fromCore.price || 0,
        quantity: toNumber(s.quantity ?? s.num ?? s.stock) || fromCore.quantity || 0,
        outerId: s.outerId || s.outer_id || '',
      };
    })
    .filter((s) => s.propPath || s.propText);
}

function collectProps(src) {
  const p = src.props || src.properties || src.itemProps || src.attributes || {};
  if (Array.isArray(p)) {
    const out = {};
    for (const it of p) {
      if (!it) continue;
      const k = it.name || it.key || it.propName;
      const v = it.value || it.val || it.propValue;
      if (k && v) out[k] = Array.isArray(v) ? v.join(',') : String(v);
    }
    return out;
  }
  if (p && typeof p === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(p)) out[k] = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return out;
  }
  return {};
}

/**
 * 商品唯一指纹：用来去重（同一个宝贝被采两次不该进两条）。
 *
 * 只能基于稳定标识符：sourceItemId（淘宝 num_iid 全平台唯一）> sourceUrl。
 * 绝不能把 title 掺进去 —— 标题是会被批量改写的，一旦改写指纹就变，
 * 同一个 sourceItemId 会被当成两个商品，重复采集就再也去不了重。
 * title 只在既没有 id 也没有 url 时（比如纯 CSV 导入）作为最后兜底。
 */
function fingerprint(draft) {
  const basis = draft.sourceItemId
    ? `id:${draft.sourceItemId}`
    : draft.sourceUrl
      ? `url:${String(draft.sourceUrl).split('#')[0]}`
      : `title:${draft.title || ''}`;
  return crypto.createHash('md5').update(basis, 'utf8').digest('hex').slice(0, 16);
}

module.exports = {
  emptyDraft,
  normalizeItem,
  fingerprint,
  itemIdFromUrl,
  platformFromUrl,
  pick,
  toNumber,
};

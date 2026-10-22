'use strict';

/**
 * 清洗改写引擎。
 *
 * 搬运过来的商品不能原样上架：标题会撞车（同款同质化）、价格要加价、
 * 详情图里带别人店铺的水印和二维码、关键词里带别人品牌名。
 * 这里把每一步做成纯函数 + 可组合的规则，批量应用。
 *
 * 所有函数都是 (value, options) => value，不改入参，方便测试。
 */

/* ------------------------------- 标题 ------------------------------- */

/** 淘宝标题上限：60 字节 = 30 个汉字。按字节裁，不能把多字节字符切一半 */
const TITLE_MAX_BYTES = 60;

function byteLength(str) {
  return Buffer.byteLength(String(str || ''), 'utf8');
}

function truncateByBytes(str, maxBytes = TITLE_MAX_BYTES) {
  const s = String(str || '');
  if (Buffer.byteLength(s, 'utf8') <= maxBytes) return s;
  let out = '';
  for (const ch of s) {
    const next = out + ch;
    if (Buffer.byteLength(next, 'utf8') > maxBytes) break;
    out = next;
  }
  return out.trim();
}

/**
 * 标题改写。
 * @param {string} title
 * @param {object} o
 *   prefix / suffix      直接加前后缀
 *   removeWords[]        要删掉的词（别人品牌名、店铺名、"包邮"之类）
 *   removeBrands         删掉所有【】[]()（）里的内容（很多水印文案在这里）
 *   replacements[{from,to,regex}]  关键词替换
 *   dedupeSpaces         合并多余空格
 *   titleCaseShuffle     同义词轮换（配合 titleVariants 用，避免整店标题一模一样）
 *   maxBytes             默认 60
 */
function rewriteTitle(title, o = {}) {
  let t = String(title || '').replace(/\s+/g, ' ').trim();
  if (!t) return t;

  if (o.removeBrands) t = t.replace(/[【\[（(][^】\]）)]*[】\]）)]/g, ' ');
  for (const w of o.removeWords || []) {
    if (!w) continue;
    t = t.split(w).join(' ');
  }
  for (const r of o.replacements || []) {
    if (!r || !r.from) continue;
    t = r.regex ? t.replace(new RegExp(r.from, r.flags || 'g'), r.to || '') : t.split(r.from).join(r.to || '');
  }
  // 常见的营销垃圾词，默认建议删（不强制，由调用方传 removeWords）
  t = t.replace(/\s+/g, ' ').trim();

  const prefix = (o.prefix || '').trim();
  const suffix = (o.suffix || '').trim();
  const maxBytes = o.maxBytes || TITLE_MAX_BYTES;
  const sep = o.separator || ' ';
  // 先给前后缀留位置，再裁原标题。分隔符也要算进占用。
  const sepBytes = (prefix ? byteLength(sep) : 0) + (suffix ? byteLength(sep) : 0);
  const reserved = byteLength(prefix) + byteLength(suffix) + sepBytes;
  // 前后缀本身就吃满预算时，bodyMax 归零、原标题被舍弃，但 60 字节上限绝不突破。
  // 这里不能设最低值：一旦强行留几字节给正文，末尾的后缀就会被 truncate 掉。
  const bodyMax = Math.max(0, maxBytes - reserved);
  t = bodyMax > 0 ? truncateByBytes(t, bodyMax) : '';
  t = [prefix, t, suffix].filter(Boolean).join(sep).trim();
  return truncateByBytes(t, maxBytes);
}

/**
 * 标题变体：批量搬同一家的多个商品时，标题雷同会被判同质化。
 * 这里用「词序轮换 + 同义修饰词池」生成第 n 个变体，确定性可复现。
 */
const MODIFIER_POOL = ['新款', '爆款', '正品', '现货', '包邮', '热销', '推荐', '精选', '同款', '直销'];

function titleVariant(title, index, o = {}) {
  const pool = o.modifiers || MODIFIER_POOL;
  const t = String(title || '').trim();
  if (!index || !pool.length) return t;
  // 按 index 稳定选一个修饰词，插到标题中间而不是开头，避免整店开头都一样
  const word = pool[index % pool.length];
  if (t.includes(word)) return t;
  const mid = Math.max(4, Math.floor(t.length / 3));
  const out = `${t.slice(0, mid)}${word}${t.slice(mid)}`;
  return truncateByBytes(out, o.maxBytes || TITLE_MAX_BYTES);
}

/* ------------------------------- 价格 ------------------------------- */

/**
 * 价格改写。搬货一般要加价覆盖运费和退款损耗。
 * @param {number|string} price
 * @param {object} o
 *   multiplier    倍率，如 1.35
 *   offset        加价绝对值，如 5
 *   min / max     夹逼区间
 *   roundTo       小数位，默认 2
 *   ending        尾数偏好：'.9' → 29.9，'.8'，'9' 等；先算价再吸到最近的尾数
 */
/**
 * 四舍五入到指定小数位。
 *
 * 不用 Number.prototype.toFixed：它按浮点数的「实际值」舍入，
 * 而 42.9 * 1.35 在二进制里是 57.91499999999999…，toFixed(2) 会给 57.91，
 * 但任何人手工算 57.915 都会写 57.92。价格差一分钱，几百个 SKU 就是一笔对不上的账。
 * 这里用 Number.EPSILON 把中点推回它数学上应在的那一侧。
 */
function roundHalfUp(value, decimals = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const f = 10 ** decimals;
  return Math.round((n + Number.EPSILON * Math.abs(n)) * f) / f;
}

function rewritePrice(price, o = {}) {
  // 入参可能是 '¥39.90' / '39.9元' / 3990(分) 之类，先剥掉非数字字符
  let p = typeof price === 'number' ? price : Number(String(price ?? '').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(p)) p = 0;
  const raw = p;
  if (o.multiplier) p *= Number(o.multiplier);
  if (o.offset) p += Number(o.offset);
  const roundTo = o.roundTo === undefined ? 2 : Number(o.roundTo);
  p = roundHalfUp(p, roundTo);

  if (o.ending) {
    const endStr = String(o.ending).replace(/^\./, '');
    const endDigit = Number(endStr.slice(-1));
    if (Number.isFinite(endDigit)) {
      const floor = Math.floor(p);
      const candidate = roundHalfUp(floor + endDigit / 10, roundTo);
      // 加价后的价格不能低于原价，尾数往下掉就进一位
      p = candidate >= raw || candidate === 0 ? candidate : roundHalfUp(floor + 1 + endDigit / 10, roundTo);
    }
  }

  if (o.min !== undefined && o.min !== '') p = Math.max(p, Number(o.min));
  if (o.max !== undefined && o.max !== '') p = Math.min(p, Number(o.max));
  return roundHalfUp(Math.max(0, p), roundTo);
}

/** SKU 价格整体改写，保持各规格之间的相对差价（否则会破坏原本的价差结构） */
function rewriteSkuPrices(skus, o = {}) {
  return (skus || []).map((sku) => ({
    ...sku,
    price: rewritePrice(sku.price, o),
    quantity: o.quantity !== undefined && o.quantity !== null && o.quantity !== '' ? Number(o.quantity) : sku.quantity,
  }));
}

/* ------------------------------- 详情 ------------------------------- */

/**
 * 详情 HTML 清洗：
 *  - 把淘宝图片空间的链接规整成 https（原页面常有 // 或 http）
 *  - 去掉别人店铺的店招、关注引导、二维码、客服旺旺浮层
 *  - 删掉 <script>/<iframe>/<a>（详情里带外链是违规项，会被审核打回）
 *  - 可选：插入自己的头图/尾图 HTML
 */
const DESC_STRIP_SELECTORS = [
  /<script[\s\S]*?<\/script>/gi,
  /<iframe[\s\S]*?<\/iframe>/gi,
  /<a\s[\s\S]*?<\/a>/gi,
  /<(div|p|section|img)[^>]*class="[^"]*(shop-?header|qrcode|qr-?code|wangwang|ww-|service|kefu|follow|collect)[^"]*"[\s\S]*?<\/\1>/gi,
  /<img[^>]*src="[^"]*(qrcode|weixin|wechat|wangwang)[^"]*"[^>]*>/gi,
];

function cleanDescription(html, o = {}) {
  let d = String(html || '');
  if (!d) return '';
  for (const re of DESC_STRIP_SELECTORS) d = d.replace(re, '');
  if (o.stripLinks !== false) d = d.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, ''); // onclick 之类
  d = d.replace(/src="\/\//g, 'src="https://').replace(/src='\/\//g, "src='https://");
  d = d.replace(/src="http:\/\//g, 'src="https://');
  if (o.headerHtml) d = `${o.headerHtml}\n${d}`;
  if (o.footerHtml) d = `${d}\n${o.footerHtml}`;
  return d.replace(/\n{3,}/g, '\n\n').trim();
}

/** 从详情 HTML 里抽出所有图片 URL（用于把详情图也搬到本地/自己图空间） */
function extractDescImages(html) {
  const out = [];
  const re = /<img[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const u = normalizeUrl(m[1]);
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}

/* ------------------------------- 图片 ------------------------------- */

function normalizeUrl(u) {
  if (!u) return '';
  let s = String(u).trim();
  if (s.startsWith('//')) s = `https:${s}`;
  if (s.startsWith('http://')) s = `https://${s.slice(7)}`;
  // 淘宝图片空间的尺寸后缀（_400x400.jpg / _.webp / _q90.jpg），下载时去掉拿原图
  return s;
}

/**
 * 去掉淘宝 CDN 的尺寸/格式后缀，拿最大原图。
 * 形如 O1CN01xxx.jpg_400x400.jpg / O1CN01xxx.jpg_.webp / O1CN01xxx.jpg_q90.jpg，
 * 真实文件都是第一个扩展名之前的部分，后面的都是 CDN 动态生成的缩略参数。
 */
function toOriginalImage(u) {
  let s = normalizeUrl(u).split('?')[0].split('#')[0];
  // 先去掉结尾的格式转换段（.jpg_.webp）
  s = s.replace(/\.(jpg|jpeg|png|webp|gif)_\.webp$/i, '.$1');
  // 再去掉尺寸/质量后缀段（.jpg_400x400.jpg、.png_q90.png 等）
  s = s.replace(/\.(jpg|jpeg|png|webp|gif)_(?:\d+x\d+(?:xz)?|q\d+|sum|m|b|s)\.(jpg|jpeg|png|webp)$/i, '.$1');
  return s;
}

/* ------------------------------- 规则集 ------------------------------- */

/**
 * 把一组规则应用到整条商品草稿上，返回新对象（不改入参）。
 * @param {object} item  见 lib/model.js 的 normalizeItem 输出
 * @param {object} rules
 * @param {number} index 第几条（标题变体用）
 */
function applyRules(item, rules = {}, index = 0) {
  const out = { ...item };
  const r = rules;

  if (r.title) {
    let t = rewriteTitle(item.title, r.title);
    if (r.title.variant) t = titleVariant(t, index, r.title);
    out.title = t;
  }
  if (r.price) {
    out.price = rewritePrice(item.price, r.price);
    if (item.skus && item.skus.length) out.skus = rewriteSkuPrices(item.skus, r.price);
  }
  if (r.quantity !== undefined && r.quantity !== null && r.quantity !== '') {
    out.quantity = Number(r.quantity);
    if (out.skus && out.skus.length) out.skus = out.skus.map((s) => ({ ...s, quantity: Number(r.quantity) }));
  }
  if (r.description) {
    out.description = cleanDescription(item.description, r.description);
  }
  if (r.images) {
    let imgs = (item.images || []).map(normalizeUrl).filter(Boolean);
    if (r.images.original) imgs = imgs.map(toOriginalImage);
    if (r.images.maxCount) imgs = imgs.slice(0, Number(r.images.maxCount));
    if (r.images.minCount && imgs.length < Number(r.images.minCount)) {
      out.warnings = [...(out.warnings || []), `主图只有 ${imgs.length} 张，少于建议的 ${r.images.minCount} 张`];
    }
    out.images = imgs;
  }
  if (r.props) {
    // props 是 {品牌: xx, 材质: yy} 这种键值对；品牌必须换成自己的，否则会被判盗图/侵权
    const props = { ...(item.props || {}) };
    for (const [k, v] of Object.entries(r.props.set || {})) props[k] = v;
    for (const k of r.props.remove || []) delete props[k];
    out.props = props;
  }
  if (r.categoryId) out.categoryId = String(r.categoryId);
  if (r.postageId) out.postageId = String(r.postageId);
  if (r.location) out.location = { ...(out.location || {}), ...r.location };

  out.rulesAppliedAt = new Date().toISOString();
  return out;
}

module.exports = {
  TITLE_MAX_BYTES,
  byteLength,
  truncateByBytes,
  rewriteTitle,
  titleVariant,
  rewritePrice,
  rewriteSkuPrices,
  cleanDescription,
  extractDescImages,
  normalizeUrl,
  toOriginalImage,
  applyRules,
  MODIFIER_POOL,
};

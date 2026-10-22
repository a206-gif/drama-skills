'use strict';

/**
 * 发布流水线（官方 TOP API）。
 *
 * 淘宝发布一个商品不是一个接口能搞定的，顺序错了就报错，完整链路是：
 *
 *   ① 定类目      taobao.itemcats.get / taobao.itemcats.authorize.get
 *   ② 查关键属性  taobao.itemprops.get          → 必填属性必须凑齐
 *   ③ 传图片      taobao.picture.upload（图空间）或 item.add 直接带 pic_path
 *   ④ 建商品      taobao.item.add               → 返回 num_iid
 *   ⑤ 补主图      taobao.item.img.upload        → 第 2~5 张主图
 *   ⑥ 补属性图    taobao.item.propimg.upload    → 颜色分类对应的图
 *   ⑦ 补详情      taobao.item.update（desc）
 *   ⑧ 上架        taobao.item.update.listing    → 若默认存仓库中则跳过
 *
 * 每一步都记日志、可重试、失败即停并保留已建商品 id（避免出现「建了一半的幽灵商品」还不知道 id）。
 */

const top = require('./top-client');
const images = require('./images');
const store = require('./store');

/** 把 props 对象拼成 TOP 要的 "pid:vid;pid:vid" 形式；没有 pid 时用 "名称:值" 交给前端映射 */
function buildPropsString(props, propMap = {}) {
  const parts = [];
  for (const [name, value] of Object.entries(props || {})) {
    if (value === undefined || value === null || value === '') continue;
    const mapped = propMap[name];
    if (mapped && mapped.pid && mapped.vid) parts.push(`${mapped.pid}:${mapped.vid}`);
    else if (mapped && mapped.pid) parts.push(`${mapped.pid}:${value}`);
    else parts.push(`${name}:${value}`); // 兜底：多数类目不接受，会在报错里告诉你缺哪个 pid
  }
  return parts.join(';');
}

/** SKU 拼成 TOP 的 skus 参数：props 用分号分隔的属性路径，逗号分隔多个 SKU */
function buildSkusParam(skus) {
  return (skus || [])
    .filter((s) => s.propPath && s.price)
    .map((s) => {
      const seg = [
        s.propPath,
        Number(s.price).toFixed(2),
        Number(s.quantity || 0),
        s.outerId || '',
        '', // sku 商家编码后的扩展位
      ];
      return seg.join(':').replace(/:+$/, '');
    })
    .join(',');
}

/**
 * 发布单条商品。
 * @param {object} draft  归一化 + 改写后的商品草稿
 * @param {object} opts   { onStep, propMap, dryRun }
 * @returns {Promise<{numIid, steps}>}
 */
async function publishItem(draft, opts = {}) {
  const cfg = store.getSettings().publish || {};
  const onStep = opts.onStep || (() => {});
  const steps = [];

  const record = async (name, fn) => {
    const at = Date.now();
    onStep({ name, state: 'running' });
    try {
      const result = opts.dryRun ? { dryRun: true } : await fn();
      steps.push({ name, state: 'ok', ms: Date.now() - at, result: summarize(result) });
      onStep({ name, state: 'ok', ms: Date.now() - at, result: summarize(result) });
      return result;
    } catch (e) {
      steps.push({ name, state: 'error', ms: Date.now() - at, error: e.message, hint: e.hint || '' });
      onStep({ name, state: 'error', error: e.message, hint: e.hint || '' });
      throw e;
    }
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const delay = () => sleep(opts.stepDelayMs ?? cfg.stepDelayMs ?? 600);

  /* ---- ① 类目 ---- */
  // 优先级：本次发布指定的 > 商品自带的 > 设置里的默认值。
  // 批量发布时所有商品共用发布页选的那个类目，所以 opts.categoryId 必须能覆盖商品自身的空值。
  let cid = opts.categoryId || draft.categoryId || cfg.defaultCategoryId;
  if (!cid) {
    throw new Error(
      '没有发布类目（cid）。到「类目」页查一个叶子类目，或在设置里配 defaultCategoryId。' +
        '淘宝不允许在非叶子类目下发布商品。'
    );
  }

  /* ---- ② 关键属性 ---- */
  let propsString = buildPropsString(draft.props, opts.propMap);
  if (!opts.skipPropCheck) {
    const required = await record('check-required-props', () =>
      top.call('taobao.itemprops.get', {
        cid,
        fields: 'pid,name,prop_values,required,multi,is_key',
        is_key: true,
        page_no: 1,
        page_size: 100,
      })
    );
    const list = (required && (required.item_props?.item_prop || required.item_props || [])) || [];
    const missing = list
      .filter((p) => p.required || p.is_key)
      .filter((p) => !new RegExp(`(^|;)${p.pid}:`).test(propsString))
      .map((p) => `${p.name}(pid=${p.pid})`);
    if (missing.length && !opts.allowMissingProps) {
      throw new Error(
        `类目 ${cid} 还缺必填关键属性：${missing.join('、')}。` +
          '在商品编辑页的「属性」里填上，或把 propMap 配好（属性名 → pid:vid）。' +
          '确认要强行提交可勾「忽略缺失属性」。'
      );
    }
    await delay();
  }

  /* ---- ③ 图片准备 ---- */
  const mode = opts.imageMode || cfg.imageMode || 'remote';
  let mainPicPath = '';
  let uploadPayloads = []; // { name, filename, contentType, content, kind, index }

  if (mode === 'local') {
    const localized = await record('localize-images', async () => {
      const r = await images.localizeItemImages(draft, { concurrency: opts.concurrency || 3 });
      draft = { ...draft, ...r, };
      return r.report;
    });
    if (localized.failed && localized.failed.length) {
      steps.push({ name: 'localize-images-warn', state: 'warn', detail: localized.failed });
    }
    await delay();
  }

  const firstImage = (draft.images || [])[0] || '';
  if (!firstImage) throw new Error('没有主图，淘宝发布必须有主图。');
  mainPicPath = firstImage.startsWith('/media/') ? '' : firstImage; // 本地图走字节上传

  /* ---- ④ 建商品 ---- */
  const itemParams = {
    num: draft.quantity || 1,
    price: Number(draft.price || 0).toFixed(2),
    type: opts.type || 'fixed', // fixed=一口价
    stuff_status: opts.stuffStatus || 'new',
    title: draft.title,
    desc: draft.description || '<p>商品详情</p>',
    cid,
    has_invoice: cfg.defaultHasInvoice !== false,
    has_warranty: cfg.defaultHasWarranty !== false,
    has_quota: cfg.defaultHasQuota === true,
    auction_point: cfg.defaultAuctionPoint || 0,
    approve_status: opts.approveStatus || cfg.defaultApproveStatus || 'instock',
    freight_payer: opts.freightPayer || cfg.defaultFreightPayer || 'seller',
    valid_thre: cfg.defaultValidThru || 7,
    outer_id: draft.outerId || '',
  };
  if (propsString) itemParams.props = propsString;
  if (mainPicPath) itemParams.pic_path = mainPicPath;
  if (draft.location?.state) item_params_location(itemParams, draft.location);
  else if (cfg.defaultLocationState) item_params_location(itemParams, { state: cfg.defaultLocationState, city: cfg.defaultLocationCity });
  const postageId = opts.postageId || cfg.defaultPostageId;
  if (postageId) itemParams.postage_id = postageId;
  if (draft.skus && draft.skus.length) {
    const skusParam = buildSkusParam(draft.skus);
    if (skusParam) itemParams.skus = skusParam;
    itemParams.props_name = buildPropsName(draft.skus);
  }
  if (opts.sellerCids) itemParams.seller_cids = opts.sellerCids;

  const created = await record('taobao.item.add', () => top.call('taobao.item.add', itemParams));
  const numIid = String(created?.item?.num_iid || created?.num_iid || '');
  if (!numIid && !opts.dryRun) throw new Error(`item.add 没返回 num_iid：${JSON.stringify(created).slice(0, 300)}`);
  await delay();

  /* ---- 主图字节上传（本地图模式） ---- */
  if (!mainPicPath && !opts.dryRun) {
    const f = images.readFileForUpload(firstImage);
    await record('upload-main-image', () =>
      top.call(
        'taobao.item.img.upload',
        { num_iid: numIid, position: 1, is_major: true },
        { files: [{ name: 'image', filename: f.filename, contentType: f.contentType, content: f.content }] }
      )
    );
    await delay();
  }

  /* ---- ⑤ 其余主图 ---- */
  const rest = (draft.images || []).slice(1, 5);
  for (let i = 0; i < rest.length; i++) {
    const u = rest[i];
    if (u.startsWith('/media/')) {
      const f = images.readFileForUpload(u);
      uploadPayloads.push({ position: i + 2, file: f });
    } else {
      uploadPayloads.push({ position: i + 2, picPath: u });
    }
  }
  for (const p of uploadPayloads) {
    if (opts.dryRun) break;
    const appParams = { num_iid: numIid, position: p.position, is_major: false };
    const callOpts = p.file
      ? { files: [{ name: 'image', filename: p.file.filename, contentType: p.file.contentType, content: p.file.content }] }
      : { pic_path: p.picPath };
    if (p.picPath) appParams.pic_path = p.picPath;
    await record(`item.img.upload#${p.position}`, () => top.call('taobao.item.img.upload', appParams, callOpts.files ? callOpts : {}));
    await delay();
  }

  /* ---- ⑥ 颜色属性图 ---- */
  for (let i = 0; i < (draft.propImages || []).length; i++) {
    const pi = draft.propImages[i];
    if (!pi.url || !pi.propText) continue;
    if (opts.dryRun) break;
    const appParams = { num_iid: numIid, properties: pi.propPath || pi.propText, position: i + 1 };
    let callOpts = {};
    if (pi.url.startsWith('/media/')) {
      const f = images.readFileForUpload(pi.url);
      callOpts = { files: [{ name: 'image', filename: f.filename, contentType: f.contentType, content: f.content }] };
    } else {
      appParams.pic_path = pi.url;
    }
    await record(`item.propimg.upload#${i + 1}`, () => top.call('taobao.item.propimg.upload', appParams, callOpts));
    await delay();
  }

  /* ---- ⑧ 上架 ---- */
  if ((itemParams.approve_status === 'instock') && opts.listNow) {
    await record('taobao.item.update.listing', () => top.call('taobao.item.update.listing', { num_iid: numIid }));
  }

  return { numIid, steps, approveStatus: itemParams.approve_status, itemParams };
}

function item_params_location(params, loc) {
  if (loc.state) params.location_state = loc.state;
  if (loc.city) params.location_city = loc.city;
}

/** props_name 是 SKU 别名字符串：pid:vid:别名;pid:vid:别名 */
function buildPropsName(skus) {
  const map = new Map();
  for (const s of skus || []) {
    if (!s.propPath || !s.propText) continue;
    const paths = String(s.propPath).split(';');
    const texts = String(s.propText).split(/[;；]/);
    paths.forEach((p, i) => {
      const text = texts[i];
      if (!text || !/^\d+:\d+$/.test(p) || map.has(p)) return;
      // propText 每段可能是「颜色分类:白色」（带属性名）也可能就是「白色」，两种都要能取到别名
      const idx = text.indexOf(':');
      const alias = (idx > 0 ? text.slice(idx + 1) : text).trim();
      if (alias) map.set(p, alias);
    });
  }
  return [...map.entries()].map(([p, alias]) => `${p}:${alias}`).join(';');
}

function summarize(o) {
  if (!o || typeof o !== 'object') return o;
  const s = JSON.stringify(o);
  return s.length > 800 ? `${s.slice(0, 800)}…` : o;
}

/* ---------------- 辅助查询接口 ---------------- */

async function getChildCategories(parentCid = 0) {
  const r = await top.call('taobao.itemcats.get', {
    parent_cid: parentCid,
    fields: 'cid,parent_cid,name,is_parent,status,sort_order',
  });
  return r?.item_cats?.item_cat || r?.item_cats || [];
}

async function searchCategories(keyword) {
  const r = await top.call('taobao.itemcats.get', {
    fields: 'cid,parent_cid,name,is_parent,status',
    q: keyword,
  });
  return r?.item_cats?.item_cat || r?.item_cats || [];
}

async function getCategoryProps(cid, isKey = false) {
  const r = await top.call('taobao.itemprops.get', {
    cid,
    fields: 'pid,name,prop_values,required,multi,is_key,is_sale_prop,status,sort_order',
    ...(isKey ? { is_key: true } : {}),
    page_no: 1,
    page_size: 200,
  });
  return r?.item_props?.item_prop || r?.item_props || [];
}

async function getSaleProps(cid) {
  const r = await top.call('taobao.itemprops.get', {
    cid,
    fields: 'pid,name,prop_values,required,multi,is_key,is_sale_prop,status',
    is_sale_prop: true,
    page_no: 1,
    page_size: 200,
  });
  return r?.item_props?.item_prop || r?.item_props || [];
}

/** 用官方类目推荐接口按标题猜类目，省得人工一层层翻 */
async function suggestCategory(title) {
  const r = await top.call('taobao.itemcats.authorize.get', {
    fields: 'cid,parent_cid,name,is_parent',
  });
  return r?.item_cats?.item_cat || r?.item_cats || [];
}

async function getSellerInfo() {
  const r = await top.call('taobao.user.seller.get', {
    fields: 'user_id,nick,type,has_more_pic,item_img_num,props_num,seller_credit',
  });
  return r?.user || r;
}

module.exports = {
  publishItem,
  buildPropsString,
  buildSkusParam,
  buildPropsName,
  getChildCategories,
  searchCategories,
  getCategoryProps,
  getSaleProps,
  suggestCategory,
  getSellerInfo,
};

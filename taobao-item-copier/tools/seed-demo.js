'use strict';

/**
 * 演示数据：把 fixtures 里的样例解析进本地商品库，
 * 让你不用连淘宝、不用装扩展，打开控制台就能看到完整的界面和数据流。
 *
 *   node tools/seed-demo.js
 *
 * 想清空重来：删掉 data/db.json 再跑一次。
 */

const fs = require('node:fs');
const path = require('node:path');

const store = require('../server/lib/store');
const parser = require('../server/lib/parser');
const transform = require('../server/lib/transform');
const { fingerprint } = require('../server/lib/model');

store.init();

const FIX = path.join(__dirname, '..', 'fixtures');
const itemHtml = fs.readFileSync(path.join(FIX, 'sample-item.html'), 'utf8');
const shopHtml = fs.readFileSync(path.join(FIX, 'sample-shop.html'), 'utf8');

function save(draft, extra = {}) {
  const fp = fingerprint(draft);
  if (store.all().some((it) => it.fingerprint === fp)) return null;
  return store.create({ ...draft, fingerprint: fp, collectCount: 1, ...extra });
}

const shop = { shopId: '111222333', sellerId: '1234567', title: '样例女装旗舰店', url: 'https://shop111222333.taobao.com' };
store.upsertShop({ ...shop, itemCount: 4, via: 'seed-demo' });

let n = 0;

// 1) 一个字段齐全的商品（含 SKU、属性图、详情），并套用一套改写规则演示效果
const full = parser.parseItemHtml(itemHtml, { sourceUrl: 'https://item.taobao.com/item.htm?id=723456789012' });
full.skus = parser.normalizeSkuBase(full.raw.skusRaw || {});
full.propImages = (full.skus.propImages || []).map((p) => ({ ...p }));
const rewritten = transform.applyRules(full, {
  title: { removeBrands: true, prefix: '现货', suffix: '包邮' },
  price: { multiplier: 1.35, ending: '9' },
  quantity: 200,
  images: { original: true, maxCount: 5 },
  props: { set: { 品牌: '其他' } },
  description: { strip: true },
}, 1);
if (save({ ...full, ...rewritten, status: 'ready', categoryId: '50000671' }, { collectedVia: 'seed-demo' })) n++;

// 2) 店铺页里批量解析出的宝贝，保持「已采集」状态，演示待处理队列
for (const d of parser.parseShopItems(shopHtml, { sourceShop: shop })) {
  d.categoryId = '50000671';
  if (save(d, { collectedVia: 'seed-demo' })) n++;
}

store.saveNow();

console.log('');
console.log(`  已写入 ${n} 条演示商品到本地商品库`);
console.log(`  数据文件：${path.join(store.DATA_DIR, 'db.json')}`);
console.log('  启动服务后打开控制台即可看到：npm start');
console.log('');

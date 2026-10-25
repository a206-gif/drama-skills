'use strict';

/**
 * 演示数据：把 fixtures 里的样例店铺 / 商品解析进本地库，
 * 让你不用连淘宝、不用装扩展，打开控制台就能看到图片提取器的完整界面和数据流。
 *
 *   node tools/seed-demo.js
 *
 * 想清空重来：删掉 data/db.json（和 data/images/）再跑一次。
 * 说明：演示数据里的图片是淘宝 CDN 外链，只有在能联网的机器上点「下载图片」才会落地到本地库。
 */

const fs = require('node:fs');
const path = require('node:path');

const store = require('../server/lib/store');
const parser = require('../server/lib/parser');
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

// 1) 一个字段齐全的商品详情页：主图 / 详情图 / 属性图都能解析出来
const full = parser.parseItemHtml(itemHtml, { sourceUrl: 'https://item.taobao.com/item.htm?id=723456789012' });
if (save({ ...full }, { collectedVia: 'seed-demo' })) n++;

// 2) 店铺页里批量解析出的宝贝链接，演示「扫描整店」后待提取图片的列表
for (const d of parser.parseShopItems(shopHtml, { sourceShop: shop })) {
  if (save(d, { collectedVia: 'seed-demo' })) n++;
}

store.saveNow();

console.log('');
console.log(`  已写入 ${n} 条演示商品到本地库（含主图 / 详情图 / 属性图链接）`);
console.log(`  数据文件：${path.join(store.DATA_DIR, 'db.json')}`);
console.log('  启动服务后打开控制台即可看到画廊：npm start');
console.log('');

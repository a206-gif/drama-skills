'use strict';

/** 清洗改写：搬过来的标题/价格/详情必须按规则批量变形，且不能把多字节字符切坏 */

const test = require('node:test');
const assert = require('node:assert');
const t = require('../server/lib/transform');

test('标题按字节裁剪，不会切坏中文', () => {
  const long = '纯棉'.repeat(40); // 80 字 = 240 字节
  const cut = t.truncateByBytes(long, 60);
  assert.ok(Buffer.byteLength(cut, 'utf8') <= 60);
  assert.strictEqual(cut, '纯棉'.repeat(10), '60 字节 = 20 个汉字 = 10 个「纯棉」');
  // 裁完仍是合法 UTF-8：重新编码后与自身一致，说明没有半个字符
  assert.strictEqual(Buffer.from(cut, 'utf8').toString('utf8'), cut);

  // 上限卡在汉字中间时，不能把三字节字符切成两半
  const cut2 = t.truncateByBytes('纯棉T恤女装', 11);
  assert.ok(Buffer.byteLength(cut2, 'utf8') <= 11);
  assert.strictEqual(Buffer.from(cut2, 'utf8').toString('utf8'), cut2);
  assert.strictEqual(cut2, '纯棉T恤', '3+3+1+3=10 字节，再加「女」就到 13 超了');
});

test('标题加前后缀后仍不超 60 字节，且前后缀一定保留', () => {
  const out = t.rewriteTitle('纯棉宽松短袖T恤女夏季ins潮百搭打底衫上衣', {
    prefix: '现货',
    suffix: '包邮',
  });
  assert.ok(out.startsWith('现货'));
  assert.ok(out.endsWith('包邮'));
  assert.ok(Buffer.byteLength(out, 'utf8') <= 60);
});

test('删除品牌词、删除【】内容、关键词替换', () => {
  const raw = '【旗舰店正品】SAMPLE 纯棉T恤女 专柜同款 包邮';
  const out = t.rewriteTitle(raw, {
    removeBrands: true,
    removeWords: ['SAMPLE', '专柜同款'],
    replacements: [{ from: '包邮', to: '顺丰' }],
  });
  assert.ok(!out.includes('旗舰店正品'));
  assert.ok(!out.includes('SAMPLE'));
  assert.ok(!out.includes('专柜同款'));
  assert.ok(out.includes('顺丰'));
  assert.ok(out.includes('纯棉T恤女'));
});

test('正则替换生效', () => {
  const out = t.rewriteTitle('T恤 2026新款 女', {
    replacements: [{ from: '\\d{4}新款', to: '当季', regex: true }],
  });
  assert.strictEqual(out, 'T恤 当季 女');
});

test('标题变体按序号稳定生成不同结果，且不同商品不雷同', () => {
  const base = '纯棉宽松短袖T恤女夏季百搭上衣';
  const v0 = t.titleVariant(base, 0);
  const v1 = t.titleVariant(base, 1);
  const v2 = t.titleVariant(base, 2);
  assert.strictEqual(v0, base, 'index=0 不改');
  assert.notStrictEqual(v1, v2);
  assert.ok(t.titleVariant(base, 1 + 10) === v1, '同 index 必须可复现');
  assert.ok(Buffer.byteLength(v1, 'utf8') <= 60);
});

test('价格倍率 + 加价 + 尾数', () => {
  assert.strictEqual(t.rewritePrice(39.9, { multiplier: 1.35 }), 53.87);
  assert.strictEqual(t.rewritePrice(39.9, { offset: 10 }), 49.9);
  assert.strictEqual(t.rewritePrice(39.9, { multiplier: 1.35, ending: '9' }), 53.9);
  assert.strictEqual(t.rewritePrice(39.9, { multiplier: 2, ending: '8' }), 79.8);
});

test('价格夹逼区间与非法输入', () => {
  assert.strictEqual(t.rewritePrice(39.9, { multiplier: 10, max: 100 }), 100);
  assert.strictEqual(t.rewritePrice(1, { multiplier: 0.5, min: 10 }), 10);
  assert.strictEqual(t.rewritePrice('¥39.90', {}), 39.9, '带货币符号也能解析');
  assert.strictEqual(t.rewritePrice(undefined, { multiplier: 2 }), 0);
  assert.strictEqual(t.rewritePrice('abc', {}), 0);
});

test('尾数处理不会把价格压到低于原价', () => {
  // 40.0 吸到 .9 尾数会变成 39.9，低于原价，应进一位到 40.9
  assert.strictEqual(t.rewritePrice(40, { ending: '9' }), 40.9);
});

test('SKU 价格整体改写，各规格差价结构保留', () => {
  const skus = [
    { propText: '颜色:白;尺码:M', price: 39.9, quantity: 10 },
    { propText: '颜色:白;尺码:L', price: 42.9, quantity: 5 },
  ];
  const out = t.rewriteSkuPrices(skus, { multiplier: 1.35 });
  assert.strictEqual(out[0].price, 53.87);
  assert.strictEqual(out[1].price, 57.92);
  assert.strictEqual(out[0].quantity, 10, '没传 quantity 就不改库存');
});

test('详情清洗：去脚本、去外链、去二维码图、协议补全', () => {
  const html = `
    <p><img src="//img.alicdn.com/a.jpg"/></p>
    <a href="https://other-shop.taobao.com">关注店铺</a>
    <img src="https://img.alicdn.com/qrcode-weixin.jpg"/>
    <div class="shop-header">店招</div>
    <img src="http://img.alicdn.com/b.jpg" onclick="track()"/>
    <script>alert(1)</script>
  `;
  const out = t.cleanDescription(html);
  assert.ok(!out.includes('<script'), '脚本必须删掉');
  assert.ok(!out.includes('<a '), '外链必须删掉（详情带外链会被审核打回）');
  assert.ok(!out.includes('qrcode'), '二维码图必须删掉');
  assert.ok(!out.includes('shop-header'), '店招必须删掉');
  assert.ok(out.includes('https://img.alicdn.com/a.jpg'), '// 协议要补成 https');
  assert.ok(out.includes('https://img.alicdn.com/b.jpg'), 'http 要升级 https');
  assert.ok(!out.includes('onclick'), '事件属性要清掉');
});

test('详情可插入自定义头尾', () => {
  const out = t.cleanDescription('<p>原详情</p>', {
    headerHtml: '<p>本店承诺7天无理由</p>',
    footerHtml: '<p>尺码表见下图</p>',
  });
  assert.ok(out.startsWith('<p>本店承诺7天无理由</p>'));
  assert.ok(out.endsWith('<p>尺码表见下图</p>'));
  assert.ok(out.includes('原详情'));
});

test('从详情抽出图片列表', () => {
  const imgs = t.extractDescImages(`<img src="//a.alicdn.com/1.jpg"><img src='https://b.alicdn.com/2.png'>`);
  assert.deepStrictEqual(imgs, ['https://a.alicdn.com/1.jpg', 'https://b.alicdn.com/2.png']);
});

test('去掉淘宝 CDN 尺寸后缀拿原图', () => {
  assert.strictEqual(
    t.toOriginalImage('//img.alicdn.com/i1/O1CN01abc.jpg_400x400.jpg'),
    'https://img.alicdn.com/i1/O1CN01abc.jpg'
  );
  assert.strictEqual(t.toOriginalImage('https://img.alicdn.com/a.png_.webp'), 'https://img.alicdn.com/a.png');
  assert.strictEqual(t.normalizeUrl('http://img.alicdn.com/a.jpg'), 'https://img.alicdn.com/a.jpg');
});

test('applyRules 一次跑完整套规则，且不修改入参', () => {
  const item = {
    title: '【SAMPLE旗舰店】纯棉T恤女夏季百搭上衣',
    price: 39.9,
    quantity: 10,
    images: ['//img.alicdn.com/a.jpg_400x400.jpg', '//img.alicdn.com/b.jpg'],
    props: { 品牌: 'SAMPLE', 材质: '棉' },
    description: '<p>详情</p><a href="x">关注</a>',
    skus: [{ propText: '颜色:白', price: 39.9, quantity: 10 }],
  };
  const before = JSON.stringify(item);
  const out = t.applyRules(item, {
    title: { removeBrands: true, removeWords: ['SAMPLE'], prefix: '现货' },
    price: { multiplier: 1.35 },
    quantity: 99,
    images: { original: true, maxCount: 5 },
    props: { set: { 品牌: '其他' } },
    description: { strip: true },
  });

  assert.strictEqual(JSON.stringify(item), before, '入参不能被改');
  assert.ok(out.title.startsWith('现货'));
  assert.ok(!out.title.includes('SAMPLE'));
  assert.strictEqual(out.price, 53.87);
  assert.strictEqual(out.quantity, 99);
  assert.strictEqual(out.skus[0].quantity, 99, '统一库存要同时作用到 SKU');
  assert.strictEqual(out.skus[0].price, 53.87);
  assert.strictEqual(out.props.品牌, '其他');
  assert.strictEqual(out.props.材质, '棉', '没指定的属性要保留');
  assert.strictEqual(out.images[0], 'https://img.alicdn.com/a.jpg');
  assert.ok(!out.description.includes('<a '));
  assert.ok(out.rulesAppliedAt);
});

test('applyRules 对空规则是幂等的', () => {
  const item = { title: 'T恤', price: 10, images: [], quantity: 1 };
  const out = t.applyRules(item, {});
  assert.strictEqual(out.title, 'T恤');
  assert.strictEqual(out.price, 10);
});

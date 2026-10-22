'use strict';

/** 解析：从保存的网页 / mtop JSON / CSV / 店铺页里提取商品数据 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const parser = require('../server/lib/parser');
const publish = require('../server/lib/publish');

const FIX = path.join(__dirname, '..', 'fixtures');
const itemHtml = fs.readFileSync(path.join(FIX, 'sample-item.html'), 'utf8');
const shopHtml = fs.readFileSync(path.join(FIX, 'sample-shop.html'), 'utf8');
const mtopJson = JSON.parse(fs.readFileSync(path.join(FIX, 'sample-mtop-detail.json'), 'utf8'));

test('商品页 HTML：标题、价格、类目、店铺、主图都取到', () => {
  const d = parser.parseItemHtml(itemHtml, { sourceUrl: 'https://item.taobao.com/item.htm?id=723456789012' });
  assert.strictEqual(d.title, '2026新款纯棉宽松短袖T恤女夏季ins潮百搭打底衫上衣');
  assert.strictEqual(d.price, 39.9);
  assert.strictEqual(d.originalPrice, 89);
  assert.strictEqual(d.sourceItemId, '723456789012');
  assert.strictEqual(d.categoryId, '50000671');
  assert.strictEqual(d.sourceShop.shopId, '111222333');
  assert.strictEqual(d.sourceShop.sellerId, '1234567');
  assert.strictEqual(d.sourceShop.title, '样例女装旗舰店');
  assert.ok(d.images.length >= 3, `主图应有 3 张，实际 ${d.images.length}`);
  assert.ok(d.images.every((u) => u.startsWith('https://')), '协议相对地址要补成 https');
  assert.strictEqual(d.collectedVia, 'html');
});

test('商品页 HTML：图片的 CDN 尺寸后缀不污染列表，且自动去重', () => {
  const d = parser.parseItemHtml(itemHtml);
  const set = new Set(d.images);
  assert.strictEqual(set.size, d.images.length, '主图不应重复');
});

test('商品页 HTML：详情图被抽出来', () => {
  const d = parser.parseItemHtml(itemHtml);
  assert.ok(d.description.length > 0, '应有详情内容');
  assert.ok(d.description.includes('alicdn'), '详情里应有图片');
});

test('商品页 HTML：缺 id 时从 URL 补，缺字段进 warnings 而不是猜', () => {
  const d = parser.parseItemHtml('<html><head><title>某个商品-淘宝网</title></head><body></body></html>');
  assert.ok(d.warnings.length > 0, '字段缺失必须显式告警');
  assert.ok(d.warnings.some((w) => w.includes('价格')));
  assert.ok(d.warnings.some((w) => w.includes('主图')));
  assert.ok(d.warnings.some((w) => w.includes('类目')));
});

test('超长标题会被标记出来（淘宝上限 60 字节）', () => {
  const long = '纯棉T恤'.repeat(20);
  const d = parser.parseItemJson({ title: long, price: 1, images: ['https://img.alicdn.com/a.jpg'], categoryId: '1' });
  assert.ok(d.warnings.some((w) => w.includes('60 字节')));
});

test('mtop 详情 JSON：启发式扫描取到标题价格店铺', () => {
  const d = parser.parseItemJson(mtopJson.data, { sourceUrl: 'https://item.taobao.com/item.htm?id=723456789012' });
  assert.strictEqual(d.sourceItemId, '723456789012');
  assert.strictEqual(d.price, 39.9);
  assert.strictEqual(d.originalPrice, 89);
  assert.strictEqual(d.sourceShop.shopId, '111222333');
  assert.strictEqual(d.sourceShop.title, '样例女装旗舰店');
  assert.strictEqual(d.images.length, 3);
});

test('mtop skuBase + skuCore 拼出完整 SKU（规格名 + 价格 + 库存）', () => {
  const skus = parser.normalizeSkuBase({ skuBase: mtopJson.data.skuBase, skuCore: mtopJson.data.skuCore });
  assert.strictEqual(skus.length, 4);
  const white = skus.find((s) => s.propText.includes('白色') && s.propText.includes('M'));
  assert.ok(white, '应能拼出「颜色分类:白色;尺码:M」');
  assert.strictEqual(white.price, 39.9);
  assert.strictEqual(white.quantity, 120);
  const blackL = skus.find((s) => s.propText.includes('黑色') && s.propText.includes('L'));
  assert.strictEqual(blackL.price, 45.9);
  assert.strictEqual(blackL.quantity, 0, '0 库存是合法值，不能当缺失');
  assert.strictEqual(skus.propImages.length, 1, '白色的属性图应被提取');
  assert.ok(skus.propImages[0].url.startsWith('https://'));
});

test('店铺页 HTML：认出全部宝贝链接、标题、价格、销量', () => {
  const list = parser.parseShopItems(shopHtml, { sourceShop: { url: 'https://shop111222333.taobao.com' } });
  assert.strictEqual(list.length, 3, `应认出 3 个宝贝，实际 ${list.length}`);
  const ids = list.map((x) => x.sourceItemId).sort();
  assert.deepStrictEqual(ids, ['700000000001', '700000000002', '700000000003']);
  const dress = list.find((x) => x.sourceItemId === '700000000001');
  assert.strictEqual(dress.title, '法式复古碎花连衣裙女2026夏季新款收腰显瘦长裙');
  assert.strictEqual(dress.price, 129);
  assert.ok(dress.images.length >= 1, '宝贝卡片图应被提取');
  assert.ok(dress.sourceUrl.startsWith('https://'));
});

test('店铺页 HTML：同一个宝贝出现多次只保留一条', () => {
  const dup = `<a href="//shop.taobao.com/item.htm?id=800000000001" title="A">A</a>
               <a href="//shop.taobao.com/item.htm?id=800000000001">A</a>`;
  const list = parser.parseShopItems(dup);
  assert.strictEqual(list.length, 1);
});

test('CSV 导入：中英表头都认，图片列按分隔符拆开', () => {
  const csv = `标题,价格,库存,主图,链接
纯棉T恤女,39.9,100,https://img.alicdn.com/a.jpg;https://img.alicdn.com/b.jpg,https://item.taobao.com/item.htm?id=900000000001
"带,逗号的标题",59.00,50,https://img.alicdn.com/c.jpg,https://item.taobao.com/item.htm?id=900000000002`;
  const items = parser.parseCsvItems(csv);
  assert.strictEqual(items.length, 2);
  assert.strictEqual(items[0].title, '纯棉T恤女');
  assert.strictEqual(items[0].price, 39.9);
  assert.strictEqual(items[0].quantity, 100);
  assert.strictEqual(items[0].images.length, 2);
  assert.strictEqual(items[0].sourceItemId, '900000000001');
  assert.strictEqual(items[1].title, '带,逗号的标题', '带引号的逗号字段要正确解析');
});

test('CSV 解析处理引号转义与 BOM', () => {
  const rows = parser.parseCsv('\uFEFFa,b\n"x""y",z\n');
  assert.deepStrictEqual(rows[0], ['a', 'b']);
  assert.deepStrictEqual(rows[1], ['x"y', 'z']);
});

test('括号配对切片能正确处理字符串里的括号与转义', () => {
  const text = 'prefix {"a":"}{"} x';
  const out = parser.sliceBalancedJson(text, 0);
  assert.strictEqual(out, '{"a":"}{"}');
});

test('非法输入报错而不是静默返回空', () => {
  assert.throws(() => parser.parseItemHtml(''), /内容为空/);
  assert.throws(() => parser.parseItemHtml('   '), /内容为空/);
});

/* ---------------- 发布参数拼装 ---------------- */

test('props 拼成 TOP 要的 pid:vid 串；有映射用映射，没映射保留名称', () => {
  const s = publish.buildPropsString({ 品牌: '其他', 材质: '棉' }, { 品牌: { pid: 20000, vid: 29535 } });
  assert.strictEqual(s, '20000:29535;材质:棉');
});

test('props 空值被跳过', () => {
  const s = publish.buildPropsString({ 品牌: '其他', 材质: '', 袖长: undefined });
  assert.strictEqual(s, '品牌:其他');
});

test('SKU 拼成 TOP 的 skus 参数（属性路径:价格:库存）', () => {
  const s = publish.buildSkusParam([
    { propPath: '1627207:28320;20509:28314', price: 39.9, quantity: 120 },
    { propPath: '1627207:28326;20509:28315', price: 42.9, quantity: 0 },
    { propPath: '', price: 10, quantity: 1 }, // 无效，应被跳过
  ]);
  assert.strictEqual(s, '1627207:28320;20509:28314:39.90:120,1627207:28326;20509:28315:42.90:0');
  assert.ok(s.includes('39.90'), '价格必须两位小数');
});

test('props_name 生成 SKU 别名串', () => {
  const s = publish.buildPropsName([
    { propPath: '1627207:28320;20509:28314', propText: '颜色分类:白色;尺码:M' },
    { propPath: '1627207:28326;20509:28315', propText: '颜色分类:黑色;尺码:L' },
  ]);
  assert.ok(s.includes('1627207:28320:白色'));
  assert.ok(s.includes('20509:28315:L'));
});

test('没有 cid 时发布直接报错，并说清该去哪查', async () => {
  await assert.rejects(
    () => publish.publishItem({ title: 'T', price: 1, images: ['https://img.alicdn.com/a.jpg'] }, {}),
    /类目/
  );
});

test('没有主图时发布报错', async () => {
  await assert.rejects(
    () => publish.publishItem({ title: 'T', price: 1, images: [], categoryId: '50000671' }, { skipPropCheck: true }),
    /主图/
  );
});

test('试运行模式不调用任何真实接口', async () => {
  const r = await publish.publishItem(
    {
      title: '试运行商品',
      price: 39.9,
      quantity: 10,
      images: ['https://img.alicdn.com/a.jpg'],
      categoryId: '50000671',
      description: '<p>x</p>',
      props: { 品牌: '其他' },
    },
    { dryRun: true, skipPropCheck: true }
  );
  assert.ok(r.steps.some((s) => s.name === 'taobao.item.add'));
  assert.ok(r.steps.every((s) => s.state === 'ok'));
  assert.strictEqual(r.itemParams.price, '39.90');
  assert.strictEqual(r.itemParams.cid, '50000671');
  assert.strictEqual(r.itemParams.pic_path, 'https://img.alicdn.com/a.jpg', '远程图走 pic_path');
  assert.strictEqual(r.itemParams.approve_status, 'instock', '默认存仓库，更安全');
});

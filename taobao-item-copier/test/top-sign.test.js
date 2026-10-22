'use strict';

/** TOP 签名：这块错了，所有接口都会返回 isv.invalid-signature */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { sign, baseString, buildParams, topTimestamp } = require('../server/lib/top-sign');

test('md5 签名 = MD5(secret + 排序拼接 + secret)，大写十六进制', () => {
  const params = {
    method: 'taobao.item.add',
    app_key: '12129701',
    timestamp: '2026-08-03 12:17:17',
    format: 'json',
    v: '2.0',
    sign_method: 'md5',
    session: '4803e414-a540-4b33-a6ff-c0a4d58f2703',
    title: '测试商品',
    price: '39.90',
  };
  const secret = 'testsecret';
  const base = baseString(params);

  // key 必须按字典序，且 key/value 直接相连、无分隔符
  assert.ok(base.startsWith('app_key12129701format'));
  assert.ok(base.includes('methodtaobao.item.add'));
  assert.ok(base.includes('pricetest') === false);
  assert.ok(base.includes('price39.90'));
  assert.ok(!base.includes('&'), '待签名串里不应有 & 分隔符');

  const expected = crypto
    .createHash('md5')
    .update(secret + base + secret, 'utf8')
    .digest('hex')
    .toUpperCase();
  assert.strictEqual(sign(params, secret, 'md5'), expected);
  assert.strictEqual(sign(params, secret, 'md5').length, 32);
});

test('签名忽略 sign 字段与空值参数', () => {
  const a = { method: 'm', app_key: 'k', empty: '', zero: '0', sign: 'OLD' };
  const b = { method: 'm', app_key: 'k', zero: '0' };
  assert.strictEqual(sign(a, 's'), sign(b, 's'));
  assert.ok(!baseString(a).includes('sign'));
  assert.ok(!baseString(a).includes('empty'));
  assert.ok(baseString(a).includes('zero0'), '值为 "0" 不是空值，必须参与签名');
});

test('hmac 签名 = HMAC-MD5(排序拼接, secret)', () => {
  const params = { method: 'taobao.time.get', app_key: 'k1' };
  const expected = crypto
    .createHmac('md5', 'sec')
    .update(baseString(params), 'utf8')
    .digest('hex')
    .toUpperCase();
  assert.strictEqual(sign(params, 'sec', 'hmac'), expected);
});

test('中文参数按 UTF-8 参与签名', () => {
  const s1 = sign({ title: '纯棉T恤' }, 'sec');
  const s2 = crypto
    .createHash('md5')
    .update('sec' + 'title纯棉T恤' + 'sec', 'utf8')
    .digest('hex')
    .toUpperCase();
  assert.strictEqual(s1, s2);
});

test('timestamp 是北京时间的 YYYY-MM-DD HH:mm:ss', () => {
  const ts = topTimestamp(new Date('2026-03-15T20:30:45.000Z'));
  // UTC 20:30:45 → 北京时间次日 04:30:45
  assert.strictEqual(ts, '2026-03-16 04:30:45');
  assert.match(ts, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
});

test('buildParams 序列化对象参数、带上公共参数', () => {
  const p = buildParams(
    'taobao.item.add',
    { title: 'T', props: { 品牌: '其他' }, num: 0, skip: undefined },
    { appKey: 'AK', session: 'SS' }
  );
  assert.strictEqual(p.method, 'taobao.item.add');
  assert.strictEqual(p.app_key, 'AK');
  assert.strictEqual(p.session, 'SS');
  assert.strictEqual(p.v, '2.0');
  assert.strictEqual(p.format, 'json');
  assert.strictEqual(p.sign_method, 'md5');
  assert.strictEqual(p.props, '{"品牌":"其他"}', '对象参数应 JSON 序列化');
  assert.ok(!('skip' in p), 'undefined 参数应被丢弃');
  assert.strictEqual(p.num, '0', '数字 0 是合法值，不能丢');
});

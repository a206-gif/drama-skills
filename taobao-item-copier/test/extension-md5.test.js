'use strict';

/**
 * 扩展里的 MD5 实现。
 *
 * 这是 mtop 签名的地基：sign = md5(token&t&appKey&data)。
 * 算错一位，所有店铺采集请求都会返回 FAIL_SYS_ILLEGAL_ACCESS，
 * 所以必须与 Node 内置 crypto 的结果逐字节一致，包括中文（UTF-8）输入。
 */

const test = require('node:test');
const assert = require('node:assert');
const crypto = require('node:crypto');
const { md5 } = require('../extension/md5.js');

const nodeMd5 = (s) => crypto.createHash('md5').update(s, 'utf8').digest('hex');

test('标准测试向量', () => {
  const vectors = {
    '': 'd41d8cd98f00b204e9800998ecf8427e',
    a: '0cc175b9c0f1b6a831c399e269772661',
    abc: '900150983cd24fb0d6963f7d28e17f72',
    'message digest': 'f96b697d7cb7938d525a2f31aaf161d0',
    abcdefghijklmnopqrstuvwxyz: 'c3fcd3d76192e4007dfb496cca67e13b',
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789':
      'd174ab98d277d9f5a5611c2c9f419d9f',
    '12345678901234567890123456789012345678901234567890123456789012345678901234567890':
      '57edf4a22be3c955ac49da2e2107b67a',
  };
  for (const [input, expected] of Object.entries(vectors)) {
    assert.strictEqual(md5(input), expected, `md5(${JSON.stringify(input)}) 应为 ${expected}`);
  }
});

test('与 Node crypto 在中文/混合输入上完全一致', () => {
  const inputs = [
    '纯棉T恤',
    '【旗舰店正品】2026新款纯棉宽松短袖T恤女夏季ins潮百搭打底衫上衣 包邮',
    '颜色分类:白色;尺码:M',
    'emoji 🎉🔥 测试',
    'a'.repeat(55), // 55/56/64 字节是 MD5 补位的边界
    'a'.repeat(56),
    'a'.repeat(64),
    'a'.repeat(119),
    'a'.repeat(120),
    '日本語テキスト',
    '{"m":"shopitemsearch","shopId":"111222333","page":"0"}',
  ];
  for (const s of inputs) {
    assert.strictEqual(md5(s), nodeMd5(s), `输入不一致：${JSON.stringify(s.slice(0, 40))}`);
  }
});

test('mtop 签名公式：md5(token&t&appKey&data)', () => {
  const token = 'dbb3e62583ef93a0c74b21c19106d54c';
  const t = '1729420800000';
  const appKey = '12574478';
  const data = '{"m":"shopitemsearch","shopId":"111222333","sellerId":"1234567","page":"0","pageSize":"40"}';
  const sign = md5(`${token}&${t}&${appKey}&${data}`);
  assert.strictEqual(sign, nodeMd5(`${token}&${t}&${appKey}&${data}`));
  assert.match(sign, /^[0-9a-f]{32}$/);
  // data 里任何一个字符变了，签名必须完全不同
  assert.notStrictEqual(sign, md5(`${token}&${t}&${appKey}&${data.replace('0', '1')}`));
});

test('token 为空时也能算出确定签名（首次请求的场景）', () => {
  const s1 = md5(`&1729420800000&12574478&{}`);
  const s2 = md5(`&1729420800000&12574478&{}`);
  assert.strictEqual(s1, s2);
  assert.strictEqual(s1, nodeMd5('&1729420800000&12574478&{}'));
});

test('随机长输入与 Node crypto 一致（模糊测试）', () => {
  for (let i = 0; i < 200; i++) {
    const len = Math.floor(Math.random() * 300);
    let s = '';
    for (let j = 0; j < len; j++) {
      // 混入多字节字符，覆盖 UTF-8 编码路径
      s += Math.random() < 0.3 ? String.fromCharCode(0x4e00 + Math.floor(Math.random() * 2000)) : String.fromCharCode(32 + Math.floor(Math.random() * 90));
    }
    assert.strictEqual(md5(s), nodeMd5(s), `长度 ${len} 的随机输入不一致`);
  }
});

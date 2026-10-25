'use strict';

/**
 * 导出素材包的 zip 编码器。
 *
 * 手写 zip 最容易错的就是 CRC32 和中央目录偏移量 —— 错一个字节，
 * 解压工具就报「文件损坏」，而用户看到的是几百张图白下载了。
 */

const test = require('node:test');
const assert = require('node:assert');
const zlib = require('node:zlib');
const { buildZip, crc32 } = require('../server/routes/exports');

/** 按 zip 规范把条目读回来，验证编码器而不是验证我的假设 */
function readZip(zip) {
  // 从尾部找 EOCD 签名
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0; i--) {
    if (zip.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  assert.ok(eocd >= 0, '找不到 EOCD 签名');

  const count = zip.readUInt16LE(eocd + 10);
  const cdSize = zip.readUInt32LE(eocd + 12);
  const cdOffset = zip.readUInt32LE(eocd + 16);
  assert.strictEqual(eocd + 22, zip.length, 'EOCD 之后不应有多余字节（无注释时）');
  assert.strictEqual(cdOffset + cdSize, eocd, '中央目录必须紧接在数据区之后、EOCD 之前');

  const entries = [];
  let p = cdOffset;
  for (let n = 0; n < count; n++) {
    assert.strictEqual(zip.readUInt32LE(p), 0x02014b50, `第 ${n} 条中央目录签名不对`);
    const method = zip.readUInt16LE(p + 10);
    const crc = zip.readUInt32LE(p + 16);
    const compSize = zip.readUInt32LE(p + 20);
    const uncompSize = zip.readUInt32LE(p + 24);
    const nameLen = zip.readUInt16LE(p + 28);
    const extraLen = zip.readUInt16LE(p + 30);
    const commentLen = zip.readUInt16LE(p + 32);
    const localOffset = zip.readUInt32LE(p + 42);
    const name = zip.slice(p + 46, p + 46 + nameLen).toString('utf8');

    // 顺着偏移回到本地头，取出真实内容
    assert.strictEqual(zip.readUInt32LE(localOffset), 0x04034b50, `第 ${n} 条本地头签名不对`);
    assert.strictEqual(zip.readUInt32LE(localOffset + 14), crc, `第 ${n} 条本地头 CRC 与中央目录不一致`);
    assert.strictEqual(zip.readUInt16LE(localOffset + 26), nameLen, `第 ${n} 条文件名长度不一致`);
    const lExtraLen = zip.readUInt16LE(localOffset + 28);
    const bodyStart = localOffset + 30 + nameLen + lExtraLen;
    const raw = zip.slice(bodyStart, bodyStart + compSize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);

    assert.strictEqual(data.length, uncompSize, `第 ${n} 条解压后长度不符`);
    assert.strictEqual(crc32(data), crc, `第 ${n} 条 CRC 校验失败`);
    entries.push({ name, method, data, compSize });

    p += 46 + nameLen + extraLen + commentLen;
  }
  assert.strictEqual(p, eocd, '中央目录遍历完必须正好落在 EOCD 上');
  return entries;
}

test('crc32 标准校验值', () => {
  assert.strictEqual(crc32(Buffer.from('')), 0);
  assert.strictEqual(crc32(Buffer.from('123456789')), 0xcbf43926, 'CRC-32/ISO-HDLC 的标准 check 值');
  assert.strictEqual(crc32(Buffer.from('a')), 0xe8b7be43);
  assert.strictEqual(crc32(Buffer.from('abc')), 0x352441c2);
  // 以下两个期望值由 Python zlib.crc32 独立算出，交叉验证过
  assert.strictEqual(crc32(Buffer.from('淘宝商品搬运台', 'utf8')), 0xf1fcf327, 'UTF-8 中文的 CRC');
  const seq = Buffer.from(Array.from({ length: 256 }, (_, i) => i));
  assert.strictEqual(crc32(seq), 0x29058c73, '逐字节递增的 256 字节输入，覆盖整张 CRC 查表路径');
  assert.notStrictEqual(crc32(seq), crc32(seq.subarray(0, 255)), '长度变化必须改变 CRC');
});

test('多条目 zip 可被完整解出，内容与偏移全部自洽', () => {
  const files = [
    { name: 'a.txt', data: Buffer.from('hello', 'utf8') },
    { name: 'dir/b.json', data: Buffer.from('{"x":1}', 'utf8') },
    { name: '商品总表.csv', data: Buffer.from('\uFEFF标题,价格\n纯棉T恤,39.9', 'utf8') },
    { name: 'images/001/1.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x01, 0xfe, 0xd9]) },
  ];
  const entries = readZip(buildZip(files));
  assert.strictEqual(entries.length, files.length);
  files.forEach((f, i) => {
    assert.strictEqual(entries[i].name, f.name, '条目顺序应与传入顺序一致');
    assert.deepStrictEqual(entries[i].data, f.data, `${f.name} 内容不一致`);
  });
});

test('中文文件名置了 UTF-8 标志位（否则 Windows 解压乱码）', () => {
  const zip = buildZip([{ name: '商品总表.csv', data: Buffer.from('x', 'utf8') }]);
  assert.strictEqual(zip.readUInt16LE(6) & 0x0800, 0x0800, '本地头必须置 UTF-8 标志位');
  const nameLen = zip.readUInt16LE(26);
  assert.strictEqual(zip.slice(30, 30 + nameLen).toString('utf8'), '商品总表.csv');
});

test('已压缩格式走 stored，文本走 deflate', () => {
  const jpg = buildZip([{ name: 'images/001/1.jpg', data: Buffer.from([0xff, 0xd8, 0xff, 0xd9]) }]);
  assert.strictEqual(jpg.readUInt16LE(8), 0, 'jpg 应走 stored：再 deflate 只会变大');

  const text = Buffer.from(JSON.stringify({ title: '纯棉T恤'.repeat(200) }), 'utf8');
  const json = buildZip([{ name: 'items/001.json', data: text }]);
  assert.strictEqual(json.readUInt16LE(8), 8, 'json 应走 deflate');
  assert.ok(json.readUInt32LE(18) < text.length, '压缩后应更小');
  assert.strictEqual(json.readUInt32LE(22), text.length, '未压缩大小要记录原长度');
});

test('空文件列表产出合法的 22 字节空 zip', () => {
  const zip = buildZip([]);
  assert.strictEqual(zip.length, 22);
  assert.strictEqual(zip.readUInt32LE(0), 0x06054b50);
  assert.strictEqual(zip.readUInt16LE(8), 0);
  assert.deepStrictEqual(readZip(zip), []);
});

test('大文件（>64KB）的偏移与长度不回绕', () => {
  const big = Buffer.alloc(200_000);
  for (let i = 0; i < big.length; i++) big[i] = i % 251; // 伪随机但可复现，deflate 压不动
  const entries = readZip(buildZip([
    { name: 'small.txt', data: Buffer.from('first', 'utf8') },
    { name: 'big.bin', data: big },
    { name: 'after.txt', data: Buffer.from('last', 'utf8') },
  ]));
  assert.strictEqual(entries.length, 3);
  assert.deepStrictEqual(entries[1].data, big);
  assert.strictEqual(entries[2].data.toString('utf8'), 'last', '大文件之后条目的偏移必须仍然正确');
});

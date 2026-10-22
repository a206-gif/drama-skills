'use strict';

/**
 * 导出上架素材包。
 *
 * 就算 API 权限还没批下来，采集 + 清洗这一段的价值也要能落地：
 * 导出一个 zip（商品 JSON + 按序号命名好的图片文件夹 + CSV 表格），
 * 你可以用千牛「批量上传」或淘宝助理导入，图片也能直接拖进发布页。
 *
 * 这里手写了一个「仅存储（stored）」的最小 zip 编码器 —— 图片本身已是压缩格式，
 * 再 deflate 收益很小，省掉一个依赖。
 */

const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const store = require('../lib/store');
const images = require('../lib/images');

const router = express.Router();

/** POST /api/export/package  body: { ids, all, includeImages } */
router.post('/package', (req, res) => {
  const { ids = [], all: exportAll = false, includeImages = true } = req.body || {};
  const list = (exportAll ? store.all() : ids.map((id) => store.get(id)).filter(Boolean)).filter(Boolean);
  if (!list.length) return res.status(400).json({ ok: false, error: '没有选中商品' });

  const files = []; // { name, data(Buffer) }
  const stamp = new Date().toISOString().slice(0, 10);

  // 1) 每个商品一份 JSON（保留完整结构，可再导回）
  list.forEach((it, i) => {
    const idx = String(i + 1).padStart(3, '0');
    const safeTitle = String(it.title || it.sourceItemId || 'item').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 40);
    const copy = { ...it };
    delete copy.raw;
    files.push({ name: `items/${idx}-${safeTitle}.json`, data: Buffer.from(JSON.stringify(copy, null, 2), 'utf8') });
  });

  // 2) 一张总表 CSV（UTF-8 BOM，Excel 直接打开不乱码）
  const header = ['序号', '标题', '一口价', '库存', '类目ID', '主图数', 'SKU数', '原商品ID', '原链接', '来源店铺', '状态', '本地图片目录'];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = [header.join(',')];
  list.forEach((it, i) => {
    const idx = String(i + 1).padStart(3, '0');
    const dir = includeImages ? `images/${idx}` : '';
    lines.push(
      [i + 1, it.title, it.price, it.quantity, it.categoryId, (it.images || []).length, (it.skus || []).length,
        it.sourceItemId, it.sourceUrl, it.sourceShop?.title || '', it.status, dir].map(esc).join(',')
    );
  });
  files.push({ name: '商品总表.csv', data: Buffer.from('\uFEFF' + lines.join('\r\n'), 'utf8') });

  // 3) 图片：按商品分目录、按主图顺序命名（1.jpg 是封面，直接拖进发布页就是对的顺序）
  if (includeImages) {
    list.forEach((it, i) => {
      const idx = String(i + 1).padStart(3, '0');
      const local = (it.images || []).filter((u) => String(u).startsWith('/media/'));
      local.forEach((u, j) => {
        try {
          const f = images.readFileForUpload(u);
          const ext = path.extname(f.filename) || '.jpg';
          files.push({ name: `images/${idx}/${j + 1}${ext}`, data: f.content });
        } catch {
          /* 本地没这张图（还没下载），跳过，不阻断整包导出 */
        }
      });
      (it.propImages || []).forEach((p, j) => {
        if (!String(p.url || '').startsWith('/media/')) return;
        try {
          const f = images.readFileForUpload(p.url);
          const ext = path.extname(f.filename) || '.jpg';
          const safe = String(p.propText || j).replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 30);
          files.push({ name: `images/${idx}/prop-${safe}${ext}`, data: f.content });
        } catch {}
      });
    });
  }

  // 4) 一份详情 HTML，方便直接复制粘贴进发布页的详情编辑器
  list.forEach((it, i) => {
    if (!it.description) return;
    const idx = String(i + 1).padStart(3, '0');
    files.push({ name: `desc/${idx}.html`, data: Buffer.from(it.description, 'utf8') });
  });

  files.push({
    name: 'README.txt',
    data: Buffer.from(
      [
        `淘宝商品搬运台 —— 上架素材包`,
        `导出时间：${new Date().toLocaleString('zh-CN')}`,
        `商品数：${list.length}`,
        '',
        'items/    每个商品一份 JSON（可重新导入本工具）',
        'images/   按商品分目录，1.jpg 为主图封面，顺序即主图顺序',
        'desc/     商品详情 HTML，可直接粘贴进发布页的详情编辑器',
        '商品总表.csv  UTF-8 BOM，Excel 可直接打开',
        '',
        '提醒：图片与文案可能受原作者著作权保护，请确认你有权使用后再上架。',
      ].join('\n'),
      'utf8'
    ),
  });

  const zip = buildZip(files);
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="taobao-items-${stamp}.zip"`);
  res.send(zip);
});

/* ---------------- 最小 zip 编码器 ---------------- */

function buildZip(entries) {
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = e.data;
    const crc = crc32(data);
    // 已压缩格式（jpg/png/zip）用 stored，文本用 deflate
    const compressible = /\.(json|csv|html|txt|xml)$/i.test(e.name);
    const deflated = compressible ? zlib.deflateRawSync(data) : null;
    const useDeflate = deflated && deflated.length < data.length;
    const payload = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const dosTime = toDosTime(new Date());

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // flags: UTF-8 文件名
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(dosTime.time, 10);
    local.writeUInt16LE(dosTime.date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);

    chunks.push(local, nameBuf, payload);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(dosTime.time, 12);
    cd.writeUInt16LE(dosTime.date, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(payload.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(0, 38); // external attrs
    cd.writeUInt32LE(offset, 42);
    central.push(Buffer.concat([cd, nameBuf]));

    offset += local.length + nameBuf.length + payload.length;
  }

  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...chunks, centralBuf, end]);
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0 ^ -1;
  for (let i = 0; i < buf.length; i++) c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
  return (c ^ -1) >>> 0;
}

function toDosTime(d) {
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | (Math.floor(d.getSeconds() / 2)),
    date: (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()),
  };
}

/** GET /api/export/images  图片库列表 */
router.get('/images', (req, res) => {
  res.json({ ok: true, images: images.listLocalImages(Number(req.query.limit || 500)), dir: images.IMG_DIR });
});

module.exports = router;
module.exports.buildZip = buildZip;
module.exports.crc32 = crc32;

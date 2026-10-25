'use strict';

/**
 * 淘宝店铺图片提取器 —— 本地服务入口
 *
 * 架构上刻意做成「本地单机」：
 *   采集端  浏览器扩展（带你的淘宝登录态，在你自己的浏览器里扫店铺、打开商品链接提图）
 *              ↓ HTTP POST 到 127.0.0.1
 *   本地服务  商品链接库 / 图片下载落地（按内容 MD5 去重）/ ZIP 打包导出
 *              ↓
 *   你        在控制台画廊里浏览、勾选、下载图片
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const express = require('express');

const store = require('./lib/store');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');

function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    if (m[1] in process.env) continue; // 真环境变量优先
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
// 默认只听 127.0.0.1。扩展和网页都在你本机，没有必要对外暴露 —— 里面存着 appsecret 和 session。
const HOST = process.env.HOST || '127.0.0.1';

fs.mkdirSync(path.join(DATA_DIR, 'images'), { recursive: true });
store.init();

const app = express();

// 扩展回传的整店采集结果可能很大（几百个宝贝 + 详情 HTML），放宽到 200MB
app.use(express.json({ limit: '200mb' }));
app.use(express.urlencoded({ extended: true, limit: '200mb' }));
app.use(express.raw({ type: ['application/octet-stream', 'image/*'], limit: '100mb' }));

// CORS：扩展的 service worker 与 localhost 页面都要能访问
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Collector-Token, X-Shop-Url, X-Page-Url, X-Collector-Kind'
  );
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api/ingest', require('./routes/ingest'));
app.use('/api/items', require('./routes/items'));
app.use('/api/shops', require('./routes/shops'));
app.use('/api/export', require('./routes/exports'));

app.get('/api/health', (req, res) => {
  const items = store.all();
  res.json({
    ok: true,
    version: '2.0.0',
    time: new Date().toISOString(),
    items: items.length,
    images: items.reduce((n, it) => n + (it.images || []).length + (it.descImages || []).length, 0),
    localized: items.filter((it) => it.imagesLocalized).length,
  });
});

app.use(express.static(path.join(ROOT, 'public')));
app.use('/media', express.static(path.join(DATA_DIR, 'images')));

// 404 → 交给前端单页
app.use((req, res) => {
  if (req.path.startsWith('/api/')) return res.status(404).json({ ok: false, error: 'not found' });
  res.sendFile(path.join(ROOT, 'public', 'index.html'));
});

app.use((err, req, res, _next) => {
  console.error('[error]', err);
  res.status(500).json({ ok: false, error: err.message || String(err) });
});

const server = http.createServer(app);

// 只有直接运行时才监听端口。被测试 require 时只导出 app，
// 否则会抢占 8787 端口、让测试进程一直挂着不退出。
if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  淘宝店铺图片提取器 已启动');
    console.log(`  控制台     http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
    console.log(`  采集回传   http://127.0.0.1:${PORT}/api/ingest/item`);
    console.log(`  数据目录   ${DATA_DIR}`);
    console.log('');
  });
}

module.exports = { app, server, PORT, HOST };

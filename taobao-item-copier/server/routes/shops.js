'use strict';

/**
 * 店铺采集编排。
 *
 * 真正的抓取动作发生在浏览器扩展里（要你的登录态和 mtop 签名能力），
 * 本地服务这边只做三件事：给扩展下发采集指令、接收结果、维护店铺列表。
 * 指令走 SSE 长连接推给扩展，扩展在自己的轮询里取任务。
 */

const express = require('express');
const store = require('../lib/store');
const ingest = require('./ingest');

const router = express.Router();

/** 采集任务的实际队列在 ingest 路由里（扩展通过心跳领取），这里只保留进度流 */
const pendingCount = () => ingest.jobs.queue.length;

router.get('/', (req, res) => {
  res.json({ ok: true, shops: store.listShops(), pending: pendingCount() });
});

/** 前端点「采集整店」→ 投一个 job 进队列，等扩展心跳来领 */
router.post('/collect', (req, res) => {
  const { shopUrl, maxPages = 20, pageSize = 40, mode = 'auto', depth = 'list' } = req.body || {};
  if (!shopUrl) return res.status(400).json({ ok: false, error: '缺少店铺链接' });

  const job = {
    id: store.uid('job'),
    kind: 'collect-shop',
    shopUrl: String(shopUrl).trim(),
    maxPages: Number(maxPages),
    pageSize: Number(pageSize),
    mode, // auto | mtop | dom
    depth, // list=只拿列表(快) / detail=每个宝贝再进详情页(慢但字段全)
    createdAt: new Date().toISOString(),
    state: 'waiting',
  };
  ingest.jobs.pushJob(job);

  res.json({
    ok: true,
    job,
    hint: '任务已排队。请确保：① 本地服务在跑 ② 浏览器扩展已启用并连上（顶栏「扩展在线」）③ 淘宝处于登录状态。',
  });
});

/** 扩展也可以主动来要任务（长轮询，最多挂 25 秒） */
router.get('/next-job', (req, res) => {
  const job = ingest.jobs.takeJob();
  if (job) return res.json({ ok: true, job });
  const timer = setTimeout(() => res.json({ ok: true, job: null }), 25000);
  req.on('close', () => clearTimeout(timer));
});

/** 扩展上报进度（前端通过 SSE 看） */
router.post('/progress', (req, res) => {
  const { jobId, message, page, found, state } = req.body || {};
  const evt = { at: new Date().toISOString(), jobId, message, page, found, state };
  progressBus.push(evt);
  if (progressBus.length > 500) progressBus.shift();
  progressListeners.forEach((l) => l(evt));
  res.json({ ok: true });
});

const progressBus = [];
const progressListeners = new Set();

router.get('/progress-stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();
  const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  progressBus.slice(-20).forEach(send);
  progressListeners.add(send);
  req.on('close', () => progressListeners.delete(send));
});

router.delete('/:jobId', (req, res) => {
  const q = ingest.jobs.queue;
  const i = q.findIndex((j) => j.id === req.params.jobId);
  if (i >= 0) q.splice(i, 1);
  res.json({ ok: true, removed: i >= 0 });
});

module.exports = router;
module.exports.progressListeners = progressListeners;

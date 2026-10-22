'use strict';

/** 任务：批量发布 / 批量下图，含 SSE 实时日志 */

const express = require('express');
const store = require('../lib/store');
const tasks = require('../lib/tasks');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ ok: true, tasks: store.listTasks() });
});

router.get('/:id', (req, res) => {
  const t = store.getTask(req.params.id);
  if (!t) return res.status(404).json({ ok: false, error: '任务不存在' });
  res.json({ ok: true, task: t });
});

/** 发起批量发布。body: { itemIds, options, propMaps } */
router.post('/publish', (req, res) => {
  const { itemIds = [], options = {}, propMaps = {} } = req.body || {};
  if (!itemIds.length) return res.status(400).json({ ok: false, error: '没有选中商品' });
  const s = store.getSettings();
  if (!options.dryRun && (!s.appKey || !s.appSecret)) {
    return res.status(400).json({
      ok: false,
      error: '还没配置开放平台 appkey/appsecret，无法真正发布。可以先用「试运行」检查参数，或去「设置」页填凭据。',
    });
  }
  if (!options.dryRun && !s.session) {
    return res.status(400).json({ ok: false, error: '还没有店铺授权（session）。去「设置」页授权，或用「试运行」先检查参数。' });
  }
  const task = tasks.startPublishTask({ itemIds, options, propMaps });
  res.json({ ok: true, task });
});

/** 发起批量下图 */
router.post('/localize-images', (req, res) => {
  const { itemIds = [], options = {} } = req.body || {};
  if (!itemIds.length) return res.status(400).json({ ok: false, error: '没有选中商品' });
  const task = tasks.startLocalizeTask({ itemIds, options });
  res.json({ ok: true, task });
});

router.post('/:id/cancel', (req, res) => {
  res.json({ ok: tasks.cancel(req.params.id) });
});

/** SSE：实时看任务日志 */
router.get('/:id/stream', (req, res) => {
  const id = req.params.id;
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const send = (evt) => res.write(`data: ${JSON.stringify(evt)}\n\n`);
  const listener = (evt) => send(evt);

  // 先把已有日志补上，前端不用额外拉一次
  const t = store.getTask(id);
  if (t) {
    send({ type: 'snapshot', task: { ...t, logs: t.logs.slice(-100) } });
  }
  tasks.bus.on(`task:${id}`, listener);

  const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(heartbeat);
    tasks.bus.off(`task:${id}`, listener);
  });
});

module.exports = router;

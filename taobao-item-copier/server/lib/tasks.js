'use strict';

/**
 * 任务队列。
 *
 * 批量发布几十上百个商品是长任务，必须：
 *   - 串行执行（淘宝限流，并发发布反而更容易被拒）
 *   - 每一步写日志，前端用 SSE 实时看
 *   - 可取消
 *   - 失败的单条不影响后面，最后汇总一份失败报告
 */

const { EventEmitter } = require('node:events');
const store = require('./store');
const publish = require('./publish');

const bus = new EventEmitter();
bus.setMaxListeners(0);

const running = new Map(); // taskId -> { cancelled: boolean }

function emit(taskId, event) {
  bus.emit(`task:${taskId}`, event);
  bus.emit('task:*', { taskId, ...event });
}

/** 批量发布 */
function startPublishTask({ itemIds, options = {}, propMaps = {} }) {
  const task = store.createTask({
    kind: 'publish',
    title: `发布 ${itemIds.length} 个商品`,
    total: itemIds.length,
    done: 0,
    succeeded: 0,
    failed: 0,
    itemIds,
    options,
    state: 'pending',
    logs: [],
    results: [],
  });

  const ctx = { cancelled: false };
  running.set(task.id, ctx);

  // 不阻塞 HTTP 响应
  setImmediate(() => run(task.id, itemIds, options, propMaps, ctx).catch((e) => {
    store.patchTask(task.id, { state: 'failed' });
    store.logTask(task.id, 'error', `任务异常终止：${e.message}`);
    emit(task.id, { type: 'task', state: 'failed', error: e.message });
  }));

  return task;
}

async function run(taskId, itemIds, options, propMaps, ctx) {
  store.patchTask(taskId, { state: 'running', startedAt: new Date().toISOString() });
  emit(taskId, { type: 'task', state: 'running' });

  for (let i = 0; i < itemIds.length; i++) {
    if (ctx.cancelled) {
      store.logTask(taskId, 'warn', '已取消，剩余商品未处理');
      break;
    }
    const id = itemIds[i];
    const item = store.get(id);
    if (!item) {
      store.logTask(taskId, 'warn', `跳过：商品 ${id} 不存在`);
      continue;
    }

    store.patch(id, { status: 'publishing' });
    store.logTask(taskId, 'info', `[${i + 1}/${itemIds.length}] 开始发布：${item.title}`);
    emit(taskId, { type: 'log', index: i, itemId: id, title: item.title, state: 'running' });

    try {
      const r = await publish.publishItem(item, {
        ...options,
        propMap: propMaps[id] || propMaps['*'] || {},
        onStep: (step) => {
          store.logTask(taskId, step.state === 'error' ? 'error' : 'debug', `  · ${step.name} ${step.state}${step.error ? ` — ${step.error}` : ''}${step.hint ? `（${step.hint}）` : ''}`);
          emit(taskId, { type: 'step', itemId: id, ...step });
        },
      });

      const patch = {
        status: 'published',
        publishedItemId: r.numIid || null,
        publishError: null,
        publishedAt: new Date().toISOString(),
        publishSteps: r.steps,
      };
      if (options.approveStatus === 'instock' && !options.listNow) patch.status = 'ready-in-stock';
      store.patch(id, patch);

      const t = store.getTask(taskId);
      store.patchTask(taskId, { done: t.done + 1, succeeded: t.succeeded + 1 });
      store.logTask(taskId, 'info', `  ✓ 成功，num_iid=${r.numIid || '(dry-run)'}`);
      store.getTask(taskId).results.push({ itemId: id, ok: true, numIid: r.numIid });
      store.saveNow();
      emit(taskId, { type: 'item-done', itemId: id, ok: true, numIid: r.numIid });
    } catch (e) {
      store.patch(id, { status: 'failed', publishError: e.message, publishHint: e.hint || '' });
      const t = store.getTask(taskId);
      store.patchTask(taskId, { done: t.done + 1, failed: t.failed + 1 });
      store.logTask(taskId, 'error', `  ✗ 失败：${e.message}${e.hint ? `\n    提示：${e.hint}` : ''}`);
      store.getTask(taskId).results.push({ itemId: id, ok: false, error: e.message, hint: e.hint || '' });
      store.saveNow();
      emit(taskId, { type: 'item-done', itemId: id, ok: false, error: e.message });
      if (options.stopOnError) {
        store.logTask(taskId, 'warn', '设置了「遇错即停」，任务中止');
        ctx.cancelled = true;
      }
    }

    // 商品之间的间隔，比步骤间隔更长，进一步降低限流概率
    const gap = options.itemDelayMs ?? 1500;
    if (gap && i < itemIds.length - 1) await sleep(gap, ctx);
  }

  const t = store.getTask(taskId);
  const state = ctx.cancelled ? 'cancelled' : t.failed && !t.succeeded ? 'failed' : 'done';
  store.patchTask(taskId, { state, finishedAt: new Date().toISOString() });
  store.logTask(taskId, 'info', `任务结束：成功 ${t.succeeded}，失败 ${t.failed}`);
  emit(taskId, { type: 'task', state, succeeded: t.succeeded, failed: t.failed });
  running.delete(taskId);
}

function sleep(ms, ctx) {
  return new Promise((resolve) => {
    const step = 200;
    let waited = 0;
    const timer = setInterval(() => {
      waited += step;
      if ((ctx && ctx.cancelled) || waited >= ms) {
        clearInterval(timer);
        resolve();
      }
    }, step);
  });
}

function cancel(taskId) {
  const ctx = running.get(taskId);
  if (!ctx) return false;
  ctx.cancelled = true;
  store.logTask(taskId, 'warn', '收到取消请求，当前商品处理完后停止');
  return true;
}

/** 批量下载图片任务（把远程图落地到本地图片库） */
function startLocalizeTask({ itemIds, options = {} }) {
  const images = require('./images');
  const task = store.createTask({
    kind: 'localize-images',
    title: `下载 ${itemIds.length} 个商品的图片到本地`,
    total: itemIds.length,
    done: 0,
    succeeded: 0,
    failed: 0,
    state: 'pending',
    logs: [],
    results: [],
  });
  const ctx = { cancelled: false };
  running.set(task.id, ctx);

  setImmediate(async () => {
    store.patchTask(task.id, { state: 'running' });
    for (let i = 0; i < itemIds.length; i++) {
      if (ctx.cancelled) break;
      const item = store.get(itemIds[i]);
      if (!item) continue;
      try {
        const r = await images.localizeItemImages(item, { concurrency: options.concurrency || 3 });
        store.patch(item.id, {
          images: r.images,
          propImages: r.propImages,
          descImages: r.descImages,
          description: r.description,
          imagesLocalized: true,
        });
        const t = store.getTask(task.id);
        store.patchTask(task.id, { done: t.done + 1, succeeded: t.succeeded + (r.report.failed.length ? 0 : 1), failed: t.failed + (r.report.failed.length ? 1 : 0) });
        store.logTask(task.id, r.report.failed.length ? 'warn' : 'info',
          `[${i + 1}/${itemIds.length}] ${item.title.slice(0, 24)}… 成功 ${r.report.ok.length} 张，失败 ${r.report.failed.length} 张`);
        store.getTask(task.id).results.push({ itemId: item.id, ok: !r.report.failed.length, report: r.report });
        emit(task.id, { type: 'item-done', itemId: item.id, ok: !r.report.failed.length });
      } catch (e) {
        const t = store.getTask(task.id);
        store.patchTask(task.id, { done: t.done + 1, failed: t.failed + 1 });
        store.logTask(task.id, 'error', `[${i + 1}/${itemIds.length}] 失败：${e.message}`);
      }
      store.saveNow();
      if (i < itemIds.length - 1) await sleep(options.itemDelayMs ?? 500, ctx);
    }
    store.patchTask(task.id, { state: ctx.cancelled ? 'cancelled' : 'done', finishedAt: new Date().toISOString() });
    emit(task.id, { type: 'task', state: 'done' });
    running.delete(task.id);
  });

  return task;
}

module.exports = { bus, startPublishTask, startLocalizeTask, cancel, running };

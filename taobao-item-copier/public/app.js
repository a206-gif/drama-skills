'use strict';

/* 淘宝商品搬运台 —— 前端逻辑（原生 JS，无构建步骤） */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const state = {
  page: 1,
  size: 50,
  total: 0,
  items: [],
  shops: [],
  selected: new Set(),
  counts: {},
  settings: null,
  currentTaskId: null,
  taskStream: null,
  catStack: [], // [{cid, name}]
  currentItem: null,
};

/* ------------------------------ 基础请求 ------------------------------ */

async function api(path, opts = {}) {
  const init = { headers: {}, ...opts };
  if (init.body && typeof init.body === 'object' && !(init.body instanceof FormData) && !(init.body instanceof Blob)) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(init.body);
  }
  const res = await fetch(path, init);
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { ok: false, error: text.slice(0, 300) }; }
  if (!res.ok || data.ok === false) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.hint = data.hint || '';
    throw err;
  }
  return data;
}

let toastTimer = null;
function toast(msg, kind = '') {
  const el = $('#toast');
  el.textContent = msg;
  el.className = `toast show ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), kind === 'err' ? 7000 : 3200);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------ 标签页 ------------------------------ */

$('#tabs').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-tab]');
  if (!btn) return;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b === btn));
  $$('.tab').forEach((s) => s.classList.toggle('active', s.id === `tab-${btn.dataset.tab}`));
  if (btn.dataset.tab === 'tasks') loadTasks();
  if (btn.dataset.tab === 'categories') loadCategories(0);
  if (btn.dataset.tab === 'settings') loadSettings();
  if (btn.dataset.tab === 'collect') loadShops();
});

/* ------------------------------ 顶栏状态 ------------------------------ */

async function refreshHealth() {
  try {
    const h = await api('/api/health');
    $('#pill-count').textContent = `商品 ${h.items}`;
    const p = $('#pill-top');
    if (h.top.configured && h.top.authorized) { p.textContent = `凭据 ✓ ${h.top.nick || ''}`.trim(); p.className = 'pill ok'; }
    else if (h.top.configured) { p.textContent = '凭据 ✓ / 未授权'; p.className = 'pill warn'; }
    else { p.textContent = '凭据未配置'; p.className = 'pill err'; }
  } catch {
    $('#pill-count').textContent = '服务未连接';
    $('#pill-top').className = 'pill err';
  }
}

/** 扩展是否在线：靠 /api/ingest/ping 判断不了扩展，这里用一个轻量心跳表 */
async function refreshExtensionState() {
  try {
    const r = await fetch('/api/settings', { method: 'GET' });
    const d = await r.json();
    const online = !!(d.settings && d.settings.collectorToken);
    const el = $('#pill-ext');
    // 真正的在线状态由扩展每 5 秒打一次 /api/ingest/ping，这里读服务端记下的时间戳
    const hb = await api('/api/ingest/ping').catch(() => null);
    if (hb && window.__extSeen && Date.now() - window.__extSeen < 15000) {
      el.textContent = '扩展在线'; el.className = 'pill ok';
    } else {
      el.textContent = online ? '扩展待连接' : '扩展未启用';
      el.className = 'pill warn';
    }
  } catch { /* 忽略 */ }
}

// 扩展心跳会打到 /api/ingest/ping；前端通过一个专用接口看最后一次心跳时间
async function pollExtHeartbeat() {
  try {
    const r = await fetch('/api/ingest/ping');
    const d = await r.json();
    if (d.lastExtensionBeat) window.__extSeen = new Date(d.lastExtensionBeat).getTime();
    // 扩展在心跳里报了自己的 id，控制台页面靠它反向唤起扩展做「一键发布」
    if (d.lastBeatInfo && d.lastBeatInfo.extId) window.__extId = d.lastBeatInfo.extId;
  } catch { /* 忽略 */ }
  const el = $('#pill-ext');
  if (window.__extSeen && Date.now() - window.__extSeen < 15000) {
    el.textContent = window.__extId ? '扩展在线 ✓' : '扩展在线';
    el.className = 'pill ok';
    el.title = window.__extId ? `扩展已连接（${window.__extId}），可用「网页发布」` : '扩展已连接';
  } else if (el.textContent.startsWith('扩展在线')) {
    el.textContent = '扩展待连接'; el.className = 'pill warn';
  }
}

/**
 * 一键发布：让扩展打开淘宝发布页并自动填表。
 * 这条路不需要开放平台 appkey —— 只用你已登录的淘宝身份，在发布页替你填表，
 * 你核对后自己点「提交宝贝」。
 */
async function publishItemViaExtension(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return toast('商品不存在', 'err');
  if (!window.__extId || !window.chrome?.runtime?.sendMessage) {
    return toast('没检测到扩展。请先在 Chrome 加载 extension/ 目录，并保持淘宝登录、扩展在线（顶栏显示「扩展在线 ✓」）。', 'err');
  }
  toast('正在打开淘宝发布页并自动填表…');
  try {
    const resp = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('扩展响应超时')), 60000);
      chrome.runtime.sendMessage(window.__extId, { type: 'copier:publish', item: it }, (r) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
    if (resp && resp.ok) {
      const filled = resp.resp && resp.resp.ok;
      toast(
        filled
          ? `已打开新标签页开始自动填表（图片 ${resp.imageCount} 张已备好）。请在发布页先选类目，表单加载后会自动填入。`
          : `发布页已打开，但填表脚本返回异常：${resp.resp?.error || '未知'}。可手动填写。`,
        filled ? 'ok' : 'err'
      );
    } else {
      toast(`发布失败：${resp?.error || '未知'}`, 'err');
    }
  } catch (e) {
    toast(`唤起扩展失败：${e.message}`, 'err');
  }
}

/* ------------------------------ 商品库 ------------------------------ */

async function loadItems() {
  const params = new URLSearchParams({
    q: $('#q').value,
    status: $('#filter-status').value,
    shopId: $('#filter-shop').value,
    sort: $('#sort').value,
    page: state.page,
    size: state.size,
  });
  const d = await api(`/api/items?${params}`);
  state.items = d.items;
  state.total = d.total;
  state.counts = d.counts;
  state.shops = d.shops || [];
  renderItems();
  renderShopFilter();
  $('#page-info').textContent = `${state.page} / ${Math.max(1, Math.ceil(state.total / state.size))}`;
  updateSelectionUi();
  refreshHealth();
}

function renderShopFilter() {
  const sel = $('#filter-shop');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部店铺</option>' + state.shops
    .map((s) => `<option value="${esc(s.shopId)}">${esc(s.title || s.shopUrl || s.shopId)}（${s.itemCount || 0}）</option>`)
    .join('');
  sel.value = cur;
}

function thumb(it) {
  const u = (it.images || [])[0];
  if (!u) return '<div class="noimg">无图</div>';
  const src = u.startsWith('/media/') ? u : u;
  return `<img src="${esc(src)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='<div class=&quot;noimg&quot;>图裂</div>'"/>`;
}

function renderItems() {
  const box = $('#item-list');
  if (!state.items.length) {
    box.innerHTML = `<div class="card" style="text-align:center;color:var(--dim)">
      商品库还是空的。去「采集导入」贴一个店铺链接，或者粘贴一段商品页 HTML。</div>`;
    return;
  }
  box.innerHTML =
    `<div class="item-row head"><span></span><span>主图</span><span>标题</span><span>价格</span><span>库存</span><span>SKU</span><span>状态</span></div>` +
    state.items.map((it) => {
      const warns = (it.warnings || []).length;
      return `<div class="item-row" data-id="${esc(it.id)}">
        <input type="checkbox" class="sel" data-id="${esc(it.id)}" ${state.selected.has(it.id) ? 'checked' : ''} style="width:auto;margin:0"/>
        ${thumb(it)}
        <div>
          <div class="item-title" data-open="${esc(it.id)}">${esc(it.title || '(无标题)')}</div>
          <button class="ghost small pub-btn" data-pub="${esc(it.id)}" title="让扩展打开淘宝发布页并自动填表，只用你的登录态，不需要开放平台 appkey">🚀 网页发布</button>
          <div class="item-meta">
            <span>${esc(it.sourceItemId || '')}</span>
            <span>${esc(it.sourceShop?.title || it.sourcePlatform || '')}</span>
            <span>${esc(it.collectedVia || '')}</span>
            ${warns ? `<span class="warn" title="${esc((it.warnings || []).join('；'))}">⚠ ${warns} 项待补</span>` : ''}
            ${(it.collectCount || 1) > 1 ? `<span class="dupe" title="这条以前采集过，系统按指纹自动认出来了，没有重复入库">🔁 已搬运过 ${esc(it.collectCount)} 次</span>` : ''}
            ${it.publishedItemId ? `<span class="published-tag">✅ 已发布 → ${esc(it.publishedItemId)}</span>` : ''}
          </div>
        </div>
        <div class="price">¥${Number(it.price || 0).toFixed(2)}</div>
        <div class="num">${esc(it.quantity ?? 0)}</div>
        <div class="num">${(it.skus || []).length || '-'}</div>
        <div><span class="badge ${esc(it.status || 'collected')}">${statusText(it.status)}</span></div>
      </div>`;
    }).join('');
}

function statusText(s) {
  return ({
    collected: '已采集',
    ready: '已就绪',
    publishing: '发布中',
    published: '已发布',
    'ready-in-stock': '已入仓库',
    failed: '发布失败',
  })[s] || s || '已采集';
}

$('#item-list').addEventListener('click', (e) => {
  // 「网页发布」按钮在标题单元格内，要先判断它，否则冒泡会误触发打开抽屉
  const pubId = e.target.closest('[data-pub]')?.dataset.pub;
  if (pubId) { e.stopPropagation(); return publishItemViaExtension(pubId); }
  const openId = e.target.closest('[data-open]')?.dataset.open;
  if (openId) return openDrawer(openId);
  const cb = e.target.closest('.sel');
  if (cb) {
    cb.checked ? state.selected.add(cb.dataset.id) : state.selected.delete(cb.dataset.id);
    updateSelectionUi();
  }
});
$('#item-list').addEventListener('change', (e) => {
  const cb = e.target.closest('.sel');
  if (!cb) return;
  cb.checked ? state.selected.add(cb.dataset.id) : state.selected.delete(cb.dataset.id);
  updateSelectionUi();
});

function updateSelectionUi() {
  const n = state.selected.size;
  $('#publish-selected-count').textContent = n ? `已选中 ${n} 个商品` : '未选中商品（去「商品库」勾选）';
  $('#btn-delete').disabled = !n;
  $('#btn-download-images').disabled = !n;
  $('#btn-export-zip').disabled = !n;
  const bp = $('#btn-batch-publish');
  if (bp) { bp.disabled = !n; bp.textContent = n ? `🚀 批量发布到千牛（${n}）` : '🚀 批量发布到千牛'; }
}

/**
 * 批量发布到千牛：把选中的多条商品一次性推送到「已打开的千牛发布面板」队列里，
 * 你在千牛那一个标签页里逐条自动填表、核对后自己点提交 —— 不会每条都开新标签页刷屏。
 * 仍然只用你已登录的身份，不需要开放平台 appkey。
 */
async function publishBatchViaExtension() {
  const ids = [...state.selected];
  if (!ids.length) return toast('先在商品库勾选要发布的商品', 'err');
  if (!window.__extId || !window.chrome?.runtime?.sendMessage) {
    return toast('没检测到扩展。请先在 Chrome 加载 extension/ 目录，并保持千牛/淘宝登录、扩展在线（顶栏「扩展在线 ✓」）。', 'err');
  }
  const items = state.items.filter((it) => ids.includes(it.id));
  toast(`正在把 ${items.length} 条商品推送到千牛发布面板…`);
  try {
    const resp = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('扩展响应超时')), 30000);
      chrome.runtime.sendMessage(window.__extId, { type: 'copier:publish-batch', items }, (r) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
    if (resp && resp.ok) {
      toast(`已把 ${resp.count || items.length} 条商品推送到千牛面板${resp.opened ? '（新开了千牛标签页）' : ''}。切到千牛，点「发布宝贝」选好类目，再从面板里逐条填入、核对后自己提交。`, 'ok');
    } else {
      toast(`推送失败：${resp?.error || '未知'}`, 'err');
    }
  } catch (e) {
    toast(`唤起扩展失败：${e.message}`, 'err');
  }
}

$('#btn-select-all').addEventListener('click', () => {
  const allSelected = state.items.every((it) => state.selected.has(it.id));
  state.items.forEach((it) => (allSelected ? state.selected.delete(it.id) : state.selected.add(it.id)));
  renderItems();
  updateSelectionUi();
});

$('#btn-batch-publish').addEventListener('click', () => publishBatchViaExtension());

$('#q').addEventListener('input', debounce(() => { state.page = 1; loadItems(); }, 320));
['#filter-status', '#filter-shop', '#sort'].forEach((s) => $(s).addEventListener('change', () => { state.page = 1; loadItems(); }));
$('#page-size').addEventListener('change', (e) => { state.size = Number(e.target.value); state.page = 1; loadItems(); });
$('#prev-page').addEventListener('click', () => { if (state.page > 1) { state.page--; loadItems(); } });
$('#next-page').addEventListener('click', () => {
  if (state.page * state.size < state.total) { state.page++; loadItems(); }
});

function debounce(fn, ms) {
  let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

/* ------------------------------ 编辑抽屉 ------------------------------ */

async function openDrawer(id) {
  const d = await api(`/api/items/${id}`);
  const it = d.item;
  state.currentItem = it;
  const b = $('#drawer-body');
  b.innerHTML = `
    <label>标题 <input id="d-title" value="${esc(it.title)}"/></label>
    <div class="row">
      <label>一口价 <input id="d-price" type="number" step="0.01" value="${esc(it.price)}"/></label>
      <label>库存 <input id="d-quantity" type="number" value="${esc(it.quantity)}"/></label>
      <label>类目 cid <input id="d-cid" value="${esc(it.categoryId)}"/></label>
    </div>
    <div class="row">
      <label>所在地 省 <input id="d-loc-state" value="${esc(it.location?.state || '')}"/></label>
      <label>市 <input id="d-loc-city" value="${esc(it.location?.city || '')}"/></label>
      <label>商家编码 <input id="d-outer" value="${esc(it.outerId || '')}"/></label>
    </div>
    <label>主图（每行一个，第一行是封面）
      <textarea id="d-images" rows="4">${esc((it.images || []).join('\n'))}</textarea></label>
    <div class="thumbs">${(it.images || []).map((u) => `<img src="${esc(u)}" referrerpolicy="no-referrer"/>`).join('')}</div>
    <label>属性（每行一条，格式 名称:值）
      <textarea id="d-props" rows="4">${esc(Object.entries(it.props || {}).map(([k, v]) => `${k}:${v}`).join('\n'))}</textarea></label>
    <label>SKU</label>
    ${(it.skus || []).length ? `<table><tr><th>规格</th><th>价格</th><th>库存</th><th>属性路径</th></tr>
      ${it.skus.map((s, i) => `<tr>
        <td><input class="sku-text" data-i="${i}" value="${esc(s.propText)}"/></td>
        <td><input class="sku-price" data-i="${i}" type="number" step="0.01" value="${esc(s.price)}"/></td>
        <td><input class="sku-qty" data-i="${i}" type="number" value="${esc(s.quantity)}"/></td>
        <td class="num" style="font-size:.72rem;color:var(--dim)">${esc(s.propPath)}</td>
      </tr>`).join('')}</table>` : '<p class="hint">无 SKU（单规格商品）</p>'}
    <label>详情 HTML <textarea id="d-desc" rows="10">${esc(it.description || '')}</textarea></label>
    <div class="row">
      <label>来源链接 <a href="${esc(it.sourceUrl)}" target="_blank" rel="noreferrer">${esc(it.sourceUrl || '(无)')}</a></label>
      <label>原商品 ID ${esc(it.sourceItemId || '-')}</label>
      <label>已发布 num_iid ${esc(it.publishedItemId || '-')}</label>
    </div>
    ${(it.warnings || []).length ? `<div class="log"><div class="warn">${it.warnings.map(esc).join('<br>')}</div></div>` : ''}
    ${it.publishError ? `<div class="log"><div class="error">上次发布失败：${esc(it.publishError)}${it.publishHint ? `<br>${esc(it.publishHint)}` : ''}</div></div>` : ''}
    <div class="row actions">
      <button class="ghost" id="d-preview-desc">预览详情</button>
      <span class="spacer"></span>
      <button class="primary" id="d-save">保存</button>
    </div>
    <div id="d-desc-preview"></div>
  `;
  $('#drawer').classList.add('open');
  $('#drawer-mask').classList.add('open');

  $('#d-save').onclick = async () => {
    const props = {};
    for (const line of $('#d-props').value.split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) props[line.slice(0, i).trim()] = line.slice(i + 1).trim();
    }
    const skus = (it.skus || []).map((s, i) => ({
      ...s,
      propText: $(`.sku-text[data-i="${i}"]`)?.value ?? s.propText,
      price: Number($(`.sku-price[data-i="${i}"]`)?.value ?? s.price),
      quantity: Number($(`.sku-qty[data-i="${i}"]`)?.value ?? s.quantity),
    }));
    try {
      await api(`/api/items/${it.id}`, {
        method: 'PUT',
        body: {
          title: $('#d-title').value,
          price: Number($('#d-price').value),
          quantity: Number($('#d-quantity').value),
          categoryId: $('#d-cid').value.trim(),
          outerId: $('#d-outer').value.trim(),
          location: { state: $('#d-loc-state').value.trim(), city: $('#d-loc-city').value.trim() },
          images: $('#d-images').value.split('\n').map((s) => s.trim()).filter(Boolean),
          props,
          skus,
          description: $('#d-desc').value,
        },
      });
      toast('已保存', 'ok');
      closeDrawer();
      loadItems();
    } catch (e) { toast(e.message, 'err'); }
  };

  $('#d-preview-desc').onclick = () => {
    $('#d-desc-preview').innerHTML = `<div class="card" style="margin-top:.9rem;background:#fff;color:#111">
      <div style="max-height:26rem;overflow:auto">${$('#d-desc').value}</div></div>`;
  };
}

function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer-mask').classList.remove('open');
}
$('#drawer-close').onclick = closeDrawer;
$('#drawer-mask').onclick = closeDrawer;
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

/* ------------------------------ 采集 ------------------------------ */

$('#btn-collect-shop').addEventListener('click', async () => {
  const shopUrl = $('#shop-url').value.trim();
  if (!shopUrl) return toast('先填店铺链接', 'err');
  const box = $('#shop-progress');
  try {
    const d = await api('/api/shops/collect', {
      body: {
        shopUrl,
        mode: $('#shop-mode').value,
        depth: $('#shop-depth').value,
        maxPages: Number($('#shop-pages').value),
      },
    });
    box.innerHTML = `<div class="diff">任务已排队（job ${esc(d.job.id)}）。<br>${esc(d.hint)}</div>`;
    toast('采集任务已下发，等扩展来领', 'ok');
    watchShopProgress();
  } catch (e) { box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
});

let shopStream = null;
function watchShopProgress() {
  if (shopStream) shopStream.close();
  const box = $('#shop-progress');
  shopStream = new EventSource('/api/shops/progress-stream');
  shopStream.onmessage = (ev) => {
    const p = JSON.parse(ev.data);
    const line = document.createElement('div');
    line.className = 'diff';
    line.innerHTML = `<span class="ts">${new Date(p.at).toLocaleTimeString('zh-CN')}</span>
      ${esc(p.message || '')} ${p.found ? `<span class="bytes">累计 ${p.found} 个宝贝</span>` : ''}`;
    box.prepend(line);
    if (p.state === 'done' || p.state === 'error') {
      loadItems();
      loadShops();
    }
  };
}

$('#btn-paste').addEventListener('click', async () => {
  const content = $('#paste-content').value;
  const box = $('#paste-result');
  if (!content.trim()) return toast('先粘贴内容', 'err');
  box.innerHTML = '<div class="diff">解析中…</div>';
  try {
    const d = await api('/api/ingest/paste', {
      body: {
        content,
        kind: $('#paste-kind').value,
        sourceUrl: $('#paste-url').value.trim(),
      },
    });
    box.innerHTML = `<div class="diff"><span class="after">识别为 ${esc(d.kind)}，入库 ${d.count} 条（新增 ${d.created}）</span></div>`;
    toast(`已入库 ${d.count} 条`, 'ok');
    $('#paste-content').value = '';
    loadItems();
  } catch (e) {
    box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`;
  }
});

async function loadShops() {
  try {
    const d = await api('/api/shops');
    $('#shop-list').innerHTML = (d.shops || []).length
      ? d.shops.map((s) => `<div class="shop-row">
          <div><b>${esc(s.title || '(未取到店名)')}</b>
            <div class="hint" style="margin:0">${esc(s.url || '')} · shopId ${esc(s.shopId || '-')} · sellerId ${esc(s.sellerId || '-')}</div></div>
          <div style="display:flex;gap:.5rem;align-items:center">
            <span class="num">${s.itemCount || 0} 个宝贝</span>
            <button class="ghost small" data-recollect="${esc(s.url)}">再采一次</button>
          </div></div>`).join('')
      : '<p class="hint">还没有采集过店铺。</p>';
    $$('[data-recollect]').forEach((b) => b.onclick = () => {
      $('#shop-url').value = b.dataset.recollect;
      $('#btn-collect-shop').click();
    });
  } catch (e) { /* 忽略 */ }
}

/* ------------------------------ 批量改写 ------------------------------ */

$('#btn-add-replacement').addEventListener('click', () => {
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = `<label>替换 <input class="rep-from" placeholder="原词"/></label>
    <label>为 <input class="rep-to" placeholder="新词"/></label>
    <label class="check" style="flex:0 0 auto"><input class="rep-regex" type="checkbox"/>正则</label>
    <button class="ghost small" style="flex:0 0 auto">删除</button>`;
  row.querySelector('button').onclick = () => row.remove();
  $('#r-title-replacements').appendChild(row);
});

function collectRules() {
  const rules = {};
  const prefix = $('#r-title-prefix').value.trim();
  const suffix = $('#r-title-suffix').value.trim();
  const remove = $('#r-title-remove').value.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
  const replacements = $$('#r-title-replacements .row').map((r) => ({
    from: $('.rep-from', r).value,
    to: $('.rep-to', r).value,
    regex: $('.rep-regex', r).checked,
  })).filter((x) => x.from);

  if (prefix || suffix || remove.length || replacements.length || $('#r-title-strip-brackets').checked || $('#r-title-variant').checked) {
    rules.title = {
      prefix, suffix,
      removeWords: remove,
      replacements,
      removeBrands: $('#r-title-strip-brackets').checked,
      variant: $('#r-title-variant').checked,
    };
  }
  const mult = $('#r-price-mult').value, off = $('#r-price-offset').value,
    end = $('#r-price-ending').value, min = $('#r-price-min').value, max = $('#r-price-max').value;
  if (mult || off || end || min || max) {
    rules.price = { multiplier: mult || undefined, offset: off || undefined, ending: end || undefined, min: min || undefined, max: max || undefined };
  }
  if ($('#r-quantity').value) rules.quantity = Number($('#r-quantity').value);
  rules.images = { original: $('#r-img-original').checked, maxCount: Number($('#r-img-max').value) };
  const brand = $('#r-prop-brand').value.trim();
  if (brand) rules.props = { set: { 品牌: brand } };
  if ($('#r-desc-clean').checked || $('#r-desc-header').value || $('#r-desc-footer').value) {
    rules.description = {
      strip: $('#r-desc-clean').checked,
      headerHtml: $('#r-desc-header').value || '',
      footerHtml: $('#r-desc-footer').value || '',
    };
  }
  return rules;
}

$('#btn-rules-preview').addEventListener('click', async () => {
  const box = $('#rules-preview');
  try {
    const d = await api('/api/items/transform', {
      method: 'POST',
      body: { ids: [...state.selected], rules: collectRules(), preview: true, all: $('#r-apply-all').checked },
    });
    box.innerHTML = d.diffs.map((x) => `<div class="diff">
      <div class="before">${esc(x.before.title)} · ¥${Number(x.before.price).toFixed(2)}</div>
      <div class="after">${esc(x.after.title)} · ¥${Number(x.after.price).toFixed(2)}</div>
      <div class="bytes">标题 ${x.titleBytes}/60 字节${(x.warnings || []).length ? ' · ⚠ ' + esc(x.warnings.join('；')) : ''}</div>
    </div>`).join('') + `<p class="hint">共 ${d.count} 条，预览前 ${d.diffs.length} 条。</p>`;
  } catch (e) { box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
});

$('#btn-rules-apply').addEventListener('click', async () => {
  const all = $('#r-apply-all').checked;
  const n = all ? state.total : state.selected.size;
  if (!n) return toast(all ? '商品库是空的' : '先在「商品库」勾选商品，或勾上「应用到全部」', 'err');
  if (!confirm(`确认对 ${n} 个商品应用改写？这一步会覆盖标题、价格、图片地址。`)) return;
  try {
    const d = await api('/api/items/transform', {
      method: 'POST',
      body: { ids: [...state.selected], rules: collectRules(), all },
    });
    toast(`已改写 ${d.updated} 条`, 'ok');
    loadItems();
  } catch (e) { toast(e.message, 'err'); }
});

/* ------------------------------ 批量操作 ------------------------------ */

$('#btn-delete').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!confirm(`删除选中的 ${ids.length} 个商品？本地图片不会被删。`)) return;
  await api('/api/items/delete', { method: 'POST', body: { ids } });
  ids.forEach((i) => state.selected.delete(i));
  toast(`已删除 ${ids.length} 条`, 'ok');
  loadItems();
});

$('#btn-download-images').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  try {
    const d = await api('/api/tasks/localize-images', { method: 'POST', body: { itemIds: ids, options: { concurrency: 3 } } });
    toast(`已开始下载 ${ids.length} 个商品的图片`, 'ok');
    openTask(d.task.id);
  } catch (e) { toast(e.message, 'err'); }
});

$('#btn-export-zip').addEventListener('click', async () => {
  const ids = [...state.selected];
  try {
    const res = await fetch('/api/export/package', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids, all: !ids.length, includeImages: true }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      return toast(d.error || `导出失败 HTTP ${res.status}`, 'err');
    }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `taobao-items-${new Date().toISOString().slice(0, 10)}.zip`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('素材包已导出', 'ok');
  } catch (e) { toast(e.message, 'err'); }
});

/* ------------------------------ 发布 ------------------------------ */

function publishOptions() {
  return {
    approveStatus: $('#p-approve').value,
    freightPayer: $('#p-freight').value,
    imageMode: $('#p-image-mode').value,
    stepDelayMs: Number($('#p-delay').value),
    itemDelayMs: Number($('#p-item-delay').value),
    skipPropCheck: $('#p-skip-prop-check').checked,
    stopOnError: $('#p-stop-on-error').checked,
    postageId: $('#p-postage').value.trim(),
    listNow: $('#p-approve').value === 'instock' ? false : true,
  };
}

async function doPublish(dryRun) {
  const ids = [...state.selected];
  const cid = $('#p-cid').value.trim() || (state.settings?.publish?.defaultCategoryId ?? '');
  if (!ids.length) return toast('先在「商品库」勾选要发布的商品', 'err');
  if (!cid && !dryRun) return toast('必须填发布类目 cid（叶子类目）。去「类目属性」页查。', 'err');

  if (!dryRun && !confirm(`确认真实发布 ${ids.length} 个商品到店铺？\n方式：${$('#p-approve').selectedOptions[0].text}\n类目：${cid}`)) return;

  const box = $('#publish-log');
  box.innerHTML = '';
  try {
    const d = await api('/api/tasks/publish', {
      method: 'POST',
      body: { itemIds: ids, options: { ...publishOptions(), categoryId: cid, dryRun } },
    });
    toast(dryRun ? '试运行已开始' : `发布任务已开始（${ids.length} 个商品）`, 'ok');
    openTask(d.task.id);
  } catch (e) {
    box.innerHTML = `<div class="error">${esc(e.message)}${e.hint ? `<br>${esc(e.hint)}` : ''}</div>`;
    toast(e.message, 'err');
  }
}

$('#btn-publish').addEventListener('click', () => doPublish(false));
$('#btn-dry-run').addEventListener('click', () => doPublish(true));

/* ------------------------------ 任务 ------------------------------ */

async function loadTasks() {
  try {
    const d = await api('/api/tasks');
    $('#task-list').innerHTML = (d.tasks || []).length
      ? d.tasks.map((t) => `<div class="task-row" data-task="${esc(t.id)}">
          <div><b>${esc(t.title)}</b>
            <div class="hint" style="margin:0">${new Date(t.createdAt).toLocaleString('zh-CN')} ·
              ${t.done ?? 0}/${t.total ?? 0} · 成功 ${t.succeeded ?? 0} · 失败 ${t.failed ?? 0}</div></div>
          <div style="display:flex;gap:.5rem;align-items:center">
            <span class="badge ${t.state === 'done' ? 'published' : t.state === 'failed' ? 'failed' : 'publishing'}">${esc(t.state)}</span>
            ${t.state === 'running' ? `<button class="ghost small" data-cancel="${esc(t.id)}">取消</button>` : ''}
            <button class="ghost small" data-view="${esc(t.id)}">看日志</button>
          </div></div>`).join('')
      : '<p class="hint">还没有任务。</p>';
    $$('[data-cancel]').forEach((b) => b.onclick = async () => { await api(`/api/tasks/${b.dataset.cancel}/cancel`, { method: 'POST' }); toast('已请求取消'); });
    $$('[data-view]').forEach((b) => b.onclick = () => openTask(b.dataset.view));
    if (state.currentTaskId && (d.tasks || []).some((t) => t.id === state.currentTaskId && t.state === 'running')) {
      setTimeout(loadTasks, 2500);
    }
  } catch (e) { $('#task-list').innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
}

function openTask(taskId) {
  state.currentTaskId = taskId;
  $$('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === 'tasks'));
  $$('.tab').forEach((s) => s.classList.toggle('active', s.id === 'tab-tasks'));
  loadTasks();

  const box = $('#task-log');
  box.innerHTML = '';
  if (state.taskStream) state.taskStream.close();
  const es = new EventSource(`/api/tasks/${taskId}/stream`);
  state.taskStream = es;

  const append = (cls, text) => {
    const div = document.createElement('div');
    div.className = cls;
    div.innerHTML = `<span class="ts">${new Date().toLocaleTimeString('zh-CN')}</span>${text}`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight;
  };

  es.onmessage = (ev) => {
    const e = JSON.parse(ev.data);
    if (e.type === 'snapshot') {
      box.innerHTML = '';
      (e.task.logs || []).forEach((l) => append(l.level, esc(l.message)));
      return;
    }
    if (e.type === 'log') return append('info', esc(e.message || e.title || ''));
    if (e.type === 'step') return append(e.state === 'error' ? 'error' : 'debug', esc(`· ${e.name} ${e.state}${e.error ? ' — ' + e.error : ''}${e.hint ? '（' + e.hint + '）' : ''}`));
    if (e.type === 'item-done') {
      append(e.ok ? 'ok' : 'error', e.ok ? `✓ 成功 num_iid=${esc(e.numIid || '')}` : `✗ 失败：${esc(e.error || '')}`);
      loadItems();
      return;
    }
    if (e.type === 'task') {
      append(e.state === 'failed' ? 'error' : 'ok', `任务结束：${esc(e.state)}${e.succeeded !== undefined ? ` 成功 ${e.succeeded} 失败 ${e.failed}` : ''}`);
      es.close();
      loadTasks();
      loadItems();
      refreshHealth();
    }
  };
  es.onerror = () => { /* 任务结束后服务端会关流，属于正常 */ };
}

/* ------------------------------ 类目 ------------------------------ */

async function loadCategories(parentCid) {
  const box = $('#cat-list');
  box.innerHTML = '<p class="hint">加载中…</p>';
  try {
    const d = await api(`/api/categories?parentCid=${parentCid}`);
    if (!d.categories.length) box.innerHTML = '<p class="hint">这一层没有子类目了。</p>';
    box.innerHTML = d.categories.map((c) => `<div class="cat-row clickable" data-cid="${esc(c.cid)}" data-name="${esc(c.name)}" data-parent="${esc(c.is_parent)}">
      <div><b>${esc(c.name)}</b> <span class="num">cid=${esc(c.cid)}</span>
        ${String(c.is_parent) === 'true' || c.is_parent === true ? '<span class="leaf">（还有下级）</span>' : '<span class="leaf">✓ 叶子类目，可发布</span>'}</div>
      <div style="display:flex;gap:.4rem">
        <button class="ghost small" data-use="${esc(c.cid)}">用这个类目</button>
        ${String(c.is_parent) === 'true' || c.is_parent === true ? `<button class="ghost small" data-enter="${esc(c.cid)}" data-n="${esc(c.name)}">进入 →</button>` : ''}
      </div></div>`).join('');

    $$('[data-enter]', box).forEach((b) => b.onclick = () => {
      state.catStack.push({ cid: parentCid, name: b.dataset.n });
      renderBreadcrumb();
      loadCategories(b.dataset.enter);
    });
    $$('[data-use]', box).forEach((b) => b.onclick = () => {
      const cid = b.dataset.use;
      $('#p-cid').value = cid;
      $('#s-def-cid').value = cid;
      toast(`已选类目 ${cid}，发布页和默认值都填好了`, 'ok');
      loadCategoryProps(cid);
    });
  } catch (e) {
    box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}${e.hint ? `<br>${esc(e.hint)}` : ''}</div>`;
  }
}

function renderBreadcrumb() {
  $('#cat-breadcrumb').innerHTML =
    `<button class="ghost small" data-jump="-1">根类目</button>` +
    state.catStack.map((c, i) => ` <span>›</span> <button class="ghost small" data-jump="${i}">${esc(c.name)}</button>`).join('');
  $$('[data-jump]').forEach((b) => b.onclick = () => {
    const i = Number(b.dataset.jump);
    if (i < 0) { state.catStack = []; loadCategories(0); return; }
    const target = state.catStack[i + 1] ? state.catStack[i + 1].cid : state.catStack[i].cid;
    state.catStack = state.catStack.slice(0, i + 1);
    loadCategories(i < 0 ? 0 : (state.catStack[i]?.cid ?? 0));
  });
}

$('#btn-cat-root').onclick = () => { state.catStack = []; renderBreadcrumb(); loadCategories(0); };
$('#btn-cat-search').onclick = async () => {
  const q = $('#cat-q').value.trim();
  if (!q) return;
  const box = $('#cat-list');
  try {
    const d = await api(`/api/categories/search?q=${encodeURIComponent(q)}`);
    box.innerHTML = d.categories.length
      ? d.categories.map((c) => `<div class="cat-row"><div><b>${esc(c.name)}</b> <span class="num">cid=${esc(c.cid)}</span>
          ${String(c.is_parent) === 'true' ? '' : '<span class="leaf">✓ 叶子</span>'}</div>
          <button class="ghost small" data-use="${esc(c.cid)}">用这个</button></div>`).join('')
      : '<p class="hint">没搜到。有些应用没有类目搜索权限，改用左边的层级浏览。</p>';
    $$('[data-use]', box).forEach((b) => b.onclick = () => { $('#p-cid').value = b.dataset.use; $('#s-def-cid').value = b.dataset.use; loadCategoryProps(b.dataset.use); toast(`已选 ${b.dataset.use}`, 'ok'); });
  } catch (e) { box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
};
$('#cat-q').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#btn-cat-search').click(); });

async function loadCategoryProps(cid) {
  const box = $('#cat-props');
  box.innerHTML = '<p class="hint">加载中…</p>';
  try {
    const [kp, sp] = await Promise.all([
      api(`/api/categories/${cid}/props?key=1`).catch((e) => ({ props: [], error: e.message })),
      api(`/api/categories/${cid}/sale-props`).catch((e) => ({ props: [], error: e.message })),
    ]);
    const table = (title, list, error) => `<h3 style="font-size:.88rem;margin:.9rem 0 .3rem">${title}</h3>` +
      (error ? `<div class="diff" style="color:var(--err)">${esc(error)}</div>`
        : list.length ? `<table class="prop-table"><tr><th>pid</th><th>属性名</th><th>必填</th><th>可选值</th></tr>
          ${list.slice(0, 60).map((p) => `<tr>
            <td class="num">${esc(p.pid)}</td><td>${esc(p.name)}</td>
            <td>${p.required || p.is_key ? '<span class="req">必填</span>' : ''}</td>
            <td class="hint" style="margin:0">${esc((p.prop_values?.prop_value || p.prop_values || []).map((v) => v.name || v).slice(0, 12).join(' / '))}</td>
          </tr>`).join('')}</table>` : '<p class="hint">没有返回属性（可能没有该接口权限）。</p>');
    box.innerHTML = table(`必填关键属性（cid=${cid}）`, kp.props || [], kp.error) + table('销售属性（颜色/尺码，SKU 用）', sp.props || [], sp.error);
  } catch (e) { box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
}

/* ------------------------------ 设置 ------------------------------ */

async function loadSettings() {
  try {
    const d = await api('/api/settings');
    const s = d.settings;
    state.settings = s;
    $('#s-appkey').value = s.appKey || '';
    $('#s-appsecret').placeholder = s.hasAppSecret ? '已保存（留空不改）' : '';
    $('#s-appsecret').value = '';
    $('#s-gateway').value = s.gateway || '';
    $('#s-redirect').value = s.redirectUri || '';
    $('#s-session').placeholder = s.hasSession ? '已保存（留空不改）' : '';
    $('#s-session').value = '';
    $('#s-nick').value = s.nick || '';
    $('#s-token').value = s.collectorToken || '';
    $('#s-def-cid').value = s.publish?.defaultCategoryId || '';
    $('#s-def-postage').value = s.publish?.defaultPostageId || '';
    $('#s-def-state').value = s.publish?.defaultLocationState || '';
    $('#s-def-city').value = s.publish?.defaultLocationCity || '';
    $('#p-cid').value = $('#p-cid').value || s.publish?.defaultCategoryId || '';
    $('#session-info').innerHTML = s.hasSession
      ? `<div class="diff"><span class="after">已有 session</span> · 店铺 ${esc(s.nick || '(未知)')} · 到期 ${esc(s.sessionExpiresAt || '未知')}</div>`
      : '<div class="diff"><span style="color:var(--warn)">还没有 session，无法真实发布。</span></div>';
  } catch (e) { toast(e.message, 'err'); }
}

$('#btn-save-settings').onclick = async () => {
  const body = {
    appKey: $('#s-appkey').value.trim(),
    gateway: $('#s-gateway').value.trim(),
  };
  if ($('#s-appsecret').value.trim()) body.appSecret = $('#s-appsecret').value.trim();
  try {
    await api('/api/settings', { method: 'PUT', body });
    toast('已保存', 'ok');
    loadSettings(); refreshHealth();
  } catch (e) { toast(e.message, 'err'); }
};

$('#btn-test-settings').onclick = async () => {
  const box = $('#settings-test');
  box.innerHTML = '<div class="diff">自检中…（要访问淘宝服务器，稍等几秒）</div>';
  try {
    const d = await api('/api/settings/test', { method: 'POST' });
    box.innerHTML = d.checks.map((c) => `<div class="diff">
      <span class="${c.ok ? 'after' : ''}" ${c.ok ? '' : 'style="color:var(--err)"'}>${c.ok ? '✓' : '✗'} ${esc(c.name)}</span>
      <div class="hint" style="margin:0">${esc(c.detail)}</div></div>`).join('');
  } catch (e) { box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
};

$('#btn-oauth').onclick = async () => {
  try {
    const d = await api('/api/settings/oauth/start', { method: 'POST', body: { port: location.port || 8787 } });
    window.open(d.url, '_blank', 'width=900,height=700');
    toast('已打开授权页，用卖家账号登录并同意；完成后回来点「查当前授权店铺」', 'ok');
  } catch (e) { toast(e.message, 'err'); }
};

$('#btn-save-session').onclick = async () => {
  const session = $('#s-session').value.trim();
  if (!session) return toast('session 为空', 'err');
  try {
    await api('/api/settings/session', { method: 'POST', body: { session, nick: $('#s-nick').value.trim() } });
    toast('已保存 session', 'ok');
    loadSettings(); refreshHealth();
  } catch (e) { toast(e.message, 'err'); }
};

$('#btn-whoami').onclick = async () => {
  const box = $('#session-info');
  box.innerHTML = '<div class="diff">查询中…</div>';
  try {
    const d = await api('/api/settings/test', { method: 'POST' });
    const c = d.checks.find((x) => x.name.includes('授权'));
    box.innerHTML = `<div class="diff"><span class="${c?.ok ? 'after' : ''}" ${c?.ok ? '' : 'style="color:var(--err)"'}>${esc(c?.detail || '没有结果')}</span></div>`;
    loadSettings(); refreshHealth();
  } catch (e) { box.innerHTML = `<div class="diff" style="color:var(--err)">${esc(e.message)}</div>`; }
};

$('#btn-copy-token').onclick = async () => {
  try { await navigator.clipboard.writeText($('#s-token').value); toast('口令已复制，去扩展里粘贴', 'ok'); }
  catch { toast('复制失败，手动选中复制', 'err'); }
};
$('#btn-save-token').onclick = async () => {
  await api('/api/settings', { method: 'PUT', body: { collectorToken: $('#s-token').value.trim() } });
  toast('已保存', 'ok');
};
$('#btn-save-publish-defaults').onclick = async () => {
  await api('/api/settings', {
    method: 'PUT',
    body: {
      publish: {
        defaultCategoryId: $('#s-def-cid').value.trim(),
        defaultPostageId: $('#s-def-postage').value.trim(),
        defaultLocationState: $('#s-def-state').value.trim(),
        defaultLocationCity: $('#s-def-city').value.trim(),
      },
    },
  });
  toast('默认值已保存', 'ok');
  loadSettings();
};

/* ------------------------------ 启动 ------------------------------ */

(async function boot() {
  await loadItems();
  await loadSettings().catch(() => {});
  await pollExtHeartbeat();
  setInterval(refreshHealth, 15000);
  setInterval(pollExtHeartbeat, 5000);
})();

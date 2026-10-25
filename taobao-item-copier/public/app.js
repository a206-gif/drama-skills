'use strict';

/* 淘宝店铺图片提取器 · 控制台前端（原生 JS，无构建步骤） */

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function toast(msg, kind = 'info') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = `toast show ${kind}`;
  clearTimeout(t._timer);
  t._timer = setTimeout(() => { t.className = 'toast'; }, 3600);
}

async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text.slice(0, 200) }; }
  if (!res.ok) throw new Error(data.error || `请求失败（${res.status}）`);
  return data;
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

const state = {
  items: [],
  shops: [],
  selected: new Set(),
  total: 0,
  page: 1,
  size: 24,
};

/* ------------------------------ 顶栏状态 ------------------------------ */

async function refreshHealth() {
  try {
    const d = await api('/api/health');
    $('#pill-stat').textContent = `${d.items} 个商品 · ${d.images} 张图 · ${d.localized} 个已下载`;
    $('#pill-stat').className = 'pill ok';
  } catch {
    $('#pill-stat').textContent = '服务未连接';
    $('#pill-stat').className = 'pill warn';
  }
}

async function pollExtHeartbeat() {
  const el = $('#pill-ext');
  try {
    const d = await api('/api/ingest/ping');
    if (d.lastExtensionBeat && Date.now() - new Date(d.lastExtensionBeat).getTime() < 15000) {
      if (d.lastBeatInfo && d.lastBeatInfo.extId) window.__extId = d.lastBeatInfo.extId;
      el.textContent = window.__extId ? '扩展在线 ✓' : '扩展在线';
      el.className = 'pill ok';
      el.title = '扩展已连接，可扫描整店';
    } else {
      el.textContent = '扩展待连接';
      el.className = 'pill warn';
      el.title = '未在 Chrome 加载 extension/，或淘宝未登录';
    }
  } catch {
    el.textContent = '服务未连接';
    el.className = 'pill warn';
  }
}

async function loadSettings() {
  // 采集口令（若开启）展示给使用者，方便填进扩展
  try {
    const d = await api('/api/ingest/ping');
    if (d.needToken) {
      const hint = $('#scan-card .hint');
      if (hint && !hint.dataset.tokenShown) {
        hint.dataset.tokenShown = '1';
        hint.insertAdjacentHTML('beforeend', '<br>⚠️ 本机开启了采集口令，请在扩展选项里填入相同口令（服务只监听 127.0.0.1）。');
      }
    }
  } catch { /* 忽略 */ }
}

/* ------------------------------ 画廊 ------------------------------ */

async function loadItems() {
  const params = new URLSearchParams({
    q: $('#q').value.trim(),
    shopId: $('#filter-shop').value,
    sort: $('#sort').value,
    page: String(state.page),
    size: String(state.size),
  });
  const d = await api(`/api/items?${params}`);
  state.items = d.items || [];
  state.total = d.total || 0;
  state.shops = d.shops || [];
  renderGallery();
  renderShopFilter();
  renderPager();
  updateSelectionUi();
  refreshHealth();
}

function imgCount(it) {
  const set = new Set([...(it.images || []), ...(it.descImages || []), ...(it.propImages || []).map((p) => p.url)]);
  return set.size;
}

function renderGallery() {
  const box = $('#gallery');
  if (!state.items.length) {
    box.innerHTML = `<div class="empty">还没有商品。在上方粘贴一个店铺链接点「开始扫描整店」，或用「粘贴导入」贴一段店铺/商品页 HTML。</div>`;
    return;
  }
  box.innerHTML = state.items.map((it) => {
    const thumbs = (it.images || []).slice(0, 4).map((u) =>
      `<img src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.opacity=.15"/>`
    ).join('');
    const n = imgCount(it);
    const localized = it.imagesLocalized;
    return `<div class="gcard${state.selected.has(it.id) ? ' sel' : ''}" data-id="${esc(it.id)}">
      <label class="gcheck"><input type="checkbox" class="sel" data-id="${esc(it.id)}" ${state.selected.has(it.id) ? 'checked' : ''}/></label>
      <div class="gthumbs" data-open="${esc(it.id)}">${thumbs || '<div class="noimg">无图</div>'}</div>
      <div class="gbody">
        <div class="gtitle" data-open="${esc(it.id)}" title="${esc(it.title || '')}">${esc(it.title || '(无标题)')}</div>
        <div class="gmeta">
          <span class="gcount">${n} 张${localized ? ' · ✅已下载' : ''}</span>
          ${it.sourceUrl ? `<a class="glink" href="${esc(it.sourceUrl)}" target="_blank" rel="noopener">原链接 ↗</a>` : ''}
        </div>
        <div class="gacts">
          <button class="ghost small" data-dl="${esc(it.id)}">⬇ 下载图片</button>
          <button class="ghost small" data-open="${esc(it.id)}">查看</button>
        </div>
      </div>
    </div>`;
  }).join('');
}

function renderShopFilter() {
  const sel = $('#filter-shop');
  const cur = sel.value;
  sel.innerHTML = '<option value="">全部店铺</option>' + state.shops
    .map((s) => `<option value="${esc(s.shopId)}">${esc(s.title || s.shopUrl || s.shopId)}（${s.itemCount || 0}）</option>`)
    .join('');
  sel.value = cur;
}

function renderPager() {
  const pages = Math.max(1, Math.ceil(state.total / state.size));
  $('#page-info').textContent = `${state.page} / ${pages}`;
  $('#prev-page').disabled = state.page <= 1;
  $('#next-page').disabled = state.page >= pages;
}

function updateSelectionUi() {
  const n = state.selected.size;
  $('#btn-download').textContent = n ? `⬇ 下载选中图片（${n}）` : '⬇ 下载选中图片';
  $('#btn-zip').textContent = n ? `📦 打包下载 ZIP（${n}）` : '📦 打包下载 ZIP';
  $('#btn-download').disabled = !n;
  $('#btn-zip').disabled = !n;
  $('#btn-delete').disabled = !n;
}

/* ------------------------------ 画廊交互 ------------------------------ */

$('#gallery').addEventListener('click', (e) => {
  const dl = e.target.closest('[data-dl]');
  if (dl) { e.stopPropagation(); return downloadOne(dl.dataset.dl, dl); }
  const open = e.target.closest('[data-open]');
  if (open) return openLightbox(open.dataset.open);
  const cb = e.target.closest('.sel');
  if (cb) {
    cb.checked ? state.selected.add(cb.dataset.id) : state.selected.delete(cb.dataset.id);
    cb.closest('.gcard').classList.toggle('sel', cb.checked);
    updateSelectionUi();
  }
});

$('#btn-select-all').addEventListener('click', () => {
  const allSel = state.items.every((it) => state.selected.has(it.id));
  state.items.forEach((it) => (allSel ? state.selected.delete(it.id) : state.selected.add(it.id)));
  renderGallery();
  updateSelectionUi();
});

async function downloadOne(id, btn) {
  if (btn) { btn.disabled = true; btn.textContent = '下载中…'; }
  try {
    const r = await api(`/api/items/${id}/download-images`, { method: 'POST', body: {} });
    const ok = r.report?.ok?.length || 0;
    const fail = r.report?.failed?.length || 0;
    toast(`已下载 ${ok} 张图片到本地${fail ? `，${fail} 张失败（可能是防盗链或已失效）` : ''}`, fail ? 'info' : 'ok');
    await loadItems();
  } catch (e) {
    toast(`下载失败：${e.message}`, 'err');
    if (btn) { btn.disabled = false; btn.textContent = '⬇ 下载图片'; }
  }
}

$('#btn-download').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return toast('先勾选要下载图片的商品', 'err');
  const btn = $('#btn-download');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '下载中…';
  try {
    const r = await api('/api/items/download-images', { method: 'POST', body: { ids } });
    toast(`已处理 ${r.items} 个商品、下载 ${r.images} 张图片到本地`, 'ok');
    await loadItems();
  } catch (e) {
    toast(`批量下载失败：${e.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
    updateSelectionUi();
  }
});

$('#btn-zip').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return toast('先勾选要打包的商品', 'err');
  const btn = $('#btn-zip');
  btn.disabled = true;
  const old = btn.textContent;
  btn.textContent = '打包中…';
  try {
    // 打包前先把还没下载的图拉下来，否则 ZIP 里只有已下载的
    try { await api('/api/items/download-images', { method: 'POST', body: { ids } }); } catch { /* 下载失败也继续打包已下载的 */ }
    const res = await fetch('/api/export/images-zip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error(d.error || `打包失败（${res.status}）`);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `taobao-images-${new Date().toISOString().slice(0, 10)}.zip`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    await loadItems();
    toast('图片包已开始下载', 'ok');
  } catch (e) {
    toast(e.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = old;
    updateSelectionUi();
  }
});

$('#btn-delete').addEventListener('click', async () => {
  const ids = [...state.selected];
  if (!ids.length) return;
  if (!confirm(`确定删除选中的 ${ids.length} 个商品（及其记录）？本地已下载的图片文件不会被删。`)) return;
  try {
    await api('/api/items/delete', { method: 'POST', body: { ids } });
    ids.forEach((id) => state.selected.delete(id));
    toast(`已删除 ${ids.length} 个`, 'ok');
    await loadItems();
  } catch (e) {
    toast(`删除失败：${e.message}`, 'err');
  }
});

/* ------------------------------ 灯箱 ------------------------------ */

function openLightbox(id) {
  const it = state.items.find((x) => x.id === id);
  if (!it) return;
  const groups = [
    ['主图', it.images || []],
    ['详情图', it.descImages || []],
    ['属性图', (it.propImages || []).map((p) => p.url).filter(Boolean)],
  ].filter(([, arr]) => arr.length);
  $('#lb-title').textContent = it.title || '(无标题)';
  $('#lb-open').href = it.sourceUrl || '#';
  $('#lb-open').style.display = it.sourceUrl ? '' : 'none';
  $('#lb-grid').innerHTML = groups.map(([name, arr]) => `
    <div class="lb-group">
      <h4>${name}（${arr.length}）</h4>
      <div class="lb-imgs">${arr.map((u) => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" loading="lazy" referrerpolicy="no-referrer"/></a>`).join('')}</div>
    </div>`).join('') || '<div class="empty">这个商品还没提取到图片。</div>';
  $('#lightbox').classList.add('show');
}

$('#lb-close').addEventListener('click', () => $('#lightbox').classList.remove('show'));
$('#lightbox').addEventListener('click', (e) => { if (e.target.id === 'lightbox') $('#lightbox').classList.remove('show'); });

/* ------------------------------ 扫描整店 ------------------------------ */

let scanStream = null;

$('#btn-scan').addEventListener('click', async () => {
  const shopUrl = $('#shop-url').value.trim();
  if (!shopUrl) return toast('先粘贴一个店铺链接', 'err');
  if (!window.__extId || !window.chrome?.runtime?.sendMessage) {
    return toast('没检测到扩展。请先在 Chrome 加载 extension/ 目录并保持淘宝登录（右上角「扩展在线 ✓」），或用下方「粘贴导入」。', 'err');
  }
  const btn = $('#btn-scan');
  btn.disabled = true;
  btn.textContent = '扫描中…';
  openScanStream();
  try {
    // 让扩展去扫店：它会翻页枚举所有商品、抓图片链接，回传到本地服务
    const resp = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('扩展响应超时（店铺较大时可能需要更久）')), 120000);
      chrome.runtime.sendMessage(window.__extId, {
        type: 'copier:scan-shop',
        payload: { shopUrl, maxPages: Number($('#shop-pages').value) || 20, mode: $('#shop-mode').value },
      }, (r) => {
        clearTimeout(timer);
        if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
        else resolve(r);
      });
    });
    if (resp && resp.ok) {
      toast(`扫描完成：发现 ${resp.found ?? '若干'} 个商品，已入库`, 'ok');
    } else {
      toast(`扫描结束：${resp?.error || '未获取到结果，可改用粘贴导入'}`, 'err');
    }
  } catch (e) {
    toast(`唤起扩展失败：${e.message}`, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = '开始扫描整店';
    await loadItems();
  }
});

function openScanStream() {
  if (scanStream) scanStream.close();
  const box = $('#scan-progress');
  box.innerHTML = '<div class="prog-line">连接扫描进度…</div>';
  scanStream = new EventSource('/api/shops/progress-stream');
  scanStream.onmessage = (ev) => {
    try {
      const d = JSON.parse(ev.data);
      const line = `<div class="prog-line">${esc(d.message || '')}${d.found ? `（累计 ${d.found} 个）` : ''}</div>`;
      box.insertAdjacentHTML('afterbegin', line);
      while (box.children.length > 30) box.lastElementChild.remove();
      if (d.state === 'done' || d.state === 'error') loadItems();
    } catch { /* 忽略心跳 */ }
  };
  scanStream.onerror = () => { /* EventSource 会自动重连 */ };
}

/* ------------------------------ 粘贴导入 ------------------------------ */

$('#btn-paste').addEventListener('click', async () => {
  const content = $('#paste-content').value;
  if (!content.trim()) return toast('先粘贴内容', 'err');
  try {
    const d = await api('/api/ingest/paste', {
      method: 'POST',
      body: { content, shopUrl: $('#paste-shop-url').value.trim(), kind: 'shop-html' },
    });
    toast(`已导入 ${d.count} 个商品`, 'ok');
    $('#paste-content').value = '';
    await loadItems();
  } catch (e) {
    toast(`导入失败：${e.message}`, 'err');
  }
});

/* ------------------------------ 搜索/筛选/翻页 ------------------------------ */

$('#q').addEventListener('input', debounce(() => { state.page = 1; loadItems(); }, 320));
['#filter-shop', '#sort'].forEach((s) => $(s).addEventListener('change', () => { state.page = 1; loadItems(); }));
$('#page-size').addEventListener('change', (e) => { state.size = Number(e.target.value); state.page = 1; loadItems(); });
$('#prev-page').addEventListener('click', () => { if (state.page > 1) { state.page--; loadItems(); } });
$('#next-page').addEventListener('click', () => { if (state.page * state.size < state.total) { state.page++; loadItems(); } });

/* ------------------------------ 启动 ------------------------------ */

(async function boot() {
  await loadItems().catch(() => {});
  await loadSettings().catch(() => {});
  await pollExtHeartbeat();
  setInterval(refreshHealth, 15000);
  setInterval(pollExtHeartbeat, 5000);
})();

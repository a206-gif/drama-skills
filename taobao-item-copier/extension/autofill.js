'use strict';

/**
 * 千牛发布页自动填表（注入到 myseller / seller / work / qianniu 等千牛域名）。
 *
 * 与上一版最大的不同：不再依赖"控制台点按钮 → 背景脚本发消息"才能启动。
 * 现在它自己在千牛页面挂一个浮动面板，面板直接去本地服务拉你采集过的商品，
 * 你选一条，它就填。这样不管你是从控制台跳转来的、还是自己点进"发布宝贝"的，都能用。
 *
 * 发布表单可能在 iframe 里（千牛是 SPA），所以：
 *   - 面板只挂在顶层窗口
 *   - 真正填表时通过背景脚本 chrome.tabs.sendMessage（不带 frameId）广播到所有 frame，
 *     哪个 frame 里有表单字段，哪个就执行填充
 *
 * 提交那一下永远留给你本人点，工具不替你提交。
 */

(() => {
  if (window.__copierAutofill) return;
  window.__copierAutofill = true;

  const engine = globalThis.__copierFill;
  const isTop = (() => { try { return window.top === window.self; } catch { return false; } })();

  // 把真实 DOM 包成引擎需要的 env
  const env = {
    document,
    querySelector: (s) => document.querySelector(s),
    querySelectorAll: (s) => [...document.querySelectorAll(s)],
    createElement: (t) => document.createElement(t),
    createEvent: (type, opts) => new Event(type, opts),
    createFile: (b64, name, type) => {
      const bin = atob(b64);
      const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new File([arr], name, { type });
    },
    File: window.File,
    DataTransfer: window.DataTransfer,
    HTMLInputElement: window.HTMLInputElement,
    HTMLTextAreaElement: window.HTMLTextAreaElement,
  };

  function esc(s) {
    return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function getCfg() {
    try {
      const { cfg } = await chrome.storage.local.get('cfg');
      return { localBase: 'http://127.0.0.1:8787', ...(cfg || {}) };
    } catch {
      return { localBase: 'http://127.0.0.1:8787' };
    }
  }

  /* ================= 顶层窗口：浮动面板 ================= */

  if (isTop) {
    let panelEl = null;
    let itemsCache = [];

    function ensurePanel() {
      if (panelEl && document.contains(panelEl)) return panelEl;
      panelEl = document.createElement('div');
      panelEl.id = '__copier_panel';
      panelEl.innerHTML = `
        <style>
          #__copier_panel{position:fixed;right:16px;top:16px;z-index:2147483647;width:340px;max-height:88vh;
            display:flex;flex-direction:column;background:#11182f;color:#e6edf3;border:1px solid #22304f;border-radius:12px;
            box-shadow:0 12px 40px rgba(0,0,0,.5);font:13px/1.55 system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}
          #__copier_panel .hd{display:flex;justify-content:space-between;align-items:center;padding:10px 13px;border-bottom:1px solid #22304f}
          #__copier_panel .hd b{font-size:13px} #__copier_panel .x{cursor:pointer;color:#93a3bd;border:none;background:none;font-size:16px}
          #__copier_panel .bd{overflow:auto;padding:6px 0}
          #__copier_panel .tip{padding:8px 13px;color:#6f8098;font-size:11.5px;border-top:1px solid #22304f}
          #__copier_panel .it{display:flex;gap:8px;align-items:center;padding:7px 13px;border-bottom:1px solid #1a2340;cursor:pointer}
          #__copier_panel .it:hover{background:#161f3a}
          #__copier_panel .it img{width:38px;height:38px;border-radius:6px;object-fit:cover;background:#0b1020;flex:0 0 auto}
          #__copier_panel .it .tt{flex:1;min-width:0} #__copier_panel .it .tt b{display:block;font-weight:550;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
          #__copier_panel .it .tt span{color:#93a3bd;font-size:11.5px}
          #__copier_panel .it .pub{color:#3fb950;font-size:11px;flex:0 0 auto}
          #__copier_panel .rep{padding:9px 13px}
          #__copier_panel .rep .row{display:flex;gap:7px;padding:3px 0;font-size:12px}
          #__copier_panel .rep .ok{color:#3fb950} #__copier_panel .rep .man{color:#d29922} #__copier_panel .rep .fail{color:#f85149}
          #__copier_panel button.mini{margin:6px 13px;padding:5px 9px;border-radius:7px;border:1px solid #22304f;background:#161f3a;color:#e6edf3;cursor:pointer;font-size:12px}
          #__copier_panel .hd .mini{margin:0;padding:2px 8px}
        </style>
        <div class="hd">
          <b>📦 搬运台 · 发布助手</b>
          <span><button class="x mini" id="__cp_refresh" title="刷新列表">↻</button><button class="x" id="__cp_x">✕</button></span>
        </div>
        <div class="bd" id="__cp_bd"><div class="tip">读取本地商品库…</div></div>
        <div class="tip">先在千牛点「商品 → 发布宝贝」并选好类目，等表单加载出来，再从上面选一条商品自动填入。核对后你自己点「提交」。</div>
      `;
      document.documentElement.appendChild(panelEl);
      panelEl.querySelector('#__cp_x').onclick = () => { panelEl.remove(); panelEl = null; };
      panelEl.querySelector('#__cp_refresh').onclick = () => loadItems();
      return panelEl;
    }

    async function loadItems() {
      const p = ensurePanel();
      const bd = p.querySelector('#__cp_bd');
      bd.innerHTML = '<div class="tip">读取本地商品库…</div>';
      const cfg = await getCfg();
      try {
        const res = await fetch(`${cfg.localBase}/api/items?size=60&sort=newest`, {
          headers: cfg.token ? { 'X-Collector-Token': cfg.token } : {},
        });
        const d = await res.json();
        itemsCache = d.items || [];
        if (!itemsCache.length) {
          bd.innerHTML = '<div class="tip">本地商品库是空的。先在淘宝商品页/店铺页用扩展采集，或确认本地服务已启动。</div>';
          return;
        }
        bd.innerHTML = itemsCache.map((it) => `
          <div class="it" data-id="${esc(it.id)}">
            <img src="${esc((it.images || [])[0] || '')}" referrerpolicy="no-referrer" onerror="this.style.visibility='hidden'"/>
            <div class="tt"><b>${esc(it.title || '(无标题)')}</b><span>¥${Number(it.price || 0).toFixed(2)} · 库存${esc(it.quantity ?? 0)}${it.publishedItemId ? ' · 已发布' : ''}</span></div>
            ${it.publishedItemId ? '<span class="pub">✓已发</span>' : ''}
          </div>`).join('');
        bd.querySelectorAll('.it').forEach((row) => {
          row.onclick = () => pickItem(row.dataset.id);
        });
      } catch (e) {
        bd.innerHTML = `<div class="tip" style="color:#f85149">连不上本地服务：${esc(e.message)}<br>确认 npm start 在跑、扩展选项里本地地址正确。</div>`;
      }
    }

    async function pickItem(id) {
      const item = itemsCache.find((x) => x.id === id);
      if (!item) return;
      const p = ensurePanel();
      const bd = p.querySelector('#__cp_bd');
      bd.innerHTML = `<div class="tip">正在准备图片并填表：${esc((item.title || '').slice(0, 24))}…</div>`;

      // 让背景脚本把图片下载转 base64（背景有跨域权限，内容脚本没有）
      let imageFiles = [];
      try {
        const r = await chrome.runtime.sendMessage({ type: 'copier:prep-images', item });
        imageFiles = (r && r.files) || [];
      } catch (e) {
        imageFiles = [];
      }

      // 广播到所有 frame（含顶层 frameId 0），哪个 frame 有表单哪个填。
      // broadcastFill 已覆盖顶层，这里不再重复填，避免顶层被填两次。
      let report = null;
      let reason = '';
      try {
        const resp = await chrome.runtime.sendMessage({ type: 'copier:broadcast-fill', item: { ...item, imageFiles } });
        report = resp && resp.report;
        reason = (resp && resp.reason) || '';
      } catch (e) {
        report = { filled: [], manual: [], failed: [{ key: 'broadcast', label: '填充', error: e.message }] };
      }

      if (report && (report.filled.length || (report.manual || []).length)) {
        renderReport(report, item.title);
      } else {
        renderReport({
          filled: [],
          manual: [{ key: 'noform', label: '没找到发布表单', reason: reason || '请先在千牛点「商品 → 发布宝贝」并选好类目，等表单加载出来，再选商品填充。' }],
          failed: [],
        }, item.title);
      }
    }

    function renderReport(report, title) {
      const p = ensurePanel();
      const bd = p.querySelector('#__cp_bd');
      const sec = (cls, icon, rows) => rows.map((r) =>
        `<div class="rep"><div class="row ${cls}"><span>${icon}</span><span><b>${esc(r.label || r.key)}</b>${r.value ? ` — ${esc(r.value)}` : ''}${r.reason ? `<br><span style="color:#93a3bd">${esc(r.reason)}</span>` : ''}${r.error ? `<br><span style="color:#93a3bd">${esc(r.error)}</span>` : ''}</span></div></div>`
      ).join('');
      bd.innerHTML =
        `<div class="tip" style="color:#e6edf3">已处理：${esc((title || '').slice(0, 26))}</div>` +
        `<button class="mini" id="__cp_back">← 返回商品列表</button>` +
        sec('ok', '✓', report.filled || []) +
        sec('man', '!', report.manual || []) +
        sec('fail', '✗', report.failed || []);
      bd.querySelector('#__cp_back').onclick = () => loadItems();
    }

    // 挂一个可拖动的启动按钮，点开面板（默认不自动展开，免得挡千牛界面）
    function ensureLauncher() {
      if (document.getElementById('__copier_fab_publish')) return;
      const fab = document.createElement('div');
      fab.id = '__copier_fab_publish';
      fab.innerHTML = `<style>#__copier_fab_publish{position:fixed;right:18px;bottom:96px;z-index:2147483646}
        #__copier_fab_publish button{padding:10px 14px;border:none;border-radius:24px;cursor:pointer;font:600 13px system-ui,"PingFang SC";
        background:#ff7a1a;color:#1a0d03;box-shadow:0 6px 20px rgba(0,0,0,.35)}</style>
        <button>📦 搬运发布</button>`;
      document.documentElement.appendChild(fab);
      fab.querySelector('button').onclick = () => { ensurePanel(); loadItems(); };
    }

    // 只在千牛卖家域名下挂启动按钮，别在普通淘宝页乱入
    const SELLER_HOST = /(myseller|seller|sell|work|qianniu|qianiu|qn)\.taobao\.com$/.test(location.hostname);
    if (SELLER_HOST) {
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureLauncher);
      else ensureLauncher();
    }
  }

  /* ================= 所有 frame：响应填充广播 ================= */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === 'copier:fill-item' || msg.type === 'copier:do-fill') {
      const item = msg.item || {};
      // 只有本 frame 里真的有标题字段，才执行填充（避免在没表单的 frame 里空跑）
      const hasForm = engine && engine.findField(env, engine.FIELD_ALIASES.title, ['input', 'textarea']);
      if (!hasForm && !msg.force) {
        sendResponse({ ok: false, skipped: true });
        return;
      }
      (async () => {
        try {
          // 等表单异步渲染出来
          let ready = !!hasForm;
          for (let i = 0; i < 24 && !ready; i++) {
            ready = !!engine.findField(env, engine.FIELD_ALIASES.title, ['input', 'textarea']);
            if (!ready) await new Promise((r) => setTimeout(r, 500));
          }
          if (!ready) return sendResponse({ ok: false, skipped: true, reason: '本 frame 没有发布表单' });
          const report = await engine.fillItem(env, item, { retries: 3, stepDelay: 260 });
          sendResponse({ ok: true, report, frame: location.href.slice(0, 80) });
        } catch (e) {
          sendResponse({ ok: false, error: e.message });
        }
      })();
      return true; // 异步响应
    }
  });
})();

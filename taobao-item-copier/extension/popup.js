'use strict';

const $ = (id) => document.getElementById(id);

function say(text, kind = '') {
  const el = $('msg');
  el.textContent = text;
  el.className = `msg show ${kind}`;
}

function setLine(id, text, kind) {
  const el = $(id);
  el.textContent = text;
  el.className = kind || '';
}

async function refresh() {
  const { cfg } = await chrome.runtime.sendMessage({ type: 'get-config' });
  $('cfg-base').value = cfg.localBase;
  $('cfg-token').value = cfg.token || '';
  $('cfg-appkey').value = cfg.mtopAppKey;
  $('cfg-gateway').value = cfg.mtopGateway;
  $('cfg-shopapi').value = cfg.shopItemsApi.api;
  $('cfg-shopv').value = cfg.shopItemsApi.v;
  $('cfg-shopdata').value = JSON.stringify(cfg.shopItemsApi.dataTemplate);

  const st = await chrome.runtime.sendMessage({ type: 'status' });
  if (!st || !st.ok) {
    setLine('st-local', '状态获取失败', 'err');
    return;
  }
  setLine('st-local', st.localOnline ? '在线' : '未连接', st.localOnline ? 'ok' : 'err');
  setLine('st-login', st.taobaoNick ? `已登录：${st.taobaoNick}` : '未登录', st.taobaoNick ? 'ok' : 'warn');
  setLine('st-token', st.hasMtopToken ? '已获取' : '无（先访问一次淘宝页面）', st.hasMtopToken ? 'ok' : 'warn');
  setLine('st-items', `${st.items} 条${st.busy ? ' · 正在采集…' : ''}`, st.busy ? 'warn' : '');
}

$('btn-save').onclick = async () => {
  const patch = {
    localBase: $('cfg-base').value.trim().replace(/\/$/, ''),
    token: $('cfg-token').value.trim(),
  };
  await chrome.runtime.sendMessage({ type: 'save-config', patch });
  try {
    const res = await fetch(`${patch.localBase}/api/ingest/ping`);
    const d = await res.json();
    if (d.needToken && !patch.token) return say('连上了，但本地服务要求采集口令，请填进上面的「采集口令」。', 'err');
    say(`连接成功，商品库已有 ${d.items} 条。`, 'ok');
  } catch (e) {
    say(`连接失败：${e.message}。确认本地服务已启动（npm start）。`, 'err');
  }
  refresh();
};

$('btn-save-adv').onclick = async () => {
  let tpl;
  try {
    tpl = JSON.parse($('cfg-shopdata').value);
  } catch (e) {
    return say(`data 模板不是合法 JSON：${e.message}`, 'err');
  }
  await chrome.runtime.sendMessage({
    type: 'save-config',
    patch: {
      mtopAppKey: $('cfg-appkey').value.trim(),
      mtopGateway: $('cfg-gateway').value.trim(),
      shopItemsApi: { api: $('cfg-shopapi').value.trim(), v: $('cfg-shopv').value.trim(), dataTemplate: tpl },
    },
  });
  say('高级配置已保存。', 'ok');
};

$('btn-open-console').onclick = async () => {
  const { cfg } = await chrome.runtime.sendMessage({ type: 'get-config' });
  chrome.tabs.create({ url: cfg.localBase });
};

$('btn-collect-tab').onclick = async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return say('没有活动标签页', 'err');
  if (!/taobao\.com|tmall\.com/.test(tab.url || '')) {
    return say('当前页面不是淘宝/天猫页面，内容脚本没注入。', 'err');
  }
  const r = await chrome.tabs.sendMessage(tab.id, { type: 'collect-current' }).catch((e) => ({ ok: false, error: e.message }));
  if (!r || !r.ok) return say(`页面取数失败：${r?.error || '页面可能还没加载完'}`, 'err');
  if (!r.item.title) return say('没读到标题，请等页面加载完再试。', 'err');
  const post = await chrome.runtime.sendMessage({ type: 'post-item', item: r.item, sourceUrl: r.item.sourceUrl, via: 'popup' });
  if (post && post.ok) say(`已入库：${r.item.title.slice(0, 26)}`, 'ok');
  else say(`入库失败：${post?.data?.error || post?.error || '本地服务没启动？'}`, 'err');
  refresh();
};

refresh();
setInterval(refresh, 4000);

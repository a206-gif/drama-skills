'use strict';

/**
 * 店铺授权（OAuth 2.0）。
 *
 * 流程：
 *   1. 浏览器打开 https://oauth.taobao.com/authorize?...&redirect_uri=http://127.0.0.1:8787/api/settings/oauth/callback
 *   2. 你用「卖家账号」登录并同意授权
 *   3. 淘宝带 code 跳回本地服务
 *   4. 本地服务用 code 换 access_token，这个 token 就是 TOP 调用里的 session
 *
 * 注意：redirect_uri 必须与开放平台应用里登记的回调地址完全一致。
 * 自用型应用如果登记的是线上域名，就用「手动粘贴 session」那条路（设置页有入口）。
 */

const crypto = require('node:crypto');
const store = require('./store');

const stateStore = new Map(); // state -> { createdAt, port }

function buildAuthorizeUrl({ port = 8787 } = {}) {
  const s = store.getSettings();
  if (!s.appKey) throw new Error('还没填 appkey，无法发起授权。');
  const state = crypto.randomBytes(8).toString('hex');
  stateStore.set(state, { createdAt: Date.now(), port });
  const redirectUri = s.redirectUri || `http://127.0.0.1:${port}/api/settings/oauth/callback`;
  const q = new URLSearchParams({
    response_type: 'code',
    client_id: s.appKey,
    redirect_uri: redirectUri,
    state,
    view: 'web',
  });
  return { url: `${s.authGateway}?${q.toString()}`, state };
}

async function exchangeCode(code) {
  const s = store.getSettings();
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: s.appKey,
    client_secret: s.appSecret,
    code,
    redirect_uri: s.redirectUri,
    state: '',
    view: 'web',
  });
  const res = await fetch(s.tokenGateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString(),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`换取 token 失败，返回非 JSON：${text.slice(0, 300)}`);
  }
  if (json.error || json.error_description) {
    throw new Error(`换取 token 失败：${json.error} ${json.error_description || ''}`);
  }
  const token = json.access_token || json.accessToken;
  if (!token) throw new Error(`返回里没有 access_token：${JSON.stringify(json).slice(0, 300)}`);

  const expiresIn = Number(json.expires_in || json.expiresIn || 0);
  store.updateSettings({
    session: token,
    refreshToken: json.refresh_token || json.refreshToken || '',
    sessionExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000).toISOString() : null,
    nick: json.taobao_user_nick || json.taobaoUserNick || json.sub_taobao_user_nick || '',
    userId: json.taobao_user_id || json.taobaoUserId || '',
  });
  return { ok: true, nick: store.getSettings().nick, expiresAt: store.getSettings().sessionExpiresAt };
}

function verifyState(state) {
  const rec = stateStore.get(state);
  if (!rec) return false;
  stateStore.delete(state);
  return Date.now() - rec.createdAt < 10 * 60 * 1000;
}

/** 用 session 反查是哪家店铺（taobao.user.seller.get），确认授权到的是自己店 */
async function whoami() {
  const top = require('./top-client');
  const r = await top.call('taobao.user.seller.get', {
    fields: 'user_id,nick,sex,seller_credit,type,has_more_pic,item_img_num,props_num',
  });
  const user = r.user || r;
  store.updateSettings({ nick: user.nick || '', userId: String(user.user_id || '') });
  return user;
}

module.exports = { buildAuthorizeUrl, exchangeCode, verifyState, whoami };

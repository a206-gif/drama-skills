'use strict';

/** 设置：TOP 凭据、店铺授权、发布默认值、采集口令 */

const express = require('express');
const store = require('../lib/store');
const oauth = require('../lib/oauth');
const top = require('../lib/top-client');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ ok: true, settings: store.publicSettings(), dataDir: store.DATA_DIR });
});

router.put('/', (req, res) => {
  const patch = { ...(req.body || {}) };
  const s = store.getSettings();
  // 前端回传的是掩码值时不要覆盖真凭据
  if (typeof patch.appSecret === 'string' && patch.appSecret.includes('****')) delete patch.appSecret;
  if (typeof patch.session === 'string' && patch.session.includes('****')) delete patch.session;
  for (const k of ['appKey', 'appSecret', 'session', 'gateway', 'authGateway', 'tokenGateway', 'redirectUri', 'collectorToken']) {
    if (patch[k] === '') patch[k] = '';
  }
  store.updateSettings(patch);
  res.json({ ok: true, settings: store.publicSettings() });
});

/** 凭据自检：调一个最轻的接口，看 appkey/secret/session 是否可用 */
router.post('/test', async (req, res) => {
  const checks = [];
  const s = store.getSettings();

  if (!s.appKey || !s.appSecret) {
    return res.json({
      ok: false,
      checks: [{ name: '凭据完整性', ok: false, detail: 'appkey 或 appsecret 为空' }],
    });
  }
  checks.push({ name: '凭据完整性', ok: true, detail: `appkey=${s.appKey}` });

  // 不需要 session 的接口，验证 appkey+secret+签名是否正确
  try {
    const r = await top.call('taobao.time.get', {}, { needSession: false });
    checks.push({ name: '签名与网关（taobao.time.get）', ok: true, detail: `服务器时间 ${r?.time || JSON.stringify(r).slice(0, 60)}` });
  } catch (e) {
    checks.push({ name: '签名与网关（taobao.time.get）', ok: false, detail: `${e.message}${e.hint ? `｜${e.hint}` : ''}` });
  }

  if (s.session) {
    try {
      const user = await oauth.whoami();
      checks.push({ name: '店铺授权（taobao.user.seller.get）', ok: true, detail: `已授权店铺：${user.nick}（user_id=${user.user_id}）` });
    } catch (e) {
      checks.push({ name: '店铺授权（taobao.user.seller.get）', ok: false, detail: `${e.message}${e.hint ? `｜${e.hint}` : ''}` });
    }
  } else {
    checks.push({ name: '店铺授权', ok: false, detail: '还没有 session，点「授权登录」或手动粘贴 access_token' });
  }

  res.json({ ok: checks.every((c) => c.ok), checks });
});

/** 发起授权：返回一个 URL，前端 window.open 它 */
router.post('/oauth/start', (req, res) => {
  try {
    const { url, state } = oauth.buildAuthorizeUrl({ port: Number(req.body?.port || 8787) });
    res.json({ ok: true, url, state });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

/** 授权回调：淘宝会带 code 跳到本地服务，换到 token 后展示一个可以关掉的页面 */
router.get('/oauth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  const html = (title, detail, ok) =>
    `<!doctype html><html lang="zh"><meta charset="utf-8"><title>${title}</title>
     <body style="font-family:system-ui,-apple-system,'PingFang SC',sans-serif;display:grid;place-items:center;
     min-height:96vh;margin:0;background:#0b1020;color:#e6edf3">
     <div style="max-width:34rem;padding:2rem;border:1px solid ${ok ? '#1f6feb' : '#f85149'};border-radius:14px;background:#11182f">
     <h2 style="margin:0 0 .6rem">${title}</h2><p style="line-height:1.7;color:#9fb0c9;word-break:break-all">${detail}</p>
     <p style="color:#6f8098">这个页面可以关掉了，回控制台继续。</p></div></body></html>`;

  if (error) {
    return res.status(400).send(html('授权被拒绝', `${error} ${error_description || ''}`, false));
  }
  if (!code) return res.status(400).send(html('回调缺少 code', '淘宝没有返回授权码。', false));
  if (state && !oauth.verifyState(state)) {
    return res.status(400).send(html('state 校验失败', '可能是过期或伪造的回调，请重新发起授权。', false));
  }
  try {
    const r = await oauth.exchangeCode(String(code));
    res.send(
      html(
        '授权成功',
        `店铺：<b>${r.nick || '(未返回昵称)'}</b><br>session 已保存到本地 data/settings.json<br>有效期至：${r.expiresAt || '未知'}`,
        true
      )
    );
  } catch (e) {
    res.status(500).send(html('换取 token 失败', e.message, false));
  }
});

/** 手动粘贴 session（自用型应用回调地址对不上本机时的备用路径） */
router.post('/session', (req, res) => {
  const { session, nick } = req.body || {};
  if (!session) return res.status(400).json({ ok: false, error: 'session 为空' });
  store.updateSettings({ session: String(session).trim(), nick: nick || '' });
  res.json({ ok: true, settings: store.publicSettings() });
});

module.exports = router;

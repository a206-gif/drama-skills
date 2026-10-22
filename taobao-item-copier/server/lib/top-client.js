'use strict';

/**
 * TOP 客户端：一次 HTTP 调用 = 组参 → 签名 → POST → 解析 → 错误归一化。
 *
 * 图片类接口（taobao.item.img.upload / taobao.picture.upload）是 multipart/form-data，
 * 签名字符串里只包含文本参数，文件字段不参与签名 —— 这里手写了 multipart 编码，
 * 避免为一个功能引入 form-data 依赖。
 */

const crypto = require('node:crypto');
const { sign, buildParams } = require('./top-sign');
const store = require('./store');

/** TOP 常见错误码 → 人话。搬运场景下最容易踩的几个都在这儿 */
const ERROR_HINTS = {
  'isv.invalid-parameter': '参数不合法。多半是类目属性没填全，或 title/price 格式不对，看下面的 msg 具体字段。',
  'isv.missing-parameter': '缺必填参数。发布商品最常见的是 desc、props、num、price、type、stuff_status。',
  'isv.invalid-permission': '没有这个接口的权限，或 session 对应的店铺不是应用授权的店铺。去开放平台「接口管理」申请权限包。',
  'isv.user-not-exist': 'session 失效或用户不存在，重新授权。',
  'isv.session-expired': 'session 过期（access_token 有效期通常 1 天~半年，看应用类型）。到「设置」重新授权。',
  'isv.app-call-limited': '触发限流。把发布任务里的 stepDelayMs 调大（建议 ≥1000ms）。',
  'isv.remote-service-error': '淘宝服务端内部错误，重试即可；连续出现就把 cid 换一个试试。',
  'isv.item-not-exist': '商品不存在。可能已被删除，或不属于当前 session 的店铺。',
  'isv.wrong-category': '类目不对。用「类目」页重新查叶子类目，非叶子类目不能发布商品。',
  'isv.invalid-item-prop': '类目属性值不合法。用 taobao.itemprops.get 拉该类目允许的属性值再填。',
  'isv.pic-upload-error': '图片上传失败。外链 pic_path 必须是可公网访问的 jpg/png；本地图片走字节上传更稳。',
  'isp.service-unavailable': '服务不可用，稍后重试。',
};

class TopError extends Error {
  constructor(code, msg, subCode, subMsg, raw) {
    super(`[${subCode || code}] ${subMsg || msg}`);
    this.name = 'TopError';
    this.code = code;
    this.msg = msg;
    this.subCode = subCode;
    this.subMsg = subMsg;
    this.hint = ERROR_HINTS[subCode] || ERROR_HINTS[code] || '';
    this.raw = raw;
  }
}

function formEncode(params) {
  return Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&');
}

function buildMultipart(params, files) {
  const boundary = `----TopCopier${crypto.randomBytes(12).toString('hex')}`;
  const chunks = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`,
        'utf8'
      )
    );
  }
  for (const f of files) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${f.name}"; filename="${f.filename || 'file.jpg'}"\r\n` +
          `Content-Type: ${f.contentType || 'image/jpeg'}\r\n\r\n`,
        'utf8'
      ),
      f.content,
      Buffer.from('\r\n', 'utf8')
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, 'utf8'));
  return { body: Buffer.concat(chunks), contentType: `multipart/form-data; boundary=${boundary}` };
}

/** 从 TOP 响应体里挖出错误 */
function extractError(json) {
  const err =
    (json && (json.error_response || json.errorResponse)) ||
    (json && json.error) ||
    null;
  if (!err) return null;
  return new TopError(err.code, err.msg, err.sub_code || err.subCode, err.sub_msg || err.subMsg, json);
}

/**
 * @param {string} method   例如 taobao.item.add
 * @param {object} appParams 业务参数（对象/数组会自动 JSON 序列化）
 * @param {object} opts      { files, signMethod, session, raw }
 */
async function call(method, appParams = {}, opts = {}) {
  const s = store.getSettings();
  const appKey = opts.appKey || s.appKey;
  const appSecret = opts.appSecret || s.appSecret;
  const session = opts.session || s.session;
  if (!appKey || !appSecret) {
    throw new Error('还没配置 appkey / appsecret。到「设置」页填，或在 .env 里配 TOP_APP_KEY / TOP_APP_SECRET。');
  }
  if (opts.needSession !== false && !session) {
    throw new Error('还没有店铺授权（session）。到「设置」页点「授权登录」，或手动粘贴 access_token。');
  }

  const signMethod = opts.signMethod || 'md5';
  const params = buildParams(method, appParams, {
    appKey,
    session,
    signMethod,
    timestamp: opts.timestamp,
  });
  params.sign = sign(params, appSecret, signMethod);

  const gateway = opts.gateway || s.gateway;
  const url = `${gateway}?${formEncode(params)}`;

  let init;
  if (opts.files && opts.files.length) {
    // multipart：文件不进签名，所以从 params 里剔除后再签（上面已按无文件签好）
    const { body, contentType } = buildMultipart(params, opts.files);
    init = { method: 'POST', headers: { 'Content-Type': contentType }, body };
  } else if (opts.method === 'GET') {
    init = { method: 'GET' };
  } else {
    init = {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
      body: formEncode(params),
    };
  }

  let res, text;
  try {
    res = await fetch(opts.multipartUrl || url, init);
    text = await res.text();
  } catch (e) {
    throw new Error(`调用 ${method} 网络失败：${e.message}（本机能否访问 eco.taobao.com？）`);
  }

  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`调用 ${method} 返回非 JSON：${text.slice(0, 300)}`);
  }
  const err = extractError(json);
  if (err) throw err;
  if (opts.raw) return json;

  // TOP 的响应包一层，形如 { "taobao_item_add_response": { "item": {...} } }
  const keys = Object.keys(json);
  const respKey = keys.find((k) => k.endsWith('_response')) || keys[0];
  return respKey ? json[respKey] : json;
}

module.exports = { call, TopError, ERROR_HINTS, buildMultipart };

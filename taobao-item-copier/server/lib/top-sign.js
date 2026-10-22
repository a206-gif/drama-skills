'use strict';

/**
 * 淘宝开放平台（TOP）签名。
 *
 * sign_method=md5  : sign = MD5( secret + k1v1k2v2... + secret )      （k 按字典序升序）
 * sign_method=hmac : sign = HMAC-MD5( k1v1k2v2... , secret )
 * 结果大写十六进制。timestamp 用北京时间 "YYYY-MM-DD HH:mm:ss"，服务端容差 15 分钟。
 */

const crypto = require('node:crypto');

function md5hex(str) {
  return crypto.createHash('md5').update(str, 'utf8').digest('hex');
}

function hmacMd5hex(str, key) {
  return crypto.createHmac('md5', key).update(str, 'utf8').digest('hex');
}

/** 北京时间字符串（TOP 要求 GMT+8，与你机器所在时区无关） */
function topTimestamp(d = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);
  const p = Object.fromEntries(parts.map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day} ${hour}:${p.minute}:${p.second}`;
}

/** 拼出待签名字符串：按 key 字典序，key 与 value 直接相连，无分隔符 */
function baseString(params) {
  return Object.keys(params)
    .filter((k) => k !== 'sign' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map((k) => `${k}${params[k]}`)
    .join('');
}

function sign(params, secret, method = 'md5') {
  const base = baseString(params);
  const hex =
    method === 'hmac' ? hmacMd5hex(base, secret) : md5hex(`${secret}${base}${secret}`);
  return hex.toUpperCase();
}

/** 组装一次调用的全部公共参数（不含 sign） */
function buildParams(method, appParams, { appKey, session, format = 'json', v = '2.0', signMethod = 'md5', timestamp }) {
  const params = {
    method,
    app_key: appKey,
    timestamp: timestamp || topTimestamp(),
    format,
    v,
    sign_method: signMethod,
    simplify: 'false',
  };
  if (session) params.session = session;
  for (const [k, val] of Object.entries(appParams || {})) {
    if (val === undefined || val === null || val === '') continue;
    params[k] = typeof val === 'object' ? JSON.stringify(val) : String(val);
  }
  return params;
}

module.exports = { md5hex, hmacMd5hex, topTimestamp, baseString, sign, buildParams };

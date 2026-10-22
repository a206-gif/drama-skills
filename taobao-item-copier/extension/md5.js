/**
 * MD5（纯 JS，UTF-8 安全）。
 *
 * MV3 的 service worker 只有 SubtleCrypto，而 SubtleCrypto 不支持 MD5，
 * mtop 的 sign 又必须是 md5，所以这里自带一份实现。
 * 经典 JS-MD5 算法，用 Uint32Array 状态 + 逐字符 UTF-8 编码，避免中文标题算错签名。
 */
function safeAdd(x, y) {
  const lsw = (x & 0xffff) + (y & 0xffff);
  return (((x >>> 16) + (y >>> 16) + (lsw >>> 16)) << 16) | (lsw & 0xffff);
}
function rotl(num, cnt) {
  return (num << cnt) | (num >>> (32 - cnt));
}
function cmn(q, a, b, x, s, t) {
  return safeAdd(rotl(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function ff(a, b, c, d, x, s, t) { return cmn((b & c) | (~b & d), a, b, x, s, t); }
function gg(a, b, c, d, x, s, t) { return cmn((b & d) | (c & ~d), a, b, x, s, t); }
function hh(a, b, c, d, x, s, t) { return cmn(b ^ c ^ d, a, b, x, s, t); }
function ii(a, b, c, d, x, s, t) { return cmn(c ^ (b | ~d), a, b, x, s, t); }

function coreMD5(x, len) {
  x[len >> 5] |= 0x80 << (len % 32);
  x[(((len + 64) >>> 9) << 4) + 14] = len;

  let a = 1732584193, b = -271733879, c = -1732584194, d = 271733878;

  for (let i = 0; i < x.length; i += 16) {
    const oa = a, ob = b, oc = c, od = d;

    a = ff(a, b, c, d, x[i] || 0, 7, -680876936);
    d = ff(d, a, b, c, x[i + 1] || 0, 12, -389564586);
    c = ff(c, d, a, b, x[i + 2] || 0, 17, 606105819);
    b = ff(b, c, d, a, x[i + 3] || 0, 22, -1044525330);
    a = ff(a, b, c, d, x[i + 4] || 0, 7, -176418897);
    d = ff(d, a, b, c, x[i + 5] || 0, 12, 1200080426);
    c = ff(c, d, a, b, x[i + 6] || 0, 17, -1473231341);
    b = ff(b, c, d, a, x[i + 7] || 0, 22, -45705983);
    a = ff(a, b, c, d, x[i + 8] || 0, 7, 1770035416);
    d = ff(d, a, b, c, x[i + 9] || 0, 12, -1958414417);
    c = ff(c, d, a, b, x[i + 10] || 0, 17, -42063);
    b = ff(b, c, d, a, x[i + 11] || 0, 22, -1990404162);
    a = ff(a, b, c, d, x[i + 12] || 0, 7, 1804603682);
    d = ff(d, a, b, c, x[i + 13] || 0, 12, -40341101);
    c = ff(c, d, a, b, x[i + 14] || 0, 17, -1502002290);
    b = ff(b, c, d, a, x[i + 15] || 0, 22, 1236535329);

    a = gg(a, b, c, d, x[i + 1] || 0, 5, -165796510);
    d = gg(d, a, b, c, x[i + 6] || 0, 9, -1069501632);
    c = gg(c, d, a, b, x[i + 11] || 0, 14, 643717713);
    b = gg(b, c, d, a, x[i] || 0, 20, -373897302);
    a = gg(a, b, c, d, x[i + 5] || 0, 5, -701558691);
    d = gg(d, a, b, c, x[i + 10] || 0, 9, 38016083);
    c = gg(c, d, a, b, x[i + 15] || 0, 14, -660478335);
    b = gg(b, c, d, a, x[i + 4] || 0, 20, -405537848);
    a = gg(a, b, c, d, x[i + 9] || 0, 5, 568446438);
    d = gg(d, a, b, c, x[i + 14] || 0, 9, -1019803690);
    c = gg(c, d, a, b, x[i + 3] || 0, 14, -187363961);
    b = gg(b, c, d, a, x[i + 8] || 0, 20, 1163531501);
    a = gg(a, b, c, d, x[i + 13] || 0, 5, -1444681467);
    d = gg(d, a, b, c, x[i + 2] || 0, 9, -51403784);
    c = gg(c, d, a, b, x[i + 7] || 0, 14, 1735328473);
    b = gg(b, c, d, a, x[i + 12] || 0, 20, -1926607734);

    a = hh(a, b, c, d, x[i + 5] || 0, 4, -378558);
    d = hh(d, a, b, c, x[i + 8] || 0, 11, -2022574463);
    c = hh(c, d, a, b, x[i + 11] || 0, 16, 1839030562);
    b = hh(b, c, d, a, x[i + 14] || 0, 23, -35309556);
    a = hh(a, b, c, d, x[i + 1] || 0, 4, -1530992060);
    d = hh(d, a, b, c, x[i + 4] || 0, 11, 1272893353);
    c = hh(c, d, a, b, x[i + 7] || 0, 16, -155497632);
    b = hh(b, c, d, a, x[i + 10] || 0, 23, -1094730640);
    a = hh(a, b, c, d, x[i + 13] || 0, 4, 681279174);
    d = hh(d, a, b, c, x[i] || 0, 11, -358537222);
    c = hh(c, d, a, b, x[i + 3] || 0, 16, -722521979);
    b = hh(b, c, d, a, x[i + 6] || 0, 23, 76029189);
    a = hh(a, b, c, d, x[i + 9] || 0, 4, -640364487);
    d = hh(d, a, b, c, x[i + 12] || 0, 11, -421815835);
    c = hh(c, d, a, b, x[i + 15] || 0, 16, 530742520);
    b = hh(b, c, d, a, x[i + 2] || 0, 23, -995338651);

    a = ii(a, b, c, d, x[i] || 0, 6, -198630844);
    d = ii(d, a, b, c, x[i + 7] || 0, 10, 1126891415);
    c = ii(c, d, a, b, x[i + 14] || 0, 15, -1416354905);
    b = ii(b, c, d, a, x[i + 5] || 0, 21, -57434055);
    a = ii(a, b, c, d, x[i + 12] || 0, 6, 1700485571);
    d = ii(d, a, b, c, x[i + 3] || 0, 10, -1894986606);
    c = ii(c, d, a, b, x[i + 10] || 0, 15, -1051523);
    b = ii(b, c, d, a, x[i + 1] || 0, 21, -2054922799);
    a = ii(a, b, c, d, x[i + 8] || 0, 6, 1873313359);
    d = ii(d, a, b, c, x[i + 15] || 0, 10, -30611744);
    c = ii(c, d, a, b, x[i + 6] || 0, 15, -1560198380);
    b = ii(b, c, d, a, x[i + 13] || 0, 21, 1309151649);
    a = ii(a, b, c, d, x[i + 4] || 0, 6, -145523070);
    d = ii(d, a, b, c, x[i + 11] || 0, 10, -1120210379);
    c = ii(c, d, a, b, x[i + 2] || 0, 15, 718787259);
    b = ii(b, c, d, a, x[i + 9] || 0, 21, -343485551);

    a = safeAdd(a, oa); b = safeAdd(b, ob); c = safeAdd(c, oc); d = safeAdd(d, od);
  }
  return [a, b, c, d];
}

/** 字符串 → 32 位小端字数组（按 UTF-8 字节） */
function strToWords(str) {
  const bytes = new TextEncoder().encode(String(str));
  const words = [];
  for (let i = 0; i < bytes.length; i++) {
    words[i >> 2] = (words[i >> 2] || 0) | (bytes[i] << ((i % 4) * 8));
  }
  return words;
}

function md5(str) {
  const words = coreMD5(strToWords(str), new TextEncoder().encode(String(str)).length * 8);
  const hex = '0123456789abcdef';
  let out = '';
  for (const w of words) {
    for (let j = 0; j < 4; j++) {
      out += hex.charAt((w >> (j * 8 + 4)) & 0x0f) + hex.charAt((w >> (j * 8)) & 0x0f);
    }
  }
  return out;
}

// service worker 用 module 方式引入，内容脚本用全局方式
if (typeof module !== 'undefined' && module.exports) module.exports = { md5 };
if (typeof globalThis !== 'undefined') globalThis.__copierMd5 = md5;
try { if (typeof window !== 'undefined') window.__copierMd5 = md5; } catch {}

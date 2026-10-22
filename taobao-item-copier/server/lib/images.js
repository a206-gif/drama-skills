'use strict';

/**
 * 图片处理。
 *
 * 淘宝发布接口传外链（pic_path）时，外链必须公网可访问且是它认可的域名，
 * 别人店铺的图片直接引用经常被判「盗图」或拉取失败。稳妥做法是：
 *   下载 → 按内容 MD5 存本地（天然去重）→ 发布时以字节上传（image 字段）
 *
 * 这里同时保留了「远程直传」模式，省流量、速度快，适合先试跑。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const store = require('./store');

// 惰性求值：数据目录可被测试重定向到临时目录
const imgDir = () => path.join(store.DATA_DIR, 'images');

const EXT_BY_CONTENT_TYPE = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/bmp': '.bmp',
};

// 淘宝主图要求：jpg/png，≤3MB，建议 800x800 以上正方形
const MAX_BYTES = 3 * 1024 * 1024;

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex');
}

function isAllowedUrl(u) {
  // 只从图片 CDN 拉，避免被人拿这个本地服务当 SSRF 跳板
  return /^https?:\/\/([a-z0-9-]+\.)*(alicdn\.com|taobaocdn\.com|tmall\.com|taobao\.com|1688\.com|aliimg\.com)(\/|$)/i.test(
    String(u || '')
  );
}

/**
 * 下载一张图到本地图片库，按内容 MD5 命名（重复引用同一张图不会重复下载）。
 * @returns {Promise<{file, url, bytes, contentType, deduped}>}
 */
async function downloadImage(remoteUrl, opts = {}) {
  const url = String(remoteUrl || '').trim();
  if (!url) throw new Error('图片地址为空');
  if (!opts.allowAnyUrl && !isAllowedUrl(url)) {
    throw new Error(`拒绝下载非淘系 CDN 的图片地址：${url}（如确需下载，把 allowAnyUrl 设为 true）`);
  }

  fs.mkdirSync(imgDir(), { recursive: true });

  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        Referer: 'https://item.taobao.com/',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8',
      },
      signal: AbortSignal.timeout(opts.timeoutMs || 30000),
    });
  } catch (e) {
    throw new Error(`下载失败 ${url}：${e.message}`);
  }
  if (!res.ok) throw new Error(`下载失败 ${url}：HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error(`下载失败 ${url}：内容为空`);
  if (buf.length > MAX_BYTES && !opts.allowOversize) {
    throw new Error(`图片 ${(buf.length / 1024 / 1024).toFixed(2)}MB 超过淘宝 3MB 上限：${url}`);
  }

  const contentType = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  const hash = md5(buf);
  const ext = EXT_BY_CONTENT_TYPE[contentType] || guessExtFromUrl(url) || '.jpg';
  const filename = `${hash}${ext}`;
  const file = path.join(imgDir(), filename);
  const deduped = fs.existsSync(file);
  if (!deduped) fs.writeFileSync(file, buf);

  return {
    file,
    filename,
    hash,
    bytes: buf.length,
    contentType: contentType || 'image/jpeg',
    url: `/media/${filename}`,
    remoteUrl: url,
    deduped,
  };
}

function guessExtFromUrl(url) {
  const m = /\.(jpe?g|png|webp|gif|bmp)(?:[?#]|$)/i.exec(String(url || ''));
  return m ? `.${m[1].toLowerCase().replace('jpeg', 'jpg')}` : '';
}

/**
 * 批量下载一条商品的所有图片（主图 + 属性图 + 详情图），并把 URL 改写成本地地址。
 * 逐张并发限流 3，避免打爆对方 CDN 触发风控。
 */
async function localizeItemImages(item, opts = {}) {
  const report = { ok: [], failed: [], skipped: 0 };
  const limit = opts.concurrency || 3;

  const jobs = [];
  const queue = [];

  const add = (kind, index, url) => {
    if (!url) return;
    if (/^\/media\//.test(url) || /^data:/.test(url)) {
      report.skipped++;
      return;
    }
    queue.push({ kind, index, url });
  };

  (item.images || []).forEach((u, i) => add('image', i, u));
  (item.propImages || []).forEach((p, i) => add('propImage', i, p.url));
  if (opts.includeDescImages !== false) (item.descImages || []).forEach((u, i) => add('descImage', i, u));

  const next = { images: [...(item.images || [])], propImages: [...(item.propImages || [])], descImages: [...(item.descImages || [])] };

  async function worker() {
    while (queue.length) {
      const job = queue.shift();
      try {
        const r = await downloadImage(job.url, opts);
        report.ok.push({ kind: job.kind, url: job.url, local: r.url, bytes: r.bytes });
        if (job.kind === 'image') next.images[job.index] = r.url;
        else if (job.kind === 'propImage') next.propImages[job.index] = { ...next.propImages[job.index], url: r.url, localFile: r.file };
        else next.descImages[job.index] = r.url;
      } catch (e) {
        report.failed.push({ kind: job.kind, url: job.url, error: e.message });
      }
    }
  }

  for (let i = 0; i < Math.min(limit, queue.length || 1); i++) jobs.push(worker());
  await Promise.all(jobs);

  // 详情 HTML 里的远程图地址也换成本地
  let description = item.description || '';
  for (const rec of report.ok) {
    if (rec.url && description.includes(rec.url)) description = description.split(rec.url).join(rec.local);
  }

  return { images: next.images.filter(Boolean), propImages: next.propImages, descImages: next.descImages, description, report };
}

/** 本地文件 → { content, filename, contentType }，供 multipart 上传 */
function readFileForUpload(localUrlOrPath) {
  const p = String(localUrlOrPath || '').startsWith('/media/')
    ? path.join(imgDir(), path.basename(localUrlOrPath))
    : localUrlOrPath;
  if (!fs.existsSync(p)) throw new Error(`本地图片不存在：${p}`);
  const content = fs.readFileSync(p);
  const ext = path.extname(p).toLowerCase();
  const contentType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/gif' ? 'image/gif' : 'image/jpeg';
  return { content, filename: path.basename(p), contentType, bytes: content.length };
}

function listLocalImages(limit = 500) {
  fs.mkdirSync(imgDir(), { recursive: true });
  return fs
    .readdirSync(imgDir())
    .filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f))
    .slice(0, limit)
    .map((f) => {
      const st = fs.statSync(path.join(imgDir(), f));
      return { filename: f, url: `/media/${f}`, bytes: st.size, mtime: st.mtime.toISOString() };
    });
}

function removeLocalImage(filename) {
  const p = path.join(imgDir(), path.basename(String(filename)));
  if (fs.existsSync(p)) fs.unlinkSync(p);
  return true;
}

module.exports = {
  get IMG_DIR() {
    return imgDir();
  },
  MAX_BYTES,
  downloadImage,
  localizeItemImages,
  readFileForUpload,
  listLocalImages,
  removeLocalImage,
  isAllowedUrl,
};

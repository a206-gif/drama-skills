'use strict';

/**
 * 极简 JSON 文件存储。
 *
 * 为什么不用 SQLite：搬运台是单机单用户工具，商品量级在几千条以内，
 * 一个 JSON 文件 + 原子写入足够，且省掉原生依赖（node-gyp 在 Windows 上装起来很痛苦）。
 * 结构见 data/db.json。
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

let DATA_DIR = path.join(__dirname, '..', '..', 'data');
// 路径必须在读写时现算：测试会把 DATA_DIR 指到临时目录，
// 如果在模块加载时就拼好常量，改 DATA_DIR 不会生效，数据会写进真实目录。
const dbFile = () => path.join(DATA_DIR, 'db.json');
const settingsFile = () => path.join(DATA_DIR, 'settings.json');

const DEFAULT_SETTINGS = {
  appKey: '',
  appSecret: '',
  session: '',
  sessionExpiresAt: null,
  nick: '',
  gateway: 'https://eco.taobao.com/router/rest',
  authGateway: 'https://oauth.taobao.com/authorize',
  tokenGateway: 'https://oauth.taobao.com/token',
  redirectUri: 'http://127.0.0.1:8787/api/settings/oauth/callback',
  // 发布默认值
  publish: {
    defaultCategoryId: '',
    defaultPostageId: '',
    defaultLocationState: '',
    defaultLocationCity: '',
    defaultApproveStatus: 'instock', // instock=仓库中(更安全) / onsale=立即上架
    defaultFreightPayer: 'seller',
    defaultValidThru: 7,
    defaultHasInvoice: true,
    defaultHasWarranty: true,
    defaultHasQuota: false,
    defaultAuctionPoint: 0,
    // 图片走外链直传（pic_path）还是先下载到本地再传字节
    imageMode: 'remote',
    stepDelayMs: 600,
  },
  // 采集端口令：扩展里填一样的，防止本机其他网页乱投数据
  collectorToken: '',
};

let db = { items: [], tasks: [], shops: [] };
let settings = { ...DEFAULT_SETTINGS };
let saveTimer = null;
let initialized = false;

function init({ force = false } = {}) {
  // 幂等：server/index.js 被 require 时会调一次，测试可能已经先调过。
  // 重复 init 会重新生成采集口令，把测试里刻意清空的值又覆盖回去。
  if (initialized && !force) return;
  initialized = true;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(path.join(DATA_DIR, 'images'), { recursive: true });
  if (fs.existsSync(dbFile())) {
    try {
      db = JSON.parse(fs.readFileSync(dbFile(), 'utf8'));
    } catch (e) {
      console.error('[store] db.json 损坏，已备份后重建：', e.message);
      fs.renameSync(dbFile(), `${dbFile()}.broken-${Date.now()}`);
    }
  }
  db.items = db.items || [];
  db.tasks = db.tasks || [];
  db.shops = db.shops || [];

  if (fs.existsSync(settingsFile())) {
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(fs.readFileSync(settingsFile(), 'utf8')) };
      settings.publish = { ...DEFAULT_SETTINGS.publish, ...(settings.publish || {}) };
    } catch (e) {
      console.error('[store] settings.json 解析失败，使用默认值：', e.message);
    }
  }
  // 环境变量兜底（.env 里配的优先级低于网页里已保存的）
  if (!settings.appKey && process.env.TOP_APP_KEY) settings.appKey = process.env.TOP_APP_KEY;
  if (!settings.appSecret && process.env.TOP_APP_SECRET) settings.appSecret = process.env.TOP_APP_SECRET;
  if (!settings.session && process.env.TOP_SESSION) settings.session = process.env.TOP_SESSION;
  if (process.env.TOP_GATEWAY) settings.gateway = process.env.TOP_GATEWAY;

  if (!settings.collectorToken) {
    settings.collectorToken = crypto.randomBytes(8).toString('hex');
    saveSettingsNow();
  }
}

function writeAtomic(file, data) {
  // 目录可能在运行中被清掉（测试重定向数据目录时尤其常见），写之前确保存在
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeAtomic(dbFile(), db);
    } catch (e) {
      console.error('[store] 落盘失败：', e.message);
    }
  }, 120);
}

function saveNow() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  writeAtomic(dbFile(), db);
}

function saveSettingsNow() {
  writeAtomic(settingsFile(), settings);
}

/* ---------------- settings ---------------- */

function getSettings() {
  return settings;
}

function updateSettings(patch) {
  if (patch.publish) {
    settings.publish = { ...settings.publish, ...patch.publish };
    delete patch.publish;
  }
  Object.assign(settings, patch);
  saveSettingsNow();
  return settings;
}

/** 返回给前端的版本：secret 与 session 只给掩码，避免在页面上明文躺着 */
function publicSettings() {
  const mask = (v) => (v ? `${String(v).slice(0, 4)}****${String(v).slice(-4)}` : '');
  return {
    ...settings,
    appSecret: mask(settings.appSecret),
    session: mask(settings.session),
    hasAppSecret: Boolean(settings.appSecret),
    hasSession: Boolean(settings.session),
  };
}

/* ---------------- items ---------------- */

function uid(prefix) {
  return `${prefix}_${Date.now().toString(36)}${crypto.randomBytes(3).toString('hex')}`;
}

function all() {
  return db.items;
}

function get(id) {
  return db.items.find((it) => it.id === id) || null;
}

function findBySource(sourceItemId, sourceUrl) {
  return (
    db.items.find(
      (it) =>
        (sourceItemId && it.sourceItemId === String(sourceItemId)) ||
        (sourceUrl && it.sourceUrl === sourceUrl)
    ) || null
  );
}

function upsert(item) {
  const idx = db.items.findIndex((it) => it.id === item.id);
  if (idx >= 0) db.items[idx] = item;
  else db.items.unshift(item);
  scheduleSave();
  return item;
}

function create(partial) {
  const now = new Date().toISOString();
  const item = {
    id: uid('it'),
    createdAt: now,
    updatedAt: now,
    status: 'collected', // collected | ready | publishing | published | failed
    publishedItemId: null,
    publishError: null,
    ...partial,
  };
  db.items.unshift(item);
  scheduleSave();
  return item;
}

function patch(id, changes) {
  const it = get(id);
  if (!it) return null;
  Object.assign(it, changes, { updatedAt: new Date().toISOString() });
  scheduleSave();
  return it;
}

function remove(ids) {
  const set = new Set(ids);
  const before = db.items.length;
  db.items = db.items.filter((it) => !set.has(it.id));
  scheduleSave();
  return before - db.items.length;
}

/* ---------------- shops ---------------- */

function listShops() {
  return db.shops;
}

function upsertShop(shop) {
  const key = shop.shopId || shop.shopUrl || shop.title;
  const idx = db.shops.findIndex((s) => (s.shopId || s.shopUrl || s.title) === key);
  const rec = {
    ...shop,
    lastCollectAt: new Date().toISOString(),
    itemCount: shop.itemCount ?? 0,
  };
  if (idx >= 0) db.shops[idx] = { ...db.shops[idx], ...rec };
  else db.shops.unshift(rec);
  scheduleSave();
  return rec;
}

/* ---------------- tasks ---------------- */

function listTasks() {
  return db.tasks.slice(0, 200);
}

function createTask(t) {
  const task = {
    id: uid('tk'),
    createdAt: new Date().toISOString(),
    state: 'pending', // pending | running | done | failed | cancelled
    ...t,
    logs: t.logs || [],
  };
  db.tasks.unshift(task);
  if (db.tasks.length > 200) db.tasks.length = 200;
  scheduleSave();
  return task;
}

function getTask(id) {
  return db.tasks.find((t) => t.id === id) || null;
}

function patchTask(id, changes) {
  const t = getTask(id);
  if (!t) return null;
  Object.assign(t, changes);
  scheduleSave();
  return t;
}

function logTask(id, level, message, extra) {
  const t = getTask(id);
  if (!t) return;
  t.logs.push({ at: new Date().toISOString(), level, message, ...(extra || {}) });
  if (t.logs.length > 500) t.logs.splice(0, t.logs.length - 500);
  scheduleSave();
  return t;
}

function setDataDir(dir) {
  DATA_DIR = path.resolve(dir);
  return DATA_DIR;
}

module.exports = {
  get DATA_DIR() {
    return DATA_DIR;
  },
  setDataDir,
  init,
  saveNow,
  getSettings,
  updateSettings,
  publicSettings,
  all,
  get,
  findBySource,
  create,
  upsert,
  patch,
  remove,
  listShops,
  upsertShop,
  listTasks,
  createTask,
  getTask,
  patchTask,
  logTask,
  uid,
};

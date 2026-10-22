'use strict';

/**
 * 发布页自动填表引擎。
 *
 * 设计目标：不依赖淘宝发布页的具体 class 名（那些一改版就废），
 * 而是按「字段的可见文字标签」去定位控件 —— 找到写着「宝贝标题」的那一块，
 * 再在它附近找 input/textarea。这条路耐改版得多。
 *
 * 这个文件是「环境无关」的纯逻辑：所有 DOM 操作都通过传入的 env 完成，
 * 所以能在 Node 里用假 DOM 跑测试，也能在真实发布页里跑。
 *
 * env 需要提供（浏览器里就是 document / window 本身的能力）：
 *   env.querySelectorAll(sel)         -> 元素数组
 *   env.createElement(tag)            -> 元素
 *   env.createFile(bytes, name, type) -> File 对象（注入图片用）
 *   env.File / env.DataTransfer        -> 构造 FileList 用（浏览器原生）
 *
 * 元素需要支持的属性/方法（标准 DOM 都有）：
 *   tagName, type, value, textContent, innerText, placeholder, disabled, files,
 *   className, id, htmlFor/for, accept, closest(sel), matches(sel),
 *   querySelectorAll(sel), getAttribute(n), setAttribute(n,v), removeAttribute(n),
 *   appendChild(el), click(), focus(),
 *   dispatchEvent(evt) + env.createEvent(type, opts)
 */

const FIELD_ALIASES = {
  title: ['宝贝标题', '商品标题', '标题', 'title'],
  price: ['一口价', '价格', '销售价', 'price'],
  quantity: ['库存', '数量', '总库存', 'quantity', 'stock'],
  outerId: ['商家编码', '外部编码', '货号', 'outerid'],
  description: ['宝贝详情', '商品详情', '图文详情', '详细描述', '详情'],
};

/** 判断一个元素是不是"文字标签"（label / 字段名 span / dt 等） */
function isLabelEl(el) {
  const tag = (el.tagName || '').toLowerCase();
  if (tag === 'label') return true;
  const cls = String(el.className || '');
  return /label|field-?name|form-?label|title|term/i.test(cls) && !el.querySelector?.('input,textarea');
}

/**
 * 找出"这个字段叫什么"。
 *
 * 关键：不能一路往上把祖先文字全拼进来 —— 根节点的 textContent 包含整页所有标签，
 * 那样任何字段都会"命中"第一个标签名。所以：
 *   1) 先看 <label for=id> 精确关联，和元素自身的 placeholder/aria-label/name
 *   2) 再往上找最近的、且「只包含这一个输入控件」的容器，取它里面的 label / 短文本
 *      一旦某个祖先包含多个控件（说明是共享外层），就停，避免串味
 */
function contextText(el) {
  const parts = [];
  const id = el.id || el.getAttribute?.('id');
  if (id && el.ownerDocument) {
    const lbl = el.ownerDocument.querySelector?.(`label[for="${id}"]`);
    if (lbl) parts.push((lbl.textContent || '').trim());
  }
  if (el.placeholder) parts.push(el.placeholder);
  const aria = el.getAttribute?.('aria-label');
  if (aria) parts.push(aria);
  if (el.name) parts.push(el.name);

  let node = el.parentElement;
  let up = 0;
  while (node && up < 5) {
    const all = node.querySelectorAll?.('input,textarea,select') || [];
    // hidden input 常和可见框放在同一个字段容器里（存真值），数控件时要排除它，
    // 否则一个"标题"容器因为多了个 hidden 就被判成共享容器，标签就丢了
    const controls = all.filter((c) => (c.type || '').toLowerCase() !== 'hidden');
    if (controls.length > 1) break; // 真的共享容器（多个可见控件），再往上会串到别的字段
    const lbl = node.querySelector?.(':scope > label');
    if (lbl) {
      parts.push((lbl.textContent || '').trim());
      break;
    }
    const own = node.textContent || '';
    if (own.trim() && own.trim().length <= 12 && !/[。：:]$/.test(own.trim())) {
      parts.push(own.trim());
      break;
    }
    node = node.parentElement;
    up++;
  }
  return parts.join(' ');
}

/**
 * 按字段名找到最匹配的输入控件。
 * @returns {element|null}
 */
function findField(env, names, kinds = ['input', 'textarea']) {
  const list = typeof names === 'string' ? [names] : names;
  const selector = kinds.map((k) => `${k}:not([disabled]):not([readonly])`).join(',');
  const candidates = env.querySelectorAll(selector);
  let best = null;
  let bestScore = 0;

  for (const el of candidates) {
    const tag = (el.tagName || '').toLowerCase();
    const type = (el.type || '').toLowerCase();
    // 只接受文本类输入；跳过 checkbox/radio/file/hidden/button/submit
    if (tag === 'input' && !['text', 'number', 'search', 'tel', ''].includes(type)) continue;
    if (tag !== 'input' && tag !== 'textarea') continue;

    const hay = [
      el.placeholder || '',
      el.getAttribute?.('aria-label') || '',
      el.getAttribute?.('data-field') || '',
      el.name || '',
      el.id || '',
      contextText(el),
    ]
      .join(' ')
      .toLowerCase();

    for (let i = 0; i < list.length; i++) {
      const needle = list[i].toLowerCase();
      if (hay.includes(needle)) {
        // 越靠前的别名权重越高；上下文命中的比 placeholder 命中的更可信
        const aliasScore = (list.length - i) * 10;
        const ctxScore = contextText(el).toLowerCase().includes(needle) ? 5 : 0;
        const score = aliasScore + ctxScore;
        if (score > bestScore) {
          bestScore = score;
          best = el;
        }
      }
    }
  }
  return best;
}

/**
 * 给输入框写值，并派发 React / Vue 会监听的事件。
 * 直接改 .value 不派发事件的话，这类框架的内部 state 不会更新，提交时还是空的。
 */
function setNativeValue(env, el, value) {
  const proto = el.tagName === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement';
  // 真实浏览器里用原生 setter 绕过框架对 value 的劫持
  const desc = Object.getOwnPropertyDescriptor(env[proto]?.prototype || {}, 'value');
  if (desc && desc.set) desc.set.call(el, value);
  else el.value = value;

  el.dispatchEvent(env.createEvent('input', { bubbles: true }));
  el.dispatchEvent(env.createEvent('change', { bubbles: true }));
  el.dispatchEvent(env.createEvent('blur', { bubbles: true }));
}

/** 往富文本详情区写 HTML（contenteditable 或 textarea） */
function setRichText(env, el, html) {
  if (!el) return false;
  if ((el.tagName || '').toLowerCase() === 'textarea') {
    setNativeValue(env, el, html);
    return true;
  }
  if (el.getAttribute?.('contenteditable') === 'true' || el.isContentEditable) {
    el.innerHTML = html;
    el.dispatchEvent(env.createEvent('input', { bubbles: true }));
    return true;
  }
  return false;
}

/**
 * 把图片注入 <input type="file">。
 * 用 DataTransfer 构造 FileList，再派发 change，让页面自己的上传逻辑接管
 * （页面带着你的登录态，上传走的是它自己的接口，稳）。
 */
function injectFiles(env, fileInput, files) {
  if (!fileInput) return false;
  if (!env.DataTransfer || !env.createFile) return false;
  try {
    const dt = new env.DataTransfer();
    for (const f of files) {
      const file = env.createFile(f.bytes, f.name, f.type || 'image/jpeg');
      dt.items.add(file);
    }
    fileInput.files = dt.files;
    fileInput.dispatchEvent(env.createEvent('change', { bubbles: true }));
    return true;
  } catch {
    return false;
  }
}

function findFileInput(env, hint = '') {
  const inputs = env.querySelectorAll('input[type="file"]');
  if (!inputs.length) return null;
  if (!hint) return inputs[0];
  const h = hint.toLowerCase();
  // 优先 accept 里含 image、或上下文提到"主图/图片"的那个
  const scored = inputs
    .map((el) => {
      const accept = (el.getAttribute?.('accept') || '').toLowerCase();
      const ctx = contextText(env, el).toLowerCase();
      let s = 0;
      if (accept.includes('image')) s += 10;
      if (h && ctx.includes(h)) s += 5;
      if (/主图|图片|上传/.test(ctx)) s += 3;
      return { el, s };
    })
    .sort((a, b) => b.s - a.s);
  return scored[0].el;
}

/**
 * 填一整条商品。返回每个字段的结果，供 UI 显示"哪些填好了、哪些要你手动"。
 * 不因某个字段失败就中断 —— 能填多少填多少，剩下的标出来。
 */
async function fillItem(env, item, opts = {}) {
  const report = { filled: [], manual: [], failed: [] };
  const delay = (ms) => new Promise((r) => setTimeout(r, ms));
  const stepDelay = opts.stepDelay ?? 260;

  async function tryField(key, names, value, kind) {
    if (value === undefined || value === null || value === '') {
      report.manual.push({ key, reason: '无数据' });
      return;
    }
    let el = null;
    // 价格/库存是数字框，只在 input 里找；文本类 input、textarea 都可以
    const kinds = kind === 'number' ? ['input'] : ['input', 'textarea'];
    // 发布页字段是异步渲染的，重试几次等它出现
    for (let attempt = 0; attempt < (opts.retries ?? 6); attempt++) {
      el = findField(env, names, kinds);
      if (el) break;
      await delay(400);
    }
    if (!el) {
      report.manual.push({ key, label: names[0], reason: '页面上没找到这个字段（可能改版了或需要先选类目）' });
      return;
    }
    try {
      setNativeValue(env, el, String(value));
      report.filled.push({ key, label: names[0], value: String(value).slice(0, 40) });
      await delay(stepDelay);
    } catch (e) {
      report.failed.push({ key, label: names[0], error: e.message });
    }
  }

  await tryField('title', FIELD_ALIASES.title, item.title, 'text');
  await tryField('price', FIELD_ALIASES.price, item.price, 'number');
  await tryField('quantity', FIELD_ALIASES.quantity, item.quantity, 'number');
  if (item.outerId) await tryField('outerId', FIELD_ALIASES.outerId, item.outerId, 'text');

  // 详情：先找富文本/contenteditable，找不到退回 textarea
  if (item.description) {
    const descEl =
      findField(env, FIELD_ALIASES.description, ['textarea']) ||
      env.querySelector?.('[contenteditable="true"]') ||
      findField(env, FIELD_ALIASES.description, ['input', 'textarea']);
    if (descEl && setRichText(env, descEl, item.description)) {
      report.filled.push({ key: 'description', label: '宝贝详情', value: '(已填入详情 HTML)' });
    } else {
      report.manual.push({ key: 'description', label: '宝贝详情', reason: '详情编辑器没找到，或需要先切到"文字详情"模式' });
    }
    await delay(stepDelay);
  }

  // 图片
  const images = item.imageFiles || [];
  if (images.length) {
    const fileInput = findFileInput(env, '主图');
    if (fileInput && injectFiles(env, fileInput, images)) {
      report.filled.push({ key: 'images', label: '主图', value: `${images.length} 张（已交给页面上传）` });
    } else {
      report.manual.push({
        key: 'images',
        label: '主图',
        reason: '没找到可注入的图片上传框。图片已下载到本地，请手动拖进发布页。',
      });
    }
  }

  // 这几个几乎一定要人工：类目、关键属性、SKU 矩阵、物流
  report.manual.push({ key: 'category', label: '宝贝类目', reason: '类目树是异步控件，自动选容易错，请手动选叶子类目' });
  if ((item.skus || []).length) {
    report.manual.push({ key: 'skus', label: '销售规格(SKU)', reason: `${item.skus.length} 个规格，SKU 矩阵请手动确认（价格库存见下方清单）` });
  }
  report.manual.push({ key: 'props', label: '宝贝属性', reason: '关键属性（品牌等）请在选完类目后手动补齐' });
  report.manual.push({ key: 'logistics', label: '物流/运费', reason: '运费模板、所在地请手动确认' });
  report.manual.push({ key: 'submit', label: '提交', reason: '一切核对无误后，由你亲自点「提交宝贝」——工具不替你提交' });

  return report;
}

const api = {
  FIELD_ALIASES,
  findField,
  setNativeValue,
  setRichText,
  injectFiles,
  findFileInput,
  fillItem,
  contextText,
};

if (typeof module !== 'undefined' && module.exports) module.exports = api;
if (typeof globalThis !== 'undefined') globalThis.__copierFill = api;

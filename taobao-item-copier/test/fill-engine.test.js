'use strict';

/**
 * 自动填表引擎测试。
 *
 * 没法连真实淘宝发布页，所以手写一个「最小假 DOM」：只实现引擎真正用到的那部分接口。
 * 这样能验证引擎的核心逻辑 —— 按标签文字定位字段、容器特异性（不串味）、
 * 写值派发事件、图片注入 —— 这些正是自动填表最容易错的地方。
 *
 * 假 DOM 与真实 DOM 的差距，会在你第一次真机使用时暴露，届时按页面微调即可。
 */

const test = require('node:test');
const assert = require('node:assert');
const engine = require('../extension/fill-engine.js');

/* ------------------------- 最小假 DOM ------------------------- */

function matchesSimple(el, sel) {
  // 支持 tag、#id、.class、tag[attr]、[attr]、label[for="x"]、:scope > label 里的 label
  sel = sel.replace(/^:scope\s*>\s*/, '');
  const tagM = /^([a-zA-Z]+)/.exec(sel);
  if (tagM && el.tagName !== tagM[1].toUpperCase()) return false;
  if (/#([\w-]+)/.test(sel)) {
    const id = /#([\w-]+)/.exec(sel)[1];
    if (el.id !== id) return false;
  }
  if (/\.([\w-]+)/.test(sel)) {
    const cls = /\.([\w-]+)/.exec(sel)[1];
    if (!String(el.className || '').split(/\s+/).includes(cls)) return false;
  }
  const attrM = /\[([\w-]+)(?:([~^$*|]?=)"?([^\]"]*)"?)?\]/.exec(sel);
  if (attrM) {
    const [, name, op, valRaw] = attrM;
    const have = el.getAttribute(name);
    if (op === undefined) {
      if (have === null) return false;
    } else {
      const val = valRaw === undefined ? '' : valRaw;
      if (op === '=') { if (have !== val) return false; }
      else if (op === '*=') { if (!(have || '').includes(val)) return false; }
      else if (op === '^=') { if (!(have || '').startsWith(val)) return false; }
      else return false;
    }
  }
  return true;
}

function parseSelectorGroup(sel) {
  // 拆逗号，但忽略 :not(...) 里的逗号
  const groups = [];
  let depth = 0, cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { groups.push(cur); cur = ''; }
    else cur += ch;
  }
  if (cur) groups.push(cur);
  return groups;
}

function applyNot(el, sel) {
  const nots = [...sel.matchAll(/:not\(([^)]*)\)/g)].map((m) => m[1]);
  return !nots.some((n) => matchesSimple(el, n));
}

class FakeEvent {
  constructor(type, opts = {}) { this.type = type; this.bubbles = !!opts.bubbles; }
}

class FakeFile {
  constructor(bytes, name, type) { this.bytes = bytes; this.name = name; this.type = type; this.size = bytes.length; }
}

class FakeDataTransfer {
  constructor() { this._files = []; this.items = { add: (f) => this._files.push(f) }; }
  get files() { return this._files; }
}

class FakeElement {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.style = {};
    this._value = '';
    this._text = '';
    this.files = null;
    this.events = [];
    this.isContentEditable = false;
  }
  get className() { return this.attributes.class || ''; }
  set className(v) { this.attributes.class = v; }
  get id() { return this.attributes.id || ''; }
  set id(v) { this.attributes.id = v; }
  get type() { return this.attributes.type || (this.tagName === 'INPUT' ? 'text' : ''); }
  set type(v) { this.attributes.type = v; }
  get placeholder() { return this.attributes.placeholder || ''; }
  set placeholder(v) { this.attributes.placeholder = v; }
  get name() { return this.attributes.name || ''; }
  set name(v) { this.attributes.name = v; }
  get disabled() { return this.attributes.disabled !== undefined; }
  get htmlFor() { return this.attributes.for || ''; }
  set htmlFor(v) { this.attributes.for = v; }
  get value() { return this._value; }
  set value(v) { this._value = v; }
  get innerHTML() { return this._html || ''; }
  set innerHTML(v) { this._html = v; this._text = String(v).replace(/<[^>]+>/g, ''); }
  get textContent() {
    if (this.children.length) return this.children.map((c) => c.textContent).join('');
    return this._text;
  }
  set textContent(v) { this._text = String(v); this.children = []; }
  get innerText() { return this.textContent; }
  getAttribute(n) { return this.attributes[n] !== undefined ? this.attributes[n] : null; }
  setAttribute(n, v) { this.attributes[n] = String(v); }
  removeAttribute(n) { delete this.attributes[n]; }
  appendChild(c) { c.parentElement = this; this.children.push(c); return c; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  querySelectorAll(sel) {
    const out = [];
    const visit = (node) => {
      for (const c of node.children) {
        for (const one of parseSelectorGroup(sel)) {
          const base = one.replace(/:not\([^)]*\)/g, '').trim();
          if (base && matchesSimple(c, base) && applyNot(c, one)) { out.push(c); break; }
        }
        visit(c);
      }
    };
    visit(this);
    return out;
  }
  closest(sel) {
    let n = this;
    while (n) {
      for (const one of parseSelectorGroup(sel)) {
        const base = one.replace(/:not\([^)]*\)/g, '').trim();
        if (base && matchesSimple(n, base)) return n;
      }
      n = n.parentElement;
    }
    return null;
  }
  matches(sel) { return parseSelectorGroup(sel).some((one) => matchesSimple(this, one.replace(/:not\([^)]*\)/g, '').trim()) && applyNot(this, one)); }
  click() { this.events.push('click'); }
  focus() { this.events.push('focus'); }
  dispatchEvent(e) { this.events.push(e.type); return true; }
}

class FakeDocument extends FakeElement {
  constructor() { super('html', null); this.ownerDocument = this; }
}

function makeEnv(doc) {
  return {
    document: doc,
    querySelector: (s) => doc.querySelector(s),
    querySelectorAll: (s) => doc.querySelectorAll(s),
    createElement: (t) => new FakeElement(t, doc),
    createEvent: (type, opts) => new FakeEvent(type, opts),
    createFile: (bytes, name, type) => new FakeFile(bytes, name, type),
    File: FakeFile,
    DataTransfer: FakeDataTransfer,
    // setNativeValue 会找 HTMLInputElement/HTMLTextAreaElement 的原生 value setter
    HTMLInputElement: class { },
    HTMLTextAreaElement: class { },
  };
}

/** 搭一个模拟发布页：每个字段是 <div class="field"><label>名</label><input></div> */
function buildPublishPage() {
  const doc = new FakeDocument();
  const form = doc.appendChild(new FakeElement('form', doc));

  function field(labelText, kind, attrs = {}) {
    const wrap = form.appendChild(new FakeElement('div', doc));
    wrap.className = 'field';
    const lbl = wrap.appendChild(new FakeElement('label', doc));
    lbl.textContent = labelText;
    const input = wrap.appendChild(new FakeElement(kind, doc));
    if (attrs.id) { input.id = attrs.id; lbl.htmlFor = attrs.id; }
    if (attrs.type) input.type = attrs.type;
    if (attrs.placeholder) input.placeholder = attrs.placeholder;
    return input;
  }

  const title = field('宝贝标题', 'input', { id: 'title', placeholder: '请输入宝贝标题' });
  const price = field('一口价', 'input', { id: 'price', type: 'number' });
  const qty = field('库存', 'input', { id: 'qty', type: 'number' });
  const desc = field('宝贝详情', 'textarea', { id: 'desc' });
  const fileInput = field('主图', 'input', { id: 'pic', type: 'file' });
  fileInput.setAttribute('accept', 'image/*');

  // 一个干扰项：搜索框，placeholder 里也有"标题"以外的词，不应被误选
  const search = form.appendChild(new FakeElement('input', doc));
  search.type = 'text';
  search.placeholder = '搜索店铺内宝贝';

  return { doc, title, price, qty, desc, fileInput, search };
}

/* ------------------------- 测试 ------------------------- */

test('findField 按标签文字定位到正确控件', () => {
  const { doc, title, price, qty } = buildPublishPage();
  const env = makeEnv(doc);
  assert.strictEqual(engine.findField(env, engine.FIELD_ALIASES.title, ['input', 'textarea']), title);
  assert.strictEqual(engine.findField(env, engine.FIELD_ALIASES.price, ['input']), price);
  assert.strictEqual(engine.findField(env, engine.FIELD_ALIASES.quantity, ['input']), qty);
});

test('findField 不会串味：标题字段不会被匹配到价格框', () => {
  const { doc, title, price } = buildPublishPage();
  const env = makeEnv(doc);
  const found = engine.findField(env, ['宝贝标题'], ['input', 'textarea']);
  assert.strictEqual(found, title);
  assert.notStrictEqual(found, price);
});

test('findField 跳过 checkbox/radio/file/hidden，只返回文本类控件', () => {
  const doc = new FakeDocument();
  const form = doc.appendChild(new FakeElement('form', doc));
  const wrap = form.appendChild(new FakeElement('div', doc));
  wrap.appendChild(new FakeElement('label', doc)).textContent = '宝贝标题';
  const hidden = wrap.appendChild(new FakeElement('input', doc));
  hidden.type = 'hidden';
  const real = wrap.appendChild(new FakeElement('input', doc));
  real.type = 'text';
  const env = makeEnv(doc);
  // 同一容器里两个控件时，findField 靠 type 过滤掉 hidden
  assert.strictEqual(engine.findField(env, ['宝贝标题'], ['input']), real);
});

test('contextText 只取特异性容器的标签，不把整页文字拼进来', () => {
  const { doc, price } = buildPublishPage();
  const ctx = engine.contextText(price);
  assert.ok(ctx.includes('一口价'), `上下文应含"一口价"，实际：${ctx}`);
  assert.ok(!ctx.includes('宝贝标题'), '不应串到隔壁字段的标签');
  assert.ok(!ctx.includes('宝贝详情'), '不应包含整页所有标签');
});

test('setNativeValue 写入值并派发 input/change/blur 事件', () => {
  const { doc, title } = buildPublishPage();
  const env = makeEnv(doc);
  engine.setNativeValue(env, title, '纯棉T恤女夏季');
  assert.strictEqual(title.value, '纯棉T恤女夏季');
  assert.ok(title.events.includes('input'), '必须派发 input，否则 React 不更新');
  assert.ok(title.events.includes('change'));
});

test('setRichText 对 textarea 和 contenteditable 都能写', () => {
  const { doc, desc } = buildPublishPage();
  const env = makeEnv(doc);
  assert.strictEqual(engine.setRichText(env, desc, '<p>详情</p>'), true);
  assert.strictEqual(desc.value, '<p>详情</p>');

  const editable = new FakeElement('div', doc);
  editable.setAttribute('contenteditable', 'true');
  assert.strictEqual(engine.setRichText(env, editable, '<p>富文本</p>'), true);
  assert.ok(editable.innerHTML.includes('富文本'));
});

test('injectFiles 用 DataTransfer 构造 FileList 并派发 change', () => {
  const { doc, fileInput } = buildPublishPage();
  const env = makeEnv(doc);
  const files = [
    { bytes: Buffer.from([0xff, 0xd8]), name: '1.jpg', type: 'image/jpeg' },
    { bytes: Buffer.from([0xff, 0xd9]), name: '2.jpg', type: 'image/jpeg' },
  ];
  const ok = engine.injectFiles(env, fileInput, files);
  assert.strictEqual(ok, true);
  assert.strictEqual(fileInput.files.length, 2);
  assert.strictEqual(fileInput.files[0].name, '1.jpg');
  assert.ok(fileInput.events.includes('change'), '必须派发 change 触发页面上传逻辑');
});

test('findFileInput 优先选 accept=image 的上传框', () => {
  const doc = new FakeDocument();
  const form = doc.appendChild(new FakeElement('form', doc));
  const wrap = form.appendChild(new FakeElement('div', doc));
  wrap.appendChild(new FakeElement('label', doc)).textContent = '主图';
  const f = wrap.appendChild(new FakeElement('input', doc));
  f.type = 'file';
  f.setAttribute('accept', 'image/*');
  const env = makeEnv(doc);
  assert.strictEqual(engine.findFileInput(env, '主图'), f);
});

test('fillItem 填好文本字段，并把必须人工的项列进 manual', async () => {
  const { doc, title, price, qty, desc } = buildPublishPage();
  const env = makeEnv(doc);
  const item = {
    title: '现货 纯棉T恤女夏季 包邮',
    price: 53.9,
    quantity: 200,
    description: '<p>详情内容</p>',
    skus: [{ propText: '颜色:白', price: 53.9 }, { propText: '颜色:黑', price: 53.9 }],
    imageFiles: [{ bytes: Buffer.from([1]), name: '1.jpg', type: 'image/jpeg' }],
  };
  const report = await engine.fillItem(env, item, { retries: 1, stepDelay: 0 });

  assert.strictEqual(title.value, item.title);
  assert.strictEqual(price.value, '53.9');
  assert.strictEqual(qty.value, '200');
  assert.ok(desc.value.includes('详情内容'));

  const filledKeys = report.filled.map((f) => f.key);
  assert.ok(filledKeys.includes('title'));
  assert.ok(filledKeys.includes('price'));
  assert.ok(filledKeys.includes('quantity'));
  assert.ok(filledKeys.includes('description'));
  assert.ok(filledKeys.includes('images'), '图片应注入成功');

  const manualKeys = report.manual.map((m) => m.key);
  assert.ok(manualKeys.includes('category'), '类目必须人工');
  assert.ok(manualKeys.includes('skus'), '有 SKU 时必须人工确认');
  assert.ok(manualKeys.includes('submit'), '提交必须人工');
  assert.strictEqual(report.failed.length, 0);
});

test('fillItem 字段缺失时进 manual，不静默跳过也不崩', async () => {
  const { doc } = buildPublishPage();
  const env = makeEnv(doc);
  const report = await engine.fillItem(env, { title: '只有标题' }, { retries: 1, stepDelay: 0 });
  const manualKeys = report.manual.map((m) => m.key);
  assert.ok(manualKeys.includes('price'), '价格无数据应提示人工');
  assert.ok(manualKeys.includes('quantity'));
  assert.ok(report.filled.some((f) => f.key === 'title'));
});

test('fillItem 找不到字段时如实报告，不假装填成功', async () => {
  const doc = new FakeDocument(); // 空页面，什么字段都没有
  doc.appendChild(new FakeElement('form', doc));
  const env = makeEnv(doc);
  const report = await engine.fillItem(env, { title: 'T', price: 1 }, { retries: 1, stepDelay: 0 });
  const manualKeys = report.manual.map((m) => m.key);
  assert.ok(manualKeys.includes('title'), '标题字段找不到应进 manual');
  assert.ok(report.manual.find((m) => m.key === 'title').reason.includes('没找到'));
  assert.ok(!report.filled.some((f) => f.key === 'title'), '绝不能谎报已填');
});

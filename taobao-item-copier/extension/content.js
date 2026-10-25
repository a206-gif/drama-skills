'use strict';

/**
 * 内容脚本：跑在淘宝/天猫页面里。
 *
 * 两个作用：
 *   1. 在商品页右下角挂一个「采集」浮标，点一下就把这个宝贝送进本地商品库
 *   2. 响应后台的抓取请求：在店铺页把宝贝卡片捞出来、点下一页、读 shopId/sellerId
 *
 * 只读页面已有数据，不改页面内容、不自动提交任何表单。
 */

(() => {
  if (window.__copierInjected) return;
  window.__copierInjected = true;

  const isItemPage = /[?&]id=\d{6,}/.test(location.href) || /item\.taobao\.com|detail\.tmall\.com/.test(location.hostname);
  const isShopPage = /shop\d+\.taobao\.com|\.tmall\.com|shopsearch|category-|\/shop\//.test(location.href);

  /* ------------------------- 从页面里提取商品数据 ------------------------- */

  function pick(obj, keys) {
    for (const k of keys) {
      const v = obj && obj[k];
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return undefined;
  }

  /** 页面内嵌的大 JSON，字段最全，优先用它 */
  function readInlineData() {
    const out = {};
    const w = window;
    const candidates = [w.__INITIAL_DATA__, w.g_page_config, w.rawData, w.__NEXT_DATA__, w.g_config, w.Hub];
    for (const c of candidates) {
      if (c && typeof c === 'object') merge(out, scan(c));
    }
    return out;
  }

  function scan(node, depth = 0) {
    const out = {};
    if (!node || typeof node !== 'object' || depth > 10) return out;
    if (!Array.isArray(node)) {
      const t = pick(node, ['title', 'itemTitle', 'subject']);
      if (t && typeof t === 'string' && !out.title) out.title = t;
      const price = pick(node, ['price', 'priceText', 'salePrice']);
      if (price && !out.price) out.price = typeof price === 'object' ? pick(price, ['priceText', 'price']) : price;
      const pics = pick(node, ['images', 'pics', 'picUrls', 'itemImgs', 'gallery']);
      if (pics && !out.images) out.images = pics;
      const pic = pick(node, ['picUrl', 'mainPic', 'pic']);
      if (pic && !out.picUrl) out.picUrl = pic;
      const shop = pick(node, ['shopId', 'shop_id']);
      if (shop && !out.shopId) out.shopId = shop;
      const seller = pick(node, ['sellerId', 'userId', 'uid']);
      if (seller && !out.sellerId) out.sellerId = seller;
      const shopName = pick(node, ['shopName', 'shopTitle', 'sellerNick', 'nick']);
      if (shopName && !out.shopTitle) out.shopTitle = shopName;
      if (node.skuBase || node.skuCore) out.skusRaw = { skuBase: node.skuBase, skuCore: node.skuCore };
      if (node.props || node.components) out.propsRaw = node.props || node.components;
    }
    for (const v of Array.isArray(node) ? node : Object.values(node)) {
      if (v && typeof v === 'object') merge(out, scan(v, depth + 1));
    }
    return out;
  }

  function merge(t, s) {
    for (const [k, v] of Object.entries(s || {})) {
      if (v === undefined || v === null || v === '') continue;
      if (t[k] === undefined || t[k] === null || t[k] === '' || (Array.isArray(t[k]) && !t[k].length)) t[k] = v;
    }
    return t;
  }

  /** DOM 兜底：图片走画廊，标题走 h1 / og:title，价格走带 ¥ 的文本 */
  function readDom() {
    const out = {};
    out.title =
      document.querySelector('h1')?.innerText?.trim() ||
      document.querySelector('meta[property="og:title"]')?.content ||
      document.title.replace(/[-_|–].*(淘宝网|天猫|taobao|tmall).*$/i, '').trim();

    const imgs = new Set();
    const og = document.querySelector('meta[property="og:image"]')?.content;
    if (og) imgs.add(og);
    document.querySelectorAll('img').forEach((el) => {
      const src = el.currentSrc || el.dataset.src || el.dataset.ksLazyload || el.src || '';
      if (/alicdn\.com|taobaocdn\.com/.test(src) && el.naturalWidth >= 200) imgs.add(src);
    });
    out.images = [...imgs];

    const priceText = [...document.querySelectorAll('*')]
      .filter((el) => el.children.length === 0 && /[¥￥]\s*\d/.test(el.textContent || ''))
      .map((el) => (el.textContent.match(/\d+(?:\.\d{1,2})?/) || [])[0])
      .filter(Boolean);
    if (priceText.length) out.price = Number(priceText.sort((a, b) => a - b)[0]);

    // SKU 规格名（DOM 上通常是一排可点的按钮）
    const skuTexts = [...document.querySelectorAll('[class*="valueItem"],[class*="skuItem"],[data-value]')]
      .map((el) => (el.getAttribute('title') || el.innerText || '').trim())
      .filter((t) => t && t.length < 30);
    if (skuTexts.length) out.skuTexts = [...new Set(skuTexts)];

    return out;
  }

  function collectCurrentItem() {
    const inline = readInlineData();
    const dom = readDom();
    const id = new URLSearchParams(location.search).get('id') || (location.href.match(/[?&]id=(\d+)/) || [])[1] || '';

    let images = [];
    const pushImgs = (v) => {
      if (!v) return;
      if (Array.isArray(v)) return v.forEach(pushImgs);
      const u = typeof v === 'string' ? v : v.url || v.picUrl || v.path || '';
      if (!u) return;
      const full = u.startsWith('//') ? `https:${u}` : u;
      if (!images.includes(full)) images.push(full);
    };
    pushImgs(inline.images);
    pushImgs(inline.picUrl);
    pushImgs(dom.images);

    return {
      sourceItemId: id,
      sourceUrl: location.href.split('#')[0],
      sourcePlatform: location.hostname.includes('tmall') ? 'tmall' : 'taobao',
      title: inline.title || dom.title || '',
      price: Number(inline.price || dom.price || 0),
      images,
      shop: {
        shopId: String(inline.shopId || ''),
        sellerId: String(inline.sellerId || ''),
        title: inline.shopTitle || document.querySelector('[class*="shopName"],[class*="shop-name"]')?.innerText?.trim() || '',
        url: document.querySelector('a[href*="shop"][class*="shopName"]')?.href || '',
      },
      skusRaw: inline.skusRaw,
      propsRaw: inline.propsRaw,
      skuTexts: dom.skuTexts || [],
      collectedAt: new Date().toISOString(),
      via: 'content-script',
    };
  }

  /* ------------------------- 店铺页抓取（后台调用） ------------------------- */

  function scrapeShopPage() {
    const items = new Map();
    document.querySelectorAll('a[href*="id="]').forEach((a) => {
      const m = /[?&]id=(\d{6,})/.exec(a.href || '');
      if (!m) return;
      const id = m[1];
      const card = a.closest('div,li,dl') || a;
      const img = card.querySelector('img');
      const src = img && (img.dataset.src || img.dataset.ksLazyload || img.src);
      const text = (card.innerText || '').trim();
      const rec = items.get(id) || {
        sourceItemId: id,
        sourceUrl: a.href.split('#')[0],
        images: [],
      };
      if (src && /alicdn/.test(src)) {
        const full = src.startsWith('//') ? `https:${src}` : src;
        if (!rec.images.includes(full)) rec.images.push(full);
      }
      if (!rec.title) {
        const t = a.getAttribute('title') || (text.split('\n').find((l) => l.length > 8 && !/[¥￥]/.test(l)) || '');
        if (t) rec.title = t.trim();
      }
      if (!rec.price) {
        const p = (text.match(/[¥￥]\s*(\d+(?:\.\d{1,2})?)/) || [])[1];
        if (p) rec.price = Number(p);
      }
      if (!rec.sold) {
        const s = (text.match(/(\d+)\s*人(?:付款|收货)/) || [])[1];
        if (s) rec.sold = Number(s);
      }
      items.set(id, rec);
    });

    const nextBtn = [...document.querySelectorAll('a,button,span,li')].find((el) => {
      const t = (el.innerText || '').trim();
      return (t === '下一页' || t === '下页' || el.className?.toString?.().includes('next')) && !el.disabled;
    });

    return {
      items: [...items.values()],
      hasNextPage: Boolean(nextBtn),
      shopTitle: document.querySelector('[class*="shopName"],[class*="shop-name"],h1')?.innerText?.trim() || document.title,
      shopId: (location.href.match(/shop(\d+)\./) || [])[1] || window.g_config?.shopId || '',
      sellerId: window.g_config?.sellerId || (location.href.match(/[?&]userId=(\d+)/) || [])[1] || '',
      url: location.href,
    };
  }

  function gotoNextPage() {
    const nextBtn = [...document.querySelectorAll('a,button,span,li')].find((el) => {
      const t = (el.innerText || '').trim();
      return (t === '下一页' || t === '下页') && !el.disabled;
    });
    if (nextBtn) {
      nextBtn.click();
      return true;
    }
    // 没有「下一页」按钮时试试 URL 翻页
    const u = new URL(location.href);
    const cur = Number(u.searchParams.get('page') || u.searchParams.get('pageNum') || 1);
    u.searchParams.set('page', String(cur + 1));
    if (u.href !== location.href) {
      location.href = u.href;
      return true;
    }
    return false;
  }

  function readShopIdentity() {
    const html = document.documentElement.innerHTML;
    const shopId =
      (html.match(/"shopId"\s*:\s*"?(\d+)/) || [])[1] ||
      (location.href.match(/shop(\d+)\./) || [])[1] ||
      (location.href.match(/[?&]shopId=(\d+)/) || [])[1] || '';
    const sellerId =
      (html.match(/"(?:sellerId|userId|user_number_id)"\s*:\s*"?(\d+)/) || [])[1] ||
      (location.href.match(/[?&](?:userId|sellerId)=(\d+)/) || [])[1] || '';
    return {
      shopId,
      sellerId,
      title: document.querySelector('[class*="shopName"],[class*="shop-name"]')?.innerText?.trim() || document.title,
      url: location.href,
    };
  }

  /* ------------------------- 消息响应 ------------------------- */

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    try {
      if (msg.type === 'collect-current') {
        sendResponse({ ok: true, item: collectCurrentItem() });
      } else if (msg.type === 'scrape-shop-page') {
        sendResponse(scrapeShopPage());
      } else if (msg.type === 'goto-next-page') {
        sendResponse(gotoNextPage());
      } else if (msg.type === 'read-shop-identity') {
        sendResponse(readShopIdentity());
      } else if (msg.type === 'ping') {
        sendResponse({ ok: true, url: location.href, isItemPage, isShopPage });
      }
    } catch (e) {
      sendResponse({ ok: false, error: e.message });
    }
    return false;
  });

  /* ------------------------- 采集浮标 ------------------------- */

  function injectFab() {
    if (!isItemPage && !isShopPage) return;
    if (document.getElementById('__copier_fab')) return;

    const fab = document.createElement('div');
    fab.id = '__copier_fab';
    fab.innerHTML = `
      <style>
        #__copier_fab{position:fixed;right:18px;bottom:96px;z-index:2147483000;
          font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;}
        #__copier_fab button{display:block;width:auto;min-width:52px;margin-top:8px;padding:9px 13px;
          border:none;border-radius:24px;cursor:pointer;font-size:13px;font-weight:600;
          background:#ff7a1a;color:#1a0d03;box-shadow:0 6px 20px rgba(0,0,0,.32);
          font-family:inherit;line-height:1.2;}
        #__copier_fab button:hover{filter:brightness(1.08)}
        #__copier_fab button.ghost{background:#fff;color:#333;border:1px solid #ddd;font-weight:500}
        #__copier_fab .msg{max-width:210px;margin-top:8px;padding:8px 11px;border-radius:10px;
          background:#11182f;color:#e6edf3;font-size:12px;line-height:1.55;
          box-shadow:0 6px 20px rgba(0,0,0,.35);display:none;word-break:break-all}
        #__copier_fab .msg.show{display:block}
        #__copier_fab .msg.err{background:#2a1414;color:#ffb4ae}
        #__copier_fab .msg.ok{background:#10241a;color:#8ff0a4}
      </style>
      <div class="msg"></div>
    `;
    document.documentElement.appendChild(fab);

    const msgBox = fab.querySelector('.msg');
    let msgTimer = null;
    const say = (text, kind = '') => {
      msgBox.textContent = text;
      msgBox.className = `msg show ${kind}`;
      clearTimeout(msgTimer);
      msgTimer = setTimeout(() => msgBox.classList.remove('show'), kind ? 6000 : 3000);
    };

    const mk = (label, cls, onClick) => {
      const b = document.createElement('button');
      b.textContent = label;
      if (cls) b.className = cls;
      b.onclick = async (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.disabled = true;
        try { await onClick(b, say); } catch (err) { say(err.message, 'err'); }
        finally { b.disabled = false; }
      };
      fab.appendChild(b);
      return b;
    };

    if (isItemPage) {
      mk('📥 采集', '', async (b, say) => {
        say('读取页面数据…');
        const item = collectCurrentItem();
        if (!item.title) return say('没读到标题，可能页面还没加载完，稍后再点一次', 'err');
        const r = await chrome.runtime.sendMessage({ type: 'post-item', item, sourceUrl: item.sourceUrl, via: 'fab' });
        if (r && r.ok) say(`已入库：${item.title.slice(0, 18)}…`, 'ok');
        else say(`入库失败：${r?.data?.error || r?.error || '本地服务没启动？'}`, 'err');
      });
      mk('补全详情', 'ghost', async (b, say) => {
        const id = new URLSearchParams(location.search).get('id');
        if (!id) return say('这个页面没有商品 id', 'err');
        say('调 mtop 详情接口补全 SKU…');
        const d = await chrome.runtime.sendMessage({ type: 'fetch-detail', itemId: id });
        if (!d || !d.ok) return say(`详情接口失败：${d?.data?.error || '未知'}`, 'err');
        const item = { ...collectCurrentItem(), ...d.data, sourceUrl: location.href.split('#')[0] };
        const r = await chrome.runtime.sendMessage({ type: 'post-item', item, sourceUrl: item.sourceUrl, via: 'fab-detail' });
        if (r && r.ok) say(`已入库（含 SKU）：${(item.skusRaw?.skuBase?.skus || []).length} 个规格`, 'ok');
        else say(`入库失败：${r?.data?.error || ''}`, 'err');
      });
    }

    if (isShopPage) {
      mk('📥 采本页', '', async (b, say) => {
        const r = scrapeShopPage();
        if (!r.items.length) return say('这个页面没找到宝贝链接（href 里带 id= 的卡片）', 'err');
        say(`找到 ${r.items.length} 个宝贝，回传中…`);
        const post = await chrome.runtime.sendMessage({
          type: 'post-shop',
          payload: {
            shopId: r.shopId,
            sellerId: r.sellerId,
            shopTitle: r.shopTitle,
            shopUrl: r.url,
            total: r.items.length,
            items: r.items,
            via: 'fab-page',
          },
        });
        if (post && post.ok) say(`已入库 ${post.data.created ?? r.items.length} 条（更新 ${post.data.updated ?? 0}）`, 'ok');
        else say(`回传失败：${post?.data?.error || post?.error || ''}`, 'err');
      });
      mk('🏬 采整店', 'ghost', async (b, say) => {
        say('已下发整店采集任务，去本地控制台看进度…');
        const r = await chrome.runtime.sendMessage({
          type: 'enqueue-shop',
          payload: { shopUrl: location.href.split('#')[0], mode: 'auto', depth: 'list', maxPages: 20 },
        });
        if (!r || !r.ok) say(`下发失败：${r?.data?.error || r?.error || '本地服务没启动？'}`, 'err');
      });
    }
  }

  // 店铺页是异步渲染的，多试几次注入
  injectFab();
  let tries = 0;
  const timer = setInterval(() => {
    injectFab();
    if (++tries > 6) clearInterval(timer);
  }, 1500);
})();

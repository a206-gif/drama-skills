'use strict';

/**
 * 类目与属性。
 *
 * 发布失败里最大的一类就是「类目属性不合法」，所以这里把查询能力单独做出来：
 * 一层层点下去找叶子类目 → 拉该类目的必填关键属性 → 直接抄进商品编辑页。
 */

const express = require('express');
const publish = require('../lib/publish');

const router = express.Router();

/** GET /api/categories?parentCid=0 */
router.get('/', async (req, res) => {
  try {
    const cats = await publish.getChildCategories(Number(req.query.parentCid || 0));
    res.json({ ok: true, categories: cats });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, hint: e.hint || '' });
  }
});

/** GET /api/categories/search?q=连衣裙 */
router.get('/search', async (req, res) => {
  try {
    const cats = await publish.searchCategories(String(req.query.q || ''));
    res.json({ ok: true, categories: cats });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, hint: e.hint || '' });
  }
});

/** GET /api/categories/:cid/props?key=1  关键属性（必填项在这里） */
router.get('/:cid/props', async (req, res) => {
  try {
    const props = await publish.getCategoryProps(req.params.cid, req.query.key === '1');
    res.json({ ok: true, cid: req.params.cid, props });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, hint: e.hint || '' });
  }
});

/** GET /api/categories/:cid/sale-props  销售属性（颜色/尺码，SKU 用） */
router.get('/:cid/sale-props', async (req, res) => {
  try {
    const props = await publish.getSaleProps(req.params.cid);
    res.json({ ok: true, cid: req.params.cid, props });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message, hint: e.hint || '' });
  }
});

module.exports = router;

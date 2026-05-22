const express = require('express');
const { PUBLIC_LOG_ACTIONS } = require('../config');
const { activeBlacklistCondition, getClientIP } = require('../utils');

function createPublicRouter({ db, authMiddleware, generalLimiter, logLimiter, blacklistCheckLimiter, geoService }) {
  const router = express.Router();
  const { fetchAndStoreGeo } = geoService;

  // 检查黑名单
  router.post('/api/check-blacklist', blacklistCheckLimiter, (req, res) => {
    const { openId } = req.body;
    if (!openId || typeof openId !== 'string' || openId.length > 128) return res.json({ success: true, blocked: false });
    const blocked = db.prepare(
      `SELECT reason, ban_message FROM blacklist WHERE open_id = ? AND ${activeBlacklistCondition()}`
    ).get(openId);
    return res.json({
      success: true,
      blocked: !!blocked,
      reason: blocked?.reason || null,
      ban_message: blocked?.ban_message || null
    });
  });

  // 验证管理员 OpenID
  router.post('/api/verify-admin', generalLimiter, (req, res) => {
    return res.status(410).json({ success: false, error: '该接口已停用' });
  });

  // 检查是否为管理员
  router.post('/api/check-admin', generalLimiter, (req, res) => {
    return res.status(410).json({ success: false, error: '该接口已停用' });
  });

  // 记录/更新用户姓名和 userId
  router.post('/api/upsert-user', authMiddleware, (req, res) => {
    return res.status(403).json({ success: false, error: '公开写入已禁用' });
  });

  // 查询已存储的用户姓名（供有缓存 satoken 的老用户冷启动时使用）
  router.get('/api/user-name', authMiddleware, (req, res) => {
    return res.status(403).json({ success: false, error: '公开查询已禁用', name: '' });
  });

  // 记录访问日志
  router.post('/api/log-access', logLimiter, (req, res) => {
    const { openId, action } = req.body;
    if (!openId || !action) return res.json({ success: false });
    if (typeof openId !== 'string' || openId.length > 128) return res.status(400).json({ success: false });
    if (typeof action !== 'string' || action.length > 64) return res.status(400).json({ success: false });
    if (!PUBLIC_LOG_ACTIONS.has(action)) return res.status(400).json({ success: false, error: '非法操作类型' });
    const ip = getClientIP(req);
    const userAgent = (req.headers['user-agent'] || '').substring(0, 512);

    const { lastInsertRowid } = db.prepare('INSERT INTO access_logs (open_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)')
      .run(openId, action, ip, userAgent);

    // 异步查询 geo，不阻塞响应
    fetchAndStoreGeo(ip, lastInsertRowid).catch(() => {});

    return res.json({ success: true });
  });

  // 获取当前版本信息
  router.get('/api/version', generalLimiter, (req, res) => {
    const info = db.prepare('SELECT version, release_date, changes FROM version_info WHERE id = 1').get();
    res.setHeader('Cache-Control', 'no-store');
    if (info) {
      res.json({ version: info.version, date: info.release_date, changes: JSON.parse(info.changes) });
    } else {
      res.json({ version: 'unknown', date: '', changes: [] });
    }
  });

  // 获取当前活跃通知（前端公开接口）
  router.get('/api/notification', generalLimiter, (req, res) => {
    const n = db.prepare(
      'SELECT title, content, type, nonce FROM notification WHERE id = 1 AND is_active = 1'
    ).get();
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json(n || null);
  });

  return router;
}

module.exports = createPublicRouter;

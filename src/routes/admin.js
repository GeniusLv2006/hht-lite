// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const express = require('express');
const { JWT_SECRET, LOG_RETENTION_DAYS, SHANGHAI_OFFSET } = require('../config');
const {
  activeBlacklistCondition,
  buildAdminLogFilterParts,
  clampInteger,
  deleteAccessLogsByIds,
  hasActiveAdminLogFilters,
  isValidPassword,
  isValidUsername,
  normalizeLogIds,
  parseAdminDateTime,
  toSqliteUtc
} = require('../utils');

const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_TIME = 15 * 60 * 1000;
const LOGIN_ATTEMPT_TTL = 60 * 60 * 1000;
const MAX_LOGIN_ATTEMPT_RECORDS = 5000;

function checkLoginAttempts(key) {
  const attempts = loginAttempts.get(key);
  if (!attempts) return { locked: false };
  if (attempts.expiresAt && Date.now() >= attempts.expiresAt) {
    loginAttempts.delete(key);
    return { locked: false };
  }
  if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS) {
    if (Date.now() < attempts.lockUntil) {
      const remaining = Math.ceil((attempts.lockUntil - Date.now()) / 1000 / 60);
      return { locked: true, remaining };
    }
    loginAttempts.delete(key);
  }
  return { locked: false };
}

function trimLoginAttempts() {
  if (loginAttempts.size <= MAX_LOGIN_ATTEMPT_RECORDS) return;
  let oldestKey = null;
  let oldestAt = Infinity;
  for (const [key, attempts] of loginAttempts.entries()) {
    const candidate = attempts.updatedAt || 0;
    if (candidate < oldestAt) {
      oldestAt = candidate;
      oldestKey = key;
    }
  }
  if (oldestKey) loginAttempts.delete(oldestKey);
}

function recordLoginFailure(key) {
  const now = Date.now();
  const current = loginAttempts.get(key) || { count: 0 };
  current.count++;
  current.updatedAt = now;
  current.expiresAt = now + LOGIN_ATTEMPT_TTL;
  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    current.lockUntil = now + LOGIN_LOCK_TIME;
  }
  loginAttempts.set(key, current);
  trimLoginAttempts();
}

function clearLoginAttempts(key) {
  loginAttempts.delete(key);
}

function cleanExpiredLoginAttempts() {
  const now = Date.now();
  for (const [key, attempts] of loginAttempts.entries()) {
    if (attempts.expiresAt && now >= attempts.expiresAt) {
      loginAttempts.delete(key);
    }
  }
}


function createAdminRouter({ db, authMiddleware, loginLimiter }) {
  const router = express.Router();

  router.post('/api/admin/login', loginLimiter, (req, res) => {
    const { username, password } = req.body;
    if (!isValidUsername(username) || !isValidPassword(password)) {
      return res.status(400).json({ error: '用户名或密码格式错误' });
    }

    // 检查是否被锁定
    const lockStatus = checkLoginAttempts(username);
    if (lockStatus.locked) {
      return res.status(429).json({ error: `登录失败次数过多，请 ${lockStatus.remaining} 分钟后重试` });
    }

    const user = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      recordLoginFailure(username);
      return res.status(401).json({ error: '用户名或密码错误' });
    }

    clearLoginAttempts(username);
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });
    const maxAge = 24 * 60 * 60 * 1000;
    res.cookie('adminToken', token, { httpOnly: true, secure: true, sameSite: 'Strict', maxAge });
    res.cookie('adminLoggedIn', '1', { secure: true, sameSite: 'Strict', maxAge });
    return res.json({ success: true });
  });

  router.post('/api/admin/change-password', authMiddleware, (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: '新密码至少8位' });
    }

    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(oldPassword, user.password_hash)) {
      return res.status(400).json({ error: '旧密码错误' });
    }

    const newHash = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(newHash, req.user.id);
    return res.json({ success: true });
  });

  // 登出：清除 Cookie
  router.post('/api/admin/logout', (req, res) => {
    const base = { secure: true, sameSite: 'Strict' };
    res.clearCookie('adminToken', { ...base, httpOnly: true });
    res.clearCookie('adminLoggedIn', base);
    return res.json({ success: true });
  });

  // 获取统计（优化：合并查询）
  router.get('/api/admin/stats', authMiddleware, (req, res) => {
    const todayCST = new Date(Date.now() + 8 * 3600 * 1000).toISOString().substring(0, 10);
    const todayStart = toSqliteUtc(new Date(todayCST + `T00:00:00${SHANGHAI_OFFSET}`));
    const tomorrowStart = new Date(new Date(todayCST + `T00:00:00${SHANGHAI_OFFSET}`).getTime() + 24 * 3600 * 1000);
    const tomorrowStartStr = toSqliteUtc(tomorrowStart);

    const stats = db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM access_logs WHERE open_id NOT LIKE 'admin:%') as totalLogs,
        (SELECT COUNT(DISTINCT open_id) FROM access_logs WHERE open_id NOT LIKE 'admin:%') as uniqueOpenIds,
        (SELECT COUNT(*) FROM access_logs WHERE open_id NOT LIKE 'admin:%' AND created_at >= :todayStart AND created_at < :tomorrowStart) as todayLogs,
        (SELECT COUNT(*) FROM blacklist WHERE ${activeBlacklistCondition()}) as blockedCount
    `).get({ todayStart, tomorrowStart: tomorrowStartStr });

    const retentionConfig = db.prepare('SELECT value FROM config WHERE key = ?').get('log_retention_days');
    const logRetentionDays = retentionConfig ? parseInt(retentionConfig.value) : LOG_RETENTION_DAYS;

    return res.json({
      success: true,
      data: { ...stats, logRetentionDays }
    });
  });

  // 获取日志
  router.get('/api/admin/logs', authMiddleware, (req, res) => {
    const page = clampInteger(req.query.page, 1, 100000, 1);
    const limit = clampInteger(req.query.limit, 1, 100, 50);
    const offset = (page - 1) * limit;
    const { joinedTables, whereClause, params } = buildAdminLogFilterParts(req.query);
    let query = `
      SELECT l.*, t.tag, b.reason as blocked_reason, u.name as user_name, u.user_id
      ${joinedTables}
    `;
    let countQuery = `SELECT COUNT(*) as total ${joinedTables}`;
    query += whereClause;
    countQuery += whereClause;

    query += ' ORDER BY l.created_at DESC LIMIT ? OFFSET ?';

    const logs = db.prepare(query).all(...params, limit, offset);
    const total = db.prepare(countQuery).get(...params).total;

    return res.json({
      success: true,
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) }
    });
  });

  // 获取用户列表
  router.get('/api/admin/users', authMiddleware, (req, res) => {
    const users = db.prepare(`
      SELECT DISTINCT l.open_id, t.tag, u.name as user_name,
        (SELECT COUNT(*) FROM access_logs WHERE open_id = l.open_id) as log_count,
        (SELECT MAX(created_at) FROM access_logs WHERE open_id = l.open_id) as last_active
      FROM access_logs l
      LEFT JOIN openid_tags t ON l.open_id = t.open_id
      LEFT JOIN users u ON l.open_id = u.open_id
      WHERE l.open_id NOT LIKE 'admin:%'
      ORDER BY last_active DESC
      LIMIT 500
    `).all();
    return res.json({ success: true, data: users });
  });

  // 标签管理
  router.post('/api/admin/tag', authMiddleware, (req, res) => {
    const { openId, tag } = req.body;
    if (!openId) return res.status(400).json({ error: 'OpenID 不能为空' });
    if (openId.length > 100) return res.status(400).json({ error: 'OpenID 过长' });
    if (tag && tag.length > 50) return res.status(400).json({ error: '标签过长（最多50字符）' });

    if (tag) {
      db.prepare(`
        INSERT INTO openid_tags (open_id, tag, updated_at) VALUES (?, ?, datetime('now'))
        ON CONFLICT(open_id) DO UPDATE SET tag = ?, updated_at = datetime('now')
      `).run(openId, tag, tag);
    } else {
      db.prepare('DELETE FROM openid_tags WHERE open_id = ?').run(openId);
    }

    return res.json({ success: true });
  });

  router.get('/api/admin/tags', authMiddleware, (req, res) => {
    const tags = db.prepare('SELECT * FROM openid_tags ORDER BY updated_at DESC').all();
    return res.json({ success: true, data: tags });
  });

  // 黑名单管理
  router.post('/api/admin/blacklist/add', authMiddleware, (req, res) => {
    const { openId, reason, ban_message, expires_at } = req.body;
    if (!openId) return res.status(400).json({ error: 'OpenID 不能为空' });
    if (openId.length > 100) return res.status(400).json({ error: 'OpenID 过长' });
    if (reason && reason.length > 200) return res.status(400).json({ error: '拉黑原因过长（最多200字符）' });
    if (ban_message && ban_message.length > 100) return res.status(400).json({ error: '按钮文字过长（最多100字符）' });
    if (ban_message && /<[^>]+>/.test(ban_message)) return res.status(400).json({ error: '按钮文字不能包含 HTML 标签' });

    let expiresAt = null;
    if (expires_at) {
      const d = parseAdminDateTime(expires_at);
      if (!d || d <= new Date()) return res.status(400).json({ error: '解封时间必须是未来时间' });
      expiresAt = toSqliteUtc(d);
    }

    db.prepare(`
      INSERT INTO blacklist (open_id, reason, ban_message, expires_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(open_id) DO UPDATE SET
        reason = excluded.reason,
        ban_message = excluded.ban_message,
        expires_at = excluded.expires_at
    `).run(openId, reason || '', ban_message || null, expiresAt);
    return res.json({ success: true });
  });

  router.post('/api/admin/blacklist/remove', authMiddleware, (req, res) => {
    const { openId } = req.body;
    db.prepare('DELETE FROM blacklist WHERE open_id = ?').run(openId);
    return res.json({ success: true });
  });

  router.get('/api/admin/blacklist', authMiddleware, (req, res) => {
    const list = db.prepare(`
      SELECT b.*, t.tag
      FROM blacklist b
      LEFT JOIN openid_tags t ON b.open_id = t.open_id
      WHERE ${activeBlacklistCondition('b.expires_at')}
      ORDER BY b.created_at DESC
    `).all();
    return res.json({ success: true, data: list });
  });

  // 管理员 OpenID 密码
  router.post('/api/admin/update-openid-password', authMiddleware, (req, res) => {
    return res.status(410).json({ success: false, error: '该接口已停用' });
  });

  // 清理日志
  router.post('/api/admin/clear-logs', authMiddleware, (req, res) => {
    const { days, clearAll } = req.body;

    let result;
    if (clearAll) {
      result = db.prepare('DELETE FROM access_logs').run();
    } else {
      const daysToKeep = parseInt(days) || 7;
      result = db.prepare(`
        DELETE FROM access_logs
        WHERE created_at < datetime('now', '-' || ? || ' days')
      `).run(daysToKeep);
    }

    return res.json({ success: true, deleted: result.changes });
  });

  // 删除用户日志
  router.post('/api/admin/delete-user-logs', authMiddleware, (req, res) => {
    return res.status(410).json({ success: false, error: '按 OpenID 删除已停用，请使用新的日志删除接口' });
  });

  router.post('/api/admin/delete-logs', authMiddleware, (req, res) => {
    const scope = typeof req.body?.scope === 'string' ? req.body.scope.trim() : '';

    if (scope === 'ids') {
      const ids = normalizeLogIds(req.body?.ids);
      if (ids.length === 0) return res.status(400).json({ success: false, error: '请选择要删除的记录' });
      const deleted = deleteAccessLogsByIds(db, ids);
      return res.json({ success: true, deleted });
    }

    if (scope === 'filtered') {
      const { filters, joinedTables, whereClause, params } = buildAdminLogFilterParts(req.body?.filters || {});
      if (!hasActiveAdminLogFilters(filters)) {
        return res.status(400).json({ success: false, error: '请先设置筛选条件' });
      }

      const result = db.prepare(`
        DELETE FROM access_logs
        WHERE id IN (
          SELECT l.id
          ${joinedTables}
          ${whereClause}
        )
      `).run(...params);

      return res.json({ success: true, deleted: result.changes });
    }

    return res.status(400).json({ success: false, error: '不支持的删除方式' });
  });

  // 更新保留天数
  router.post('/api/admin/update-retention', authMiddleware, (req, res) => {
    const { days } = req.body;
    const retentionDays = parseInt(days);

    if (!retentionDays || retentionDays < 1 || retentionDays > 365) {
      return res.status(400).json({ error: '保留天数应在 1-365 之间' });
    }

    db.prepare(`INSERT INTO config (key, value) VALUES ('log_retention_days', ?) ON CONFLICT(key) DO UPDATE SET value = ?`).run(String(retentionDays), String(retentionDays));
    return res.json({ success: true });
  });

  // 更新版本信息（仅保留最新一个版本，新版本覆盖旧版本）
  router.post('/api/admin/version', authMiddleware, (req, res) => {
    const { version, date, changes } = req.body;
    if (!version || !changes || !Array.isArray(changes)) {
      return res.status(400).json({ error: '版本信息格式错误' });
    }
    db.prepare(`
      INSERT INTO version_info (id, version, release_date, changes) VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET version = excluded.version, release_date = excluded.release_date, changes = excluded.changes
    `).run(version, date || new Date().toISOString().split('T')[0], JSON.stringify(changes));
    return res.json({ success: true });
  });
  // 管理员发布/更新通知
  router.post('/api/admin/notification', authMiddleware, (req, res) => {
    const { title, content, type, is_active } = req.body;
    if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
    if (!['always', 'once'].includes(type)) return res.status(400).json({ error: '通知类型无效' });
    if (title.length > 100) return res.status(400).json({ error: '标题过长（最多100字符）' });
    if (content.length > 1000) return res.status(400).json({ error: '内容过长（最多1000字符）' });
    const nonce = crypto.randomBytes(8).toString('hex');
    db.prepare(`
      INSERT INTO notification (id, title, content, type, is_active, nonce) VALUES (1, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title, content = excluded.content,
        type = excluded.type, is_active = excluded.is_active, nonce = excluded.nonce
    `).run(title, content, type, is_active ? 1 : 0, nonce);
    res.json({ success: true });
  });

  // 管理员停用通知
  router.delete('/api/admin/notification', authMiddleware, (req, res) => {
    db.prepare('UPDATE notification SET is_active = 0 WHERE id = 1').run();
    res.json({ success: true });
  });

  // 管理员获取通知详情（含非活跃状态）
  router.get('/api/admin/notification', authMiddleware, (req, res) => {
    const n = db.prepare('SELECT * FROM notification WHERE id = 1').get();
    res.json(n || null);
  });

  // 健康检查（含内存监控，需管理员认证）
  router.get('/health', authMiddleware, (req, res) => {
    const vInfo = db.prepare('SELECT version FROM version_info WHERE id = 1').get();
    const mem = process.memoryUsage();
    res.json({
      status: 'ok',
      version: vInfo?.version || 'unknown',
      memory: {
        rss: (mem.rss / 1024 / 1024).toFixed(2) + ' MB',
        heapUsed: (mem.heapUsed / 1024 / 1024).toFixed(2) + ' MB',
        heapTotal: (mem.heapTotal / 1024 / 1024).toFixed(2) + ' MB',
        external: (mem.external / 1024 / 1024).toFixed(2) + ' MB'
      }
    });
  });

  return { router, cleanExpiredLoginAttempts };
}

module.exports = createAdminRouter;

const express = require('express');
const compression = require('compression');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const Database = require('better-sqlite3');
const rateLimit = require('express-rate-limit');
const path = require('path');

const VERSION = require('./version.json');

const app = express();
app.use(compression());
app.set('trust proxy', 1);

const PORT = process.env.PORT || 3100;
const JWT_SECRET = process.env.JWT_SECRET || (() => {
  // 未设置环境变量时，从 data/.jwt_secret 读取或生成持久化密钥
  const keyFile = path.join(__dirname, 'data', '.jwt_secret');
  try {
    const existing = require('fs').readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) {
      console.log('✅ JWT_SECRET 已从持久化文件加载');
      return existing;
    }
  } catch {}
  const key = crypto.randomBytes(32).toString('hex');
  try {
    require('fs').writeFileSync(keyFile, key, { mode: 0o600 });
    console.log('✅ JWT_SECRET 已生成并持久化（data/.jwt_secret）');
  } catch (e) {
    console.log('⚠️  JWT_SECRET 无法持久化：', e.message);
  }
  return key;
})();
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS) || 30;
const ADMIN_OPENID = process.env.ADMIN_OPENID || '';

// 初始化数据库
const db = new Database(path.join(__dirname, 'data', 'hht.db'));

// 创建表和索引
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS access_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    open_id TEXT NOT NULL,
    action TEXT NOT NULL,
    ip_address TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS openid_tags (
    open_id TEXT PRIMARY KEY,
    tag TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    open_id TEXT PRIMARY KEY,
    reason TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS version_info (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    version TEXT NOT NULL,
    release_date TEXT NOT NULL,
    changes TEXT NOT NULL
  );

  -- 优化索引
  CREATE INDEX IF NOT EXISTS idx_access_logs_open_id ON access_logs(open_id);
  CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at);
  CREATE INDEX IF NOT EXISTS idx_access_logs_open_id_created_at ON access_logs(open_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action);

  CREATE TABLE IF NOT EXISTS notification (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'once' CHECK(type IN ('always','once')),
    is_active INTEGER NOT NULL DEFAULT 0,
    nonce TEXT NOT NULL DEFAULT ''
  );
`);

// 初始化配置
const existingOpenId = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_openid');
if (!existingOpenId) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('admin_openid', ADMIN_OPENID);
}
const existingRetention = db.prepare('SELECT value FROM config WHERE key = ?').get('log_retention_days');
if (!existingRetention) {
  db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('log_retention_days', String(LOG_RETENTION_DAYS));
}

// 初始管理员账户（仅当数据库为空且设置了 INIT_ADMIN_USER / INIT_ADMIN_PASSWORD 环境变量时创建）
const initAdminUser = process.env.INIT_ADMIN_USER || 'admin';
const existingAdmin = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
if (!existingAdmin) {
  if (process.env.INIT_ADMIN_PASSWORD) {
    const adminHash = bcrypt.hashSync(process.env.INIT_ADMIN_PASSWORD, 10);
    db.prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)').run(initAdminUser, adminHash);
    console.log(`✅ Created admin user: ${initAdminUser} (password from INIT_ADMIN_PASSWORD)`);
  } else {
    console.log('⚠️  No admin user exists. Set INIT_ADMIN_PASSWORD env to create one on next restart.');
  }
}

// 每次启动时从 version.json 同步版本信息到 DB，无需手动更新数据库
db.prepare(`
  INSERT INTO version_info (id, version, release_date, changes) VALUES (1, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    version = excluded.version,
    release_date = excluded.release_date,
    changes = excluded.changes
`).run(VERSION.version, VERSION.date, JSON.stringify(VERSION.changes));

// ===== 安全响应头 =====
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline'; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com; " +
    "connect-src 'self' https://api.215123.cn; " +
    "img-src 'self' data:; " +
    "frame-ancestors 'none'; " +
    "object-src 'none'; " +
    "base-uri 'self';"
  );
  next();
});

// ===== CORS 配置 =====
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : ['https://huihutong.xjtlu.uk'];

app.use(cors({
  origin: function(origin, callback) {
    // 允许无 origin 的请求（PWA standalone 模式）
    if (!origin) return callback(null, true);
    // 严格检查来源
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // 仅开发环境允许 localhost
    if (process.env.NODE_ENV === 'development' && (origin.includes('localhost') || origin.includes('127.0.0.1'))) {
      return callback(null, true);
    }
    console.log('CORS blocked:', origin);
    return callback(new Error('CORS not allowed'), false);
  },
  methods: ['GET', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json({ limit: '10kb' }));

// ===== 频率限制 =====
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const logLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '登录请求过于频繁，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const blacklistCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { error: '请求过于频繁' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ===== 登录失败限制 =====
const loginAttempts = new Map();
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_TIME = 15 * 60 * 1000;

function checkLoginAttempts(username) {
  const attempts = loginAttempts.get(username);
  if (attempts && attempts.count >= MAX_LOGIN_ATTEMPTS) {
    if (Date.now() < attempts.lockUntil) {
      const remaining = Math.ceil((attempts.lockUntil - Date.now()) / 1000 / 60);
      return { locked: true, remaining };
    }
    loginAttempts.delete(username);
  }
  return { locked: false };
}

function recordLoginFailure(username) {
  const current = loginAttempts.get(username) || { count: 0 };
  current.count++;
  if (current.count >= MAX_LOGIN_ATTEMPTS) {
    current.lockUntil = Date.now() + LOGIN_LOCK_TIME;
  }
  loginAttempts.set(username, current);
}

function clearLoginAttempts(username) {
  loginAttempts.delete(username);
}

// ===== 日志自动清除 =====
function cleanOldLogs() {
  const retentionConfig = db.prepare('SELECT value FROM config WHERE key = ?').get('log_retention_days');
  const retentionDays = retentionConfig ? parseInt(retentionConfig.value) : LOG_RETENTION_DAYS;

  const result = db.prepare(`
    DELETE FROM access_logs
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  if (result.changes > 0) {
    console.log(`[Auto Clean] Deleted ${result.changes} logs older than ${retentionDays} days`);
  }
  return result.changes;
}

cleanOldLogs();
setInterval(cleanOldLogs, 60 * 60 * 1000);

// 定期执行 WAL checkpoint，释放 SQLite 占用内存
db.pragma('journal_mode = WAL');
setInterval(() => {
  try { db.pragma('wal_checkpoint(PASSIVE)'); } catch (e) {}
}, 30 * 60 * 1000);

// 定期清理过期的登录尝试记录，防止 Map 无限累积
setInterval(() => {
  const now = Date.now();
  for (const [username, attempts] of loginAttempts.entries()) {
    if (attempts.lockUntil && now > attempts.lockUntil) {
      loginAttempts.delete(username);
    }
  }
}, 60 * 60 * 1000);

// ===== 工具函数 =====
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.headers['cf-connecting-ip'] ||
         req.connection?.remoteAddress ||
         req.ip;
}

function authMiddleware(req, res, next) {
  // Cookie 优先（HttpOnly），降级兼容 Authorization Bearer
  const cookieHeader = req.headers.cookie || '';
  const cookieMatch = cookieHeader.split(';').find(c => c.trim().startsWith('adminToken='));
  const cookieToken = cookieMatch ? decodeURIComponent(cookieMatch.split('=').slice(1).join('=').trim()) : null;
  const token = cookieToken || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未授权' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token 无效' });
  }
}

// ===== 前端 API =====

// 检查黑名单
app.post('/api/check-blacklist', blacklistCheckLimiter, (req, res) => {
  const { openId } = req.body;
  if (!openId || typeof openId !== 'string' || openId.length > 128) return res.json({ success: true, blocked: false });
  const blocked = db.prepare('SELECT reason FROM blacklist WHERE open_id = ?').get(openId);
  return res.json({
    success: true,
    blocked: !!blocked,
    reason: blocked?.reason || null
  });
});

// 验证管理员 OpenID
app.post('/api/verify-admin', generalLimiter, (req, res) => {
  const { openId, password } = req.body;
  const ip = getClientIP(req);
  const userAgent = req.headers['user-agent'];

  const configOpenId = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_openid');
  const configHash = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_openid_hash');

  if (!configOpenId || openId !== configOpenId.value) {
    return res.json({ success: true, isAdmin: false });
  }

  db.prepare('INSERT INTO access_logs (open_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)')
    .run(openId, 'admin_verify_attempt', ip, userAgent);

  if (!configHash) {
    return res.json({ success: true, isAdmin: true, verified: false });
  }

  const isValid = bcrypt.compareSync(password, configHash.value);

  if (isValid) {
    db.prepare('INSERT INTO access_logs (open_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)')
      .run(openId, 'admin_verify_success', ip, userAgent);
  }

  return res.json({ success: true, isAdmin: true, verified: isValid });
});

// 检查是否为管理员
app.post('/api/check-admin', generalLimiter, (req, res) => {
  const { openId } = req.body;
  const configOpenId = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_openid');
  return res.json({
    success: true,
    isAdmin: configOpenId && openId === configOpenId.value
  });
});

// 记录访问日志
app.post('/api/log-access', logLimiter, (req, res) => {
  const { openId, action } = req.body;
  if (!openId || !action) return res.json({ success: false });
  if (typeof openId !== 'string' || openId.length > 128) return res.status(400).json({ success: false });
  if (typeof action !== 'string' || action.length > 64) return res.status(400).json({ success: false });
  const ip = getClientIP(req);
  const userAgent = (req.headers['user-agent'] || '').substring(0, 512);

  db.prepare('INSERT INTO access_logs (open_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)')
    .run(openId, action, ip, userAgent);

  return res.json({ success: true });
});

// 获取当前版本信息
app.get('/api/version', generalLimiter, (req, res) => {
  const info = db.prepare('SELECT version, release_date, changes FROM version_info WHERE id = 1').get();
  res.setHeader('Cache-Control', 'public, max-age=300');
  if (info) {
    res.json({ version: info.version, date: info.release_date, changes: JSON.parse(info.changes) });
  } else {
    res.json({ version: 'unknown', date: '', changes: [] });
  }
});

// ===== 管理后台 API =====

app.post('/api/admin/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;

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

app.post('/api/admin/change-password', authMiddleware, (req, res) => {
  const { oldPassword, newPassword } = req.body;

  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '新密码至少6位' });
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
app.post('/api/admin/logout', (req, res) => {
  const base = { secure: true, sameSite: 'Strict' };
  res.clearCookie('adminToken', { ...base, httpOnly: true });
  res.clearCookie('adminLoggedIn', base);
  return res.json({ success: true });
});

// 获取统计（优化：合并查询）
app.get('/api/admin/stats', authMiddleware, (req, res) => {
  const stats = db.prepare(`
    SELECT 
      (SELECT COUNT(*) FROM access_logs) as totalLogs,
      (SELECT COUNT(DISTINCT open_id) FROM access_logs) as uniqueOpenIds,
      (SELECT COUNT(*) FROM access_logs WHERE date(created_at) = date('now')) as todayLogs,
      (SELECT COUNT(*) FROM blacklist) as blockedCount
  `).get();

  const retentionConfig = db.prepare('SELECT value FROM config WHERE key = ?').get('log_retention_days');
  const logRetentionDays = retentionConfig ? parseInt(retentionConfig.value) : LOG_RETENTION_DAYS;

  return res.json({
    success: true,
    data: { ...stats, logRetentionDays }
  });
});

// 获取日志
app.get('/api/admin/logs', authMiddleware, (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const openIdFilter = req.query.openId || '';
  const actionFilter = req.query.action || '';
  const deviceFilter = req.query.device || '';
  const startDate = req.query.startDate || '';
  const endDate = req.query.endDate || '';

  let query = `
    SELECT l.*, t.tag, b.reason as blocked_reason
    FROM access_logs l
    LEFT JOIN openid_tags t ON l.open_id = t.open_id
    LEFT JOIN blacklist b ON l.open_id = b.open_id
  `;
  let countQuery = 'SELECT COUNT(*) as total FROM access_logs l';
  const conditions = [];
  const params = [];

  if (openIdFilter) {
    conditions.push('l.open_id LIKE ?');
    params.push(`%${openIdFilter}%`);
  }

  if (actionFilter) {
    conditions.push('l.action LIKE ?');
    params.push(`%${actionFilter}%`);
  }

  if (deviceFilter) {
    const devicePatterns = {
      'iphone': '%iPhone%',
      'ipad': '%iPad%',
      'android': '%Android%',
      'mac': '%Mac OS X%',
      'windows': '%Windows%',
      'wechat': '%MicroMessenger%'
    };
    if (devicePatterns[deviceFilter]) {
      conditions.push('l.user_agent LIKE ?');
      params.push(devicePatterns[deviceFilter]);
    }
  }

  if (startDate) {
    conditions.push('l.created_at >= ?');
    params.push(startDate + ' 00:00:00');
  }

  if (endDate) {
    conditions.push('l.created_at <= ?');
    params.push(endDate + ' 23:59:59');
  }

  if (conditions.length > 0) {
    const whereClause = ' WHERE ' + conditions.join(' AND ');
    query += whereClause;
    countQuery += whereClause;
  }

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
app.get('/api/admin/users', authMiddleware, (req, res) => {
  const users = db.prepare(`
    SELECT DISTINCT l.open_id, t.tag, 
      (SELECT COUNT(*) FROM access_logs WHERE open_id = l.open_id) as log_count,
      (SELECT MAX(created_at) FROM access_logs WHERE open_id = l.open_id) as last_active
    FROM access_logs l
    LEFT JOIN openid_tags t ON l.open_id = t.open_id
    ORDER BY last_active DESC
    LIMIT 500
  `).all();
  return res.json({ success: true, data: users });
});

// 标签管理
app.post('/api/admin/tag', authMiddleware, (req, res) => {
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

app.get('/api/admin/tags', authMiddleware, (req, res) => {
  const tags = db.prepare('SELECT * FROM openid_tags ORDER BY updated_at DESC').all();
  return res.json({ success: true, data: tags });
});

// 黑名单管理
app.post('/api/admin/blacklist/add', authMiddleware, (req, res) => {
  const { openId, reason } = req.body;
  if (!openId) return res.status(400).json({ error: 'OpenID 不能为空' });
  if (openId.length > 100) return res.status(400).json({ error: 'OpenID 过长' });
  if (reason && reason.length > 200) return res.status(400).json({ error: '拉黑原因过长（最多200字符）' });

  db.prepare('INSERT OR REPLACE INTO blacklist (open_id, reason) VALUES (?, ?)').run(openId, reason || '');
  return res.json({ success: true });
});

app.post('/api/admin/blacklist/remove', authMiddleware, (req, res) => {
  const { openId } = req.body;
  db.prepare('DELETE FROM blacklist WHERE open_id = ?').run(openId);
  return res.json({ success: true });
});

app.get('/api/admin/blacklist', authMiddleware, (req, res) => {
  const list = db.prepare(`
    SELECT b.*, t.tag
    FROM blacklist b
    LEFT JOIN openid_tags t ON b.open_id = t.open_id
    ORDER BY b.created_at DESC
  `).all();
  return res.json({ success: true, data: list });
});

// 管理员 OpenID 密码
app.post('/api/admin/update-openid-password', authMiddleware, (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: '密码至少6位' });
  }

  const newHash = bcrypt.hashSync(newPassword, 10);
  db.prepare(`INSERT INTO config (key, value) VALUES ('admin_openid_hash', ?) ON CONFLICT(key) DO UPDATE SET value = ?`).run(newHash, newHash);
  return res.json({ success: true });
});

// 清理日志
app.post('/api/admin/clear-logs', authMiddleware, (req, res) => {
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
app.post('/api/admin/delete-user-logs', authMiddleware, (req, res) => {
  const { openId } = req.body;
  if (!openId) return res.status(400).json({ error: 'OpenID 不能为空' });

  const result = db.prepare('DELETE FROM access_logs WHERE open_id = ?').run(openId);
  return res.json({ success: true, deleted: result.changes });
});

// 更新保留天数
app.post('/api/admin/update-retention', authMiddleware, (req, res) => {
  const { days } = req.body;
  const retentionDays = parseInt(days);

  if (!retentionDays || retentionDays < 1 || retentionDays > 365) {
    return res.status(400).json({ error: '保留天数应在 1-365 之间' });
  }

  db.prepare(`INSERT INTO config (key, value) VALUES ('log_retention_days', ?) ON CONFLICT(key) DO UPDATE SET value = ?`).run(String(retentionDays), String(retentionDays));
  return res.json({ success: true });
});

// 更新版本信息（仅保留最新一个版本，新版本覆盖旧版本）
app.post('/api/admin/version', authMiddleware, (req, res) => {
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

// 静态文件
// service-worker.js 不缓存，图标/manifest 缓存 7 天
app.use((req, res, next) => {
  if (req.path === '/service-worker.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  } else if (/\.(png|ico|json)$/.test(req.path)) {
    res.setHeader('Cache-Control', 'public, max-age=604800'); // 7 天
  } else if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=3600');
  }
  next();
});
app.use('/admin', express.static(path.join(__dirname, 'admin'), { etag: true, maxAge: '1h' }));
app.use(express.static(path.join(__dirname, 'public'), { etag: true }));

// ===== 通知 API =====

// 获取当前活跃通知（前端公开接口）
app.get('/api/notification', generalLimiter, (req, res) => {
  const n = db.prepare(
    'SELECT title, content, type, nonce FROM notification WHERE id = 1 AND is_active = 1'
  ).get();
  res.setHeader('Cache-Control', 'public, max-age=60');
  res.json(n || null);
});

// 管理员发布/更新通知
app.post('/api/admin/notification', authMiddleware, (req, res) => {
  const { title, content, type, is_active } = req.body;
  if (!title || !content) return res.status(400).json({ error: '标题和内容不能为空' });
  if (!['always', 'once'].includes(type)) return res.status(400).json({ error: '通知类型无效' });
  if (title.length > 100) return res.status(400).json({ error: '标题过长（最多100字符）' });
  if (content.length > 1000) return res.status(400).json({ error: '内容过长（最多1000字符）' });
  const nonce = require('crypto').randomBytes(8).toString('hex');
  db.prepare(`
    INSERT INTO notification (id, title, content, type, is_active, nonce) VALUES (1, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      title = excluded.title, content = excluded.content,
      type = excluded.type, is_active = excluded.is_active, nonce = excluded.nonce
  `).run(title, content, type, is_active ? 1 : 0, nonce);
  res.json({ success: true });
});

// 管理员停用通知
app.delete('/api/admin/notification', authMiddleware, (req, res) => {
  db.prepare('UPDATE notification SET is_active = 0 WHERE id = 1').run();
  res.json({ success: true });
});

// 管理员获取通知详情（含非活跃状态）
app.get('/api/admin/notification', authMiddleware, (req, res) => {
  const n = db.prepare('SELECT * FROM notification WHERE id = 1').get();
  res.json(n || null);
});

// 健康检查（含内存监控，需管理员认证）
app.get('/health', authMiddleware, (req, res) => {
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

app.listen(PORT, () => {
  console.log(`HHT Backend ${VERSION.version} running on port ${PORT}`);
  console.log(`Log retention: ${LOG_RETENTION_DAYS} days`);
  console.log(`Rate limiting: enabled`);
  console.log(`Trust proxy: enabled`);
});

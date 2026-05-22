const { SHANGHAI_OFFSET, LOG_RETENTION_DAYS } = require('./config');

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function isValidUsername(username) {
  return typeof username === 'string' && username.length >= 1 && username.length <= 64;
}

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= 1 && password.length <= 256;
}

function getClientIP(req) {
  return req.headers['cf-connecting-ip'] || req.ip;
}

function toSqliteUtc(date) {
  return date.toISOString().replace('T', ' ').substring(0, 19);
}

function parseAdminDateTime(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const normalized = trimmed.includes(' ') && !trimmed.includes('T')
    ? trimmed.replace(' ', 'T')
    : trimmed;
  const hasTimezone = /(?:Z|[+-]\d{2}:\d{2})$/.test(normalized);
  const date = new Date(hasTimezone ? normalized : `${normalized}${SHANGHAI_OFFSET}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function activeBlacklistCondition(column = 'expires_at') {
  return `(${column} IS NULL OR ${column} > datetime('now'))`;
}

function normalizeAdminLogFilters(source = {}) {
  const normalized = {
    openId: typeof source.openId === 'string' ? source.openId.trim() : '',
    userName: typeof source.userName === 'string' ? source.userName.trim() : '',
    tag: typeof source.tag === 'string' ? source.tag.trim() : '',
    action: typeof source.action === 'string' ? source.action.trim() : '',
    device: typeof source.device === 'string' ? source.device.trim() : '',
    blocked: typeof source.blocked === 'string' ? source.blocked.trim() : '',
    startDate: typeof source.startDate === 'string' ? source.startDate.trim() : '',
    endDate: typeof source.endDate === 'string' ? source.endDate.trim() : ''
  };

  if (!['', 'blocked', 'normal'].includes(normalized.blocked)) normalized.blocked = '';
  if (normalized.startDate && normalized.endDate && normalized.startDate > normalized.endDate) {
    const temp = normalized.startDate;
    normalized.startDate = normalized.endDate;
    normalized.endDate = temp;
  }
  return normalized;
}

function hasActiveAdminLogFilters(filters) {
  return Object.values(filters).some(Boolean);
}

function buildAdminLogFilterParts(rawFilters = {}) {
  const filters = normalizeAdminLogFilters(rawFilters);
  const joinedTables = `
    FROM access_logs l
    LEFT JOIN openid_tags t ON l.open_id = t.open_id
    LEFT JOIN blacklist b ON l.open_id = b.open_id AND ${activeBlacklistCondition('b.expires_at')}
    LEFT JOIN users u ON l.open_id = u.open_id
  `;
  const conditions = ["l.open_id NOT LIKE 'admin:%'"];
  const params = [];

  if (filters.openId) {
    conditions.push('l.open_id LIKE ?');
    params.push(`%${filters.openId}%`);
  }

  if (filters.userName) {
    conditions.push('u.name LIKE ?');
    params.push(`%${filters.userName}%`);
  }

  if (filters.tag) {
    conditions.push('t.tag LIKE ?');
    params.push(`%${filters.tag}%`);
  }

  if (filters.action === 'admin_verify') {
    conditions.push("(l.action = 'admin_verify_attempt' OR l.action = 'admin_verify_success')");
  } else if (filters.action) {
    conditions.push('l.action = ?');
    params.push(filters.action);
  }

  if (filters.device) {
    const devicePatterns = {
      'iphone': '%iPhone%',
      'ipad': '%iPad%',
      'android': '%Android%',
      'mac': '%Mac OS X%',
      'windows': '%Windows%',
      'wechat': '%MicroMessenger%'
    };
    if (devicePatterns[filters.device]) {
      conditions.push('l.user_agent LIKE ?');
      params.push(devicePatterns[filters.device]);
    }
  }

  if (filters.blocked === 'blocked') {
    conditions.push('b.open_id IS NOT NULL');
  } else if (filters.blocked === 'normal') {
    conditions.push('b.open_id IS NULL');
  }

  if (filters.startDate) {
    conditions.push('l.created_at >= ?');
    params.push(toSqliteUtc(new Date(filters.startDate + `T00:00:00${SHANGHAI_OFFSET}`)));
  }

  if (filters.endDate) {
    const endBoundary = new Date(filters.endDate + `T00:00:00${SHANGHAI_OFFSET}`);
    endBoundary.setDate(endBoundary.getDate() + 1);
    conditions.push('l.created_at < ?');
    params.push(toSqliteUtc(endBoundary));
  }

  return {
    filters,
    joinedTables,
    whereClause: conditions.length > 0 ? ` WHERE ${conditions.join(' AND ')}` : '',
    params
  };
}

function normalizeLogIds(input) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isInteger(value) && value > 0))];
}

function deleteAccessLogsByIds(db, ids) {
  const normalizedIds = normalizeLogIds(ids);
  if (normalizedIds.length === 0) return 0;

  const chunkSize = 300;
  const runDelete = db.transaction((allIds) => {
    let deleted = 0;
    for (let index = 0; index < allIds.length; index += chunkSize) {
      const chunk = allIds.slice(index, index + chunkSize);
      const placeholders = chunk.map(() => '?').join(', ');
      const result = db.prepare(`DELETE FROM access_logs WHERE id IN (${placeholders})`).run(...chunk);
      deleted += result.changes;
    }
    return deleted;
  });

  return runDelete(normalizedIds);
}

const serverGeoCache = new Map();

function isPrivateIP(ip) {
  if (!ip) return true;
  if (/^(10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|127\.|169\.254\.)/.test(ip)) return true;
  if (ip === '::1' || /^(fc|fd|fe80)/i.test(ip)) return true;
  return false;
}

function flagEmoji(code) {
  if (!code || code.length !== 2) return '';
  try {
    return String.fromCodePoint(...code.toUpperCase().split('').map(c => 0x1F1E6 + c.charCodeAt(0) - 65));
  } catch { return ''; }
}

function createGeoService(db) {
  async function fetchAndStoreGeo(ip, logId) {
    if (isPrivateIP(ip)) return;
    if (serverGeoCache.has(ip)) {
      const geo = serverGeoCache.get(ip);
      if (geo) db.prepare('UPDATE access_logs SET ip_geo = ? WHERE id = ?').run(geo, logId);
      return;
    }
    try {
      const res = await fetch(`https://api.ip.sb/geoip/${encodeURIComponent(ip)}`, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'hht-lite/1.0' },
        signal: AbortSignal.timeout(6000)
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const d = await res.json();
      const flag = flagEmoji(d.country_code);
      const parts = [d.city, d.country].filter(Boolean).join(' · ');
      const geo = flag ? `${flag} ${parts}` : parts;
      serverGeoCache.set(ip, geo || null);
      if (geo) db.prepare('UPDATE access_logs SET ip_geo = ? WHERE id = ?').run(geo, logId);
    } catch {
      serverGeoCache.set(ip, null);
    }
  }

  return { fetchAndStoreGeo };
}


function cleanOldLogs(db) {
  const retentionConfig = db.prepare('SELECT value FROM config WHERE key = ?').get('log_retention_days');
  const retentionDays = retentionConfig ? parseInt(retentionConfig.value, 10) : LOG_RETENTION_DAYS;

  const result = db.prepare(`
    DELETE FROM access_logs
    WHERE created_at < datetime('now', '-' || ? || ' days')
  `).run(retentionDays);

  if (result.changes > 0) {
    console.log(`[Auto Clean] Deleted ${result.changes} logs older than ${retentionDays} days`);
  }
  return result.changes;
}

function cleanExpiredBans(db) {
  const result = db.prepare("DELETE FROM blacklist WHERE expires_at IS NOT NULL AND expires_at <= datetime('now')").run();
  if (result.changes > 0) {
    console.log(`[Auto Clean] Removed ${result.changes} expired ban(s)`);
  }
  return result.changes;
}

module.exports = {
  clampInteger,
  isValidUsername,
  isValidPassword,
  getClientIP,
  toSqliteUtc,
  parseAdminDateTime,
  activeBlacklistCondition,
  normalizeAdminLogFilters,
  hasActiveAdminLogFilters,
  buildAdminLogFilterParts,
  normalizeLogIds,
  deleteAccessLogsByIds,
  createGeoService,
  cleanOldLogs,
  cleanExpiredBans
};

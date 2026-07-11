// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function parseIntegerSetting(name, rawValue, fallback, { min, max }) {
  if (rawValue === undefined || rawValue === '') return fallback;
  if (!/^\d+$/.test(rawValue)) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  const value = Number(rawValue);
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}`);
  }
  return value;
}

function parseAllowedOrigins(rawValue, { production = false } = {}) {
  if (!rawValue) {
    if (production) throw new Error('ALLOWED_ORIGINS is required in production');
    return ['https://huihutong.xjtlu.uk'];
  }

  const origins = rawValue.split(',').map(origin => origin.trim()).filter(Boolean);
  if (origins.length === 0) throw new Error('ALLOWED_ORIGINS must contain at least one origin');

  return origins.map((origin) => {
    let parsed;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(`ALLOWED_ORIGINS contains an invalid URL: ${origin}`);
    }
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
      throw new Error(`ALLOWED_ORIGINS must contain origins only: ${origin}`);
    }
    if (production && parsed.protocol !== 'https:') {
      throw new Error(`ALLOWED_ORIGINS must use HTTPS in production: ${origin}`);
    }
    return parsed.origin;
  });
}

function loadRuntimeConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  return {
    PORT: parseIntegerSetting('PORT', env.PORT, 3100, { min: 1, max: 65535 }),
    LOG_RETENTION_DAYS: parseIntegerSetting('LOG_RETENTION_DAYS', env.LOG_RETENTION_DAYS, 30, { min: 1, max: 3650 }),
    allowedOrigins: parseAllowedOrigins(env.ALLOWED_ORIGINS, { production })
  };
}

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const { PORT, LOG_RETENTION_DAYS, allowedOrigins } = loadRuntimeConfig();
const ADMIN_OPENID = process.env.ADMIN_OPENID || '';
const SHANGHAI_OFFSET = '+08:00';
const PUBLIC_LOG_ACTIONS = new Set([
  'page_load',
  'qr_manual',
  'qr_auto',
  'qr_timeout',
  'qr_blocked'
]);

const JWT_SECRET = process.env.JWT_SECRET || (() => {
  const keyFile = path.join(DATA_DIR, '.jwt_secret');
  try {
    const existing = fs.readFileSync(keyFile, 'utf8').trim();
    if (existing.length >= 32) {
      console.log('✅ JWT_SECRET 已从持久化文件加载');
      return existing;
    }
  } catch {}
  const key = crypto.randomBytes(32).toString('hex');
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(keyFile, key, { mode: 0o600 });
    console.log('✅ JWT_SECRET 已生成并持久化（data/.jwt_secret）');
  } catch (e) {
    console.log('⚠️  JWT_SECRET 无法持久化：', e.message);
  }
  return key;
})();

module.exports = {
  ROOT_DIR,
  DATA_DIR,
  PORT,
  LOG_RETENTION_DAYS,
  ADMIN_OPENID,
  SHANGHAI_OFFSET,
  PUBLIC_LOG_ACTIONS,
  allowedOrigins,
  JWT_SECRET,
  loadRuntimeConfig,
  parseAllowedOrigins,
  parseIntegerSetting
};

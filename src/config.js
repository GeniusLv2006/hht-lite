const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const PORT = process.env.PORT || 3100;
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS, 10) || 30;
const ADMIN_OPENID = process.env.ADMIN_OPENID || '';
const SHANGHAI_OFFSET = '+08:00';
const PUBLIC_LOG_ACTIONS = new Set([
  'page_load',
  'qr_manual',
  'qr_auto',
  'qr_timeout',
  'qr_blocked'
]);

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean)
  : ['https://huihutong.xjtlu.uk'];

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
  JWT_SECRET
};

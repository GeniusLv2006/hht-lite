// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const VERSION = require('../version.json');
const { DATA_DIR, LOG_RETENTION_DAYS, ADMIN_OPENID } = require('./config');

fs.mkdirSync(DATA_DIR, { recursive: true });
const db = new Database(path.join(DATA_DIR, 'hht.db'));

function createTables() {
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
      ban_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      expires_at DATETIME NULL
    );

    CREATE TABLE IF NOT EXISTS version_info (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      version TEXT NOT NULL,
      release_date TEXT NOT NULL,
      changes TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS notification (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      title TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'once' CHECK(type IN ('always','once')),
      is_active INTEGER NOT NULL DEFAULT 0,
      nonce TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      open_id TEXT PRIMARY KEY,
      user_id TEXT,
      name    TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function runMigrations() {
  try { db.exec('ALTER TABLE access_logs ADD COLUMN ip_geo TEXT'); } catch {}
  try { db.exec('ALTER TABLE blacklist ADD COLUMN expires_at DATETIME NULL'); } catch {}
  try { db.exec('ALTER TABLE blacklist ADD COLUMN ban_message TEXT'); } catch {}
}

function createIndexes() {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_access_logs_open_id ON access_logs(open_id);
    CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_access_logs_open_id_created_at ON access_logs(open_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_access_logs_action ON access_logs(action);
    CREATE INDEX IF NOT EXISTS idx_openid_tags_tag ON openid_tags(tag);
    CREATE INDEX IF NOT EXISTS idx_users_name ON users(name);
  `);
}

function initializeConfig() {
  const existingOpenId = db.prepare('SELECT value FROM config WHERE key = ?').get('admin_openid');
  if (!existingOpenId) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('admin_openid', ADMIN_OPENID);
  }

  const existingRetention = db.prepare('SELECT value FROM config WHERE key = ?').get('log_retention_days');
  if (!existingRetention) {
    db.prepare('INSERT INTO config (key, value) VALUES (?, ?)').run('log_retention_days', String(LOG_RETENTION_DAYS));
  }
}

function initializeAdminUser() {
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
}

function syncVersionInfo() {
  db.prepare(`
    INSERT INTO version_info (id, version, release_date, changes) VALUES (1, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      version = excluded.version,
      release_date = excluded.release_date,
      changes = excluded.changes
  `).run(VERSION.version, VERSION.date, JSON.stringify(VERSION.changes));
}

function initializeDatabase() {
  createTables();
  runMigrations();
  createIndexes();
  initializeConfig();
  initializeAdminUser();
  syncVersionInfo();
  db.pragma('journal_mode = WAL');
}

initializeDatabase();

module.exports = { db, initializeDatabase };

// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const assert = require('node:assert/strict');
const test = require('node:test');
const { loadRuntimeConfig, parseAllowedOrigins } = require('../src/config');

test('production requires explicit HTTPS origins', () => {
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production' }),
    /ALLOWED_ORIGINS is required in production/
  );
  assert.throws(
    () => loadRuntimeConfig({ NODE_ENV: 'production', ALLOWED_ORIGINS: 'http://example.com' }),
    /must use HTTPS/
  );
});

test('allowed origins are normalized and reject paths or credentials', () => {
  assert.deepEqual(
    parseAllowedOrigins('https://one.example, https://two.example:8443'),
    ['https://one.example', 'https://two.example:8443']
  );
  assert.throws(() => parseAllowedOrigins('https://example.com/path'), /origins only/);
  assert.throws(() => parseAllowedOrigins('https://user:secret@example.com'), /origins only/);
});

test('runtime integer settings reject invalid and out-of-range values', () => {
  assert.deepEqual(
    loadRuntimeConfig({ ALLOWED_ORIGINS: 'https://example.com', PORT: '8080', LOG_RETENTION_DAYS: '90' }),
    { PORT: 8080, LOG_RETENTION_DAYS: 90, allowedOrigins: ['https://example.com'] }
  );
  assert.throws(() => loadRuntimeConfig({ PORT: '0' }), /PORT must be an integer/);
  assert.throws(() => loadRuntimeConfig({ PORT: '3100x' }), /PORT must be an integer/);
  assert.throws(() => loadRuntimeConfig({ LOG_RETENTION_DAYS: '0' }), /LOG_RETENTION_DAYS must be an integer/);
});

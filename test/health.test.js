// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const assert = require('node:assert/strict');
const { afterEach, test } = require('node:test');
const express = require('express');
const createHealthRouter = require('../src/routes/health');
const VERSION = require('../version.json');

const servers = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise((resolve, reject) => {
    server.close(error => error ? reject(error) : resolve());
  })));
});

async function requestHealth(db, options) {
  const app = express();
  app.use(createHealthRouter({ db }));
  const server = app.listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise(resolve => server.once('listening', resolve));
  const { port } = server.address();
  return fetch(`http://127.0.0.1:${port}/healthz`, options);
}

test('GET /healthz reports a healthy database without authentication', async () => {
  const db = { prepare: sql => {
    assert.equal(sql, 'SELECT 1');
    return { get: () => ({ 1: 1 }) };
  } };

  const response = await requestHealth(db);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { status: 'ok', version: VERSION.version });
});

test('HEAD /healthz supports the Docker health probe', async () => {
  const db = { prepare: () => ({ get: () => ({ 1: 1 }) }) };

  const response = await requestHealth(db, { method: 'HEAD' });

  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(await response.text(), '');
});

test('GET /healthz reports an unavailable database', async () => {
  const db = { prepare: () => {
    throw new Error('database unavailable');
  } };

  const response = await requestHealth(db);

  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { status: 'unavailable' });
});

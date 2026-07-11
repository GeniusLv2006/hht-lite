// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('v6 frontend retains compatible storage and API contracts', () => {
  const app = read('public/app.js');
  for (const key of ['openId', 'satoken_cache', 'theme', 'agreement_accepted', 'auto_refresh', 'qr_ecl', 'hdr_brightness_assist']) {
    assert.match(app, new RegExp(`['\"]${key}['\"]`), `missing browser storage key ${key}`);
  }
  for (const endpoint of ['/web-app/auth/certificateLogin', '/pms/welcome/make-qrcode', '/api/check-blacklist', '/api/log-access']) {
    assert.ok(app.includes(endpoint), `missing endpoint ${endpoint}`);
  }
});

test('input dialog uses a single replaceable settlement callback', () => {
  const app = read('public/app.js');
  assert.ok(app.includes('let activeInputDialog = null'));
  assert.ok(app.includes('if (activeInputDialog) activeInputDialog(null)'));
  assert.ok(app.includes('dialogConfirm.onclick = null'));
  assert.ok(app.includes('dialogCancel.onclick = null'));
});

test('only the independently generated HDR primer is shipped', () => {
  const videos = fs.readdirSync(path.join(root, 'public', 'videos')).sort();
  assert.deepEqual(videos, ['hdr-primer.mp4', 'hdr-primer.mp4.license']);
  assert.ok(fs.statSync(path.join(root, 'public', 'videos', 'hdr-primer.mp4')).size > 0);
});

test('service worker routes API requests directly to the network', async () => {
  const listeners = {};
  const fetchCalls = [];
  const context = {
    URL,
    Promise,
    Response,
    fetch: request => {
      fetchCalls.push(request);
      return Promise.resolve(new Response('{}'));
    },
    caches: {
      open: async () => ({ add: async () => {}, match: async () => null, put: async () => {} }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null
    },
    clients: { matchAll: async () => [] },
    self: {
      location: { origin: 'https://example.test' },
      clients: { claim: async () => {} },
      skipWaiting: () => {},
      addEventListener: (name, handler) => { listeners[name] = handler; }
    }
  };
  vm.runInNewContext(read('public/service-worker.js'), context);

  let responsePromise;
  const request = new Request('https://example.test/api/version');
  listeners.fetch({ request, respondWith: promise => { responsePromise = promise; } });
  await responsePromise;
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0], request);
});

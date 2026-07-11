// Copyright (c) 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  clampInteger,
  isValidPassword,
  isValidUsername,
  normalizeLogIds
} = require('../src/utils');

test('clampInteger applies bounds and fallback values', () => {
  assert.equal(clampInteger('5', 1, 10, 3), 5);
  assert.equal(clampInteger('99', 1, 10, 3), 10);
  assert.equal(clampInteger('invalid', 1, 10, 3), 3);
});

test('admin credential validation enforces non-empty bounded values', () => {
  assert.equal(isValidUsername('admin_01'), true);
  assert.equal(isValidUsername(''), false);
  assert.equal(isValidUsername('a'.repeat(65)), false);
  assert.equal(isValidPassword('correct horse battery staple'), true);
  assert.equal(isValidPassword(''), false);
  assert.equal(isValidPassword('a'.repeat(257)), false);
});

test('normalizeLogIds keeps unique positive integer IDs only', () => {
  assert.deepEqual(normalizeLogIds([1, '2', 2, 0, -1, 'bad']), [1, 2]);
});

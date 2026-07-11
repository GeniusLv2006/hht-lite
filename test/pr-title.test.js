const assert = require('node:assert/strict');
const test = require('node:test');
const { isConventionalPrTitle } = require('../scripts/check-pr-title');

test('accepts Conventional Commit PR titles', () => {
  assert.equal(isConventionalPrTitle('feat: add self-hosting support'), true);
  assert.equal(isConventionalPrTitle('fix(deploy): restore the previous container'), true);
  assert.equal(isConventionalPrTitle('feat!: remove legacy deployment support'), true);
});

test('rejects branded or non-conventional PR titles', () => {
  assert.equal(isConventionalPrTitle('[codex] Add deployment checks'), false);
  assert.equal(isConventionalPrTitle('Add deployment checks'), false);
  assert.equal(isConventionalPrTitle('release: v5.1.0'), false);
});

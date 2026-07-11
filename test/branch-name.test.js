const assert = require('node:assert/strict');
const test = require('node:test');
const { isConventionalBranchName } = require('../scripts/check-branch-name');

test('accepts conventional branch paths', () => {
  assert.equal(isConventionalBranchName('feat/self-hosting'), true);
  assert.equal(isConventionalBranchName('fix/deploy/automatic-rollback'), true);
  assert.equal(isConventionalBranchName('chore/release/v5-2-0'), true);
});

test('rejects branded or non-conventional branch paths', () => {
  assert.equal(isConventionalBranchName('codex/self-hosting'), false);
  assert.equal(isConventionalBranchName('self-hosting'), false);
  assert.equal(isConventionalBranchName('feat/Self-Hosting'), false);
});

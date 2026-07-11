#!/usr/bin/env node

const CONVENTIONAL_BRANCH_NAME = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)\/(?:[a-z0-9._-]+\/)?[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isConventionalBranchName(name) {
  return typeof name === 'string' && CONVENTIONAL_BRANCH_NAME.test(name);
}

if (require.main === module) {
  const name = process.env.BRANCH_NAME || process.argv[2];
  if (!isConventionalBranchName(name)) {
    console.error('Branch name must use type/description or type/scope/description, for example: feat/self-hosting');
    process.exit(1);
  }
  console.log(`Branch name is valid: ${name}`);
}

module.exports = { isConventionalBranchName };

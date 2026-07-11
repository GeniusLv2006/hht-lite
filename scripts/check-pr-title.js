#!/usr/bin/env node

const CONVENTIONAL_PR_TITLE = /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert)(\([a-z0-9._/-]+\))?!?: .+$/;

function isConventionalPrTitle(title) {
  return typeof title === 'string' && CONVENTIONAL_PR_TITLE.test(title);
}

if (require.main === module) {
  const title = process.env.PR_TITLE || process.argv.slice(2).join(' ');
  if (!isConventionalPrTitle(title)) {
    console.error('PR title must use Conventional Commits, for example: feat: add self-hosting support');
    process.exit(1);
  }
  console.log(`PR title is valid: ${title}`);
}

module.exports = { isConventionalPrTitle };

#!/usr/bin/env node
// 将 version.json 的版本号同步到 service-worker.js 的 CACHE_NAME
// 在每次修改 version.json 后运行：npm run sync-version

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'version.json'));

const swPath = path.join(root, 'public', 'service-worker.js');
const swContent = fs.readFileSync(swPath, 'utf8');

const updated = swContent.replace(
  /const CACHE_NAME = 'offline-cache-v[\d.]+';/,
  `const CACHE_NAME = 'offline-cache-${version}';`
);

if (updated === swContent) {
  console.log(`service-worker.js CACHE_NAME 已是最新（${version}），无需更新`);
} else {
  fs.writeFileSync(swPath, updated, 'utf8');
  console.log(`✅ service-worker.js CACHE_NAME 已更新为 offline-cache-${version}`);
}

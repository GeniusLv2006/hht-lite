#!/usr/bin/env node
// 将 version.json 的版本号同步到 service-worker.js 的 CACHE_NAME 和静态资源版本参数
// 在每次修改 version.json 后运行：npm run sync-version

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const { version } = require(path.join(root, 'version.json'));

const swPath = path.join(root, 'public', 'service-worker.js');
const swContent = fs.readFileSync(swPath, 'utf8');

const updatedSw = swContent.replace(
  /const CACHE_NAME = 'offline-cache-v[\d.]+';/,
  `const CACHE_NAME = 'offline-cache-${version}';`
).replace(
  /\/(app\.css|app\.js|qr\.min\.js)(?:\?v=v[\d.]+)?/g,
  `/$1?v=${version}`
);

if (updatedSw === swContent) {
  console.log(`service-worker.js 已是最新（${version}），无需更新`);
} else {
  fs.writeFileSync(swPath, updatedSw, 'utf8');
  console.log(`✅ service-worker.js 已同步为 ${version}`);
}

const indexPath = path.join(root, 'public', 'index.html');
const indexContent = fs.readFileSync(indexPath, 'utf8');
const updatedIndex = indexContent.replace(
  /"\.\/(app\.css|app\.js|qr\.min\.js)(?:\?v=v[\d.]+)?"/g,
  `"./$1?v=${version}"`
);

if (updatedIndex === indexContent) {
  console.log(`index.html 资源版本已是最新（${version}），无需更新`);
} else {
  fs.writeFileSync(indexPath, updatedIndex, 'utf8');
  console.log(`✅ index.html 资源版本已同步为 ${version}`);
}

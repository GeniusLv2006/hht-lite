#!/usr/bin/env node
// 以 package.json 为唯一版本来源，同步发布元数据和 PWA 静态资源版本。

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const versionPath = path.join(root, 'version.json');
const release = require(versionPath);
const version = `v${packageJson.version}`;
const date = new Date().toISOString().slice(0, 10);

const updatedRelease = {
  ...release,
  version,
  date: release.version === version ? release.date : date
};

if (JSON.stringify(updatedRelease) !== JSON.stringify(release)) {
  fs.writeFileSync(versionPath, `${JSON.stringify(updatedRelease, null, 2)}\n`, 'utf8');
  console.log(`✅ version.json 已同步为 ${version}`);
} else {
  console.log(`version.json 已是最新（${version}），无需更新`);
}

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

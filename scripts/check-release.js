#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const packageJson = require(path.join(root, 'package.json'));
const packageLock = require(path.join(root, 'package-lock.json'));
const release = require(path.join(root, 'version.json'));

const expectedVersion = `v${packageJson.version}`;
const errors = [];

if (!/^\d+\.\d+\.\d+$/.test(packageJson.version)) {
  errors.push(`package.json version is not stable SemVer: ${packageJson.version}`);
}
if (packageLock.version !== packageJson.version || packageLock.packages?.['']?.version !== packageJson.version) {
  errors.push('package-lock.json version does not match package.json');
}
if (release.version !== expectedVersion) {
  errors.push(`version.json must use ${expectedVersion}`);
}
if (!/^\d{4}-\d{2}-\d{2}$/.test(release.date) || Number.isNaN(Date.parse(`${release.date}T00:00:00Z`))) {
  errors.push(`version.json has an invalid release date: ${release.date}`);
}
if (!Array.isArray(release.changes) || release.changes.length === 0 || release.changes.some(item => typeof item !== 'string' || !item.trim())) {
  errors.push('version.json changes must contain at least one non-empty entry');
}

const serviceWorker = fs.readFileSync(path.join(root, 'public', 'service-worker.js'), 'utf8');
const indexHtml = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');

if (!serviceWorker.includes(`const CACHE_NAME = 'offline-cache-${expectedVersion}';`)) {
  errors.push('service-worker.js cache name is out of sync');
}

for (const asset of ['app.css', 'app.js', 'qr.min.js']) {
  if (!serviceWorker.includes(`/${asset}?v=${expectedVersion}`)) {
    errors.push(`service-worker.js ${asset} version is out of sync`);
  }
  if (!indexHtml.includes(`./${asset}?v=${expectedVersion}`)) {
    errors.push(`index.html ${asset} version is out of sync`);
  }
}

if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Release metadata is consistent (${expectedVersion})`);

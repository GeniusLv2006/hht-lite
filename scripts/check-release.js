#!/usr/bin/env node
// SPDX-FileCopyrightText: 2026 GeniusLv2006
// SPDX-License-Identifier: MPL-2.0

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
const appJs = fs.readFileSync(path.join(root, 'public', 'app.js'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'public', 'manifest.json'), 'utf8'));

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

const hdrPrimer = path.join(root, 'public', 'videos', 'hdr-primer.mp4');
if (!fs.existsSync(hdrPrimer) || fs.statSync(hdrPrimer).size === 0) {
  errors.push('the independently generated HDR primer is missing');
}
if (!serviceWorker.includes('/videos/hdr-primer.mp4') || !appJs.includes("'./videos/hdr-primer.mp4'")) {
  errors.push('HDR primer references are incomplete');
}

for (const retiredAsset of ['white.png', 'white1.mp4', 'white1.webm', 'white2.mp4']) {
  if (fs.existsSync(path.join(root, 'public', 'videos', retiredAsset))) {
    errors.push(`retired upstream asset remains: ${retiredAsset}`);
  }
}

if (/mercutiojohn\/hht-web/i.test(`${readme}\n${appJs}`)) {
  errors.push('current public surfaces still describe an hht-web dependency');
}

if (manifest.id !== '/index.html' || manifest.scope !== '/' || manifest.start_url !== './index.html') {
  errors.push('manifest navigation scope is inconsistent');
}

if (errors.length > 0) {
  console.error(errors.map(error => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Release metadata is consistent (${expectedVersion})`);

#!/usr/bin/env node
// Drawio公式ビューアーJSをmedia/に取得する。冪等：既に存在すればスキップ。
const fs = require('fs');
const path = require('path');
const https = require('https');

const URL = 'https://viewer.diagrams.net/js/viewer-static.min.js';
const OUT = path.join(__dirname, '..', 'media', 'viewer-static.min.js');

if (fs.existsSync(OUT) && fs.statSync(OUT).size > 100_000) {
  console.log('[fetch-viewer] already present:', OUT);
  process.exit(0);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });

function get(url, resolve, reject, redirects = 0) {
  if (redirects > 5) {
    return reject(new Error('too many redirects'));
  }
  https
    .get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return get(res.headers.location, resolve, reject, redirects + 1);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const file = fs.createWriteStream(OUT);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', reject);
    })
    .on('error', reject);
}

new Promise((resolve, reject) => get(URL, resolve, reject))
  .then(() => {
    const size = fs.statSync(OUT).size;
    console.log(`[fetch-viewer] downloaded ${size} bytes -> ${OUT}`);
    if (size < 100_000) {
      console.error('[fetch-viewer] WARN: file size unexpectedly small. URL may have changed.');
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error('[fetch-viewer] failed:', err.message);
    console.error('  手動でダウンロードして配置してください: ' + URL);
    process.exit(1);
  });

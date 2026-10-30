import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const html = await readFile('dist/index.html', 'utf8');
const assets = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1]);
let total = 0;
for (const asset of assets) {
  const path = join('dist', asset.replace(/^\//, ''));
  const compressed = gzipSync(await readFile(path)).byteLength;
  total += compressed;
  console.log(`${asset}: ${(compressed / 1024).toFixed(1)} KB gzipped`);
}
if (total > 180 * 1024) { console.error(`Initial JavaScript is ${(total / 1024).toFixed(1)} KB gzipped (limit 180 KB).`); process.exitCode = 1; }
else console.log(`Total initial JavaScript: ${(total / 1024).toFixed(1)} KB gzipped.`);

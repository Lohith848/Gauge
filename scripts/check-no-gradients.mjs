import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['src', 'dist'];
const allowed = new Set(['.css', '.js', '.html', '.svg']);
const violations = [];
async function scan(directory) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (allowed.has(extname(entry.name).toLowerCase())) {
      const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
      lines.forEach((line, index) => {
        if (/gradient|background-clip\s*:\s*text/i.test(line)) violations.push(`${path}:${index + 1}: ${line.trim()}`);
      });
    }
  }
}
for (const root of roots) await scan(root);
if (violations.length) { console.error(violations.join('\n')); process.exitCode = 1; }
else console.log('No gradients found in src/ or dist/.');

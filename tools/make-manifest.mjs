// Erzeugt web/manifest.json: Dateiliste mit Hash, Größe und Klasse (code | data).
// Aufruf: node tools/make-manifest.mjs [web-Ordner] [version]
import { readdirSync, statSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { createHash } from 'node:crypto';

const root = process.argv[2] || 'web';
const version = process.argv[3] || process.env.FINN_VERSION || new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '');
const SKIP = new Set(['manifest.json', 'sw.js']);       // sw.js aktualisiert der Browser selbst
const files = [];
(function walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n), s = statSync(p);
    if (s.isDirectory()) { if (n !== 'node_modules' && !n.startsWith('.')) walk(p); continue; }
    const rel = relative(root, p).split(sep).join('/');
    if (SKIP.has(rel) || n.startsWith('.')) continue;
    const hash = createHash('sha256').update(readFileSync(p)).digest('hex').slice(0, 16);
    const data = s.size > 300_000 || /^(lib|assets)\//.test(rel) || /\.(glb|wasm|data|onnx|png)$/.test(rel);
    files.push({ path: rel, hash, size: s.size, class: data ? 'data' : 'code' });
  }
})(root);
files.sort((a, b) => a.path.localeCompare(b.path));
writeFileSync(join(root, 'manifest.json'), JSON.stringify({ version, built: new Date().toISOString(), files }, null, 1));
const mb = (c) => (files.filter(f => f.class === c).reduce((a, f) => a + f.size, 0) / 1e6).toFixed(1);
console.log(`manifest.json: ${files.length} Dateien, Version ${version} (code ${mb('code')} MB, data ${mb('data')} MB)`);

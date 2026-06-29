#!/usr/bin/env node
// Download all source files from a Vercel deployment via v8 endpoint.
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const DEPLOYMENT_ID = 'dpl_7qxoPJGpy34Qrhb5nRzhWLAfFDpV';
const TEAM_ID = 'team_xQgfSmNbNo5JFCAaVyRboPBf';
const OUT_ROOT = '/home/z/my-project/old-deployment/files';
const CONCURRENCY = 6;

if (!VERCEL_TOKEN) { console.error('VERCEL_TOKEN required'); process.exit(1); }

const treeRaw = await import('node:fs').then(f => f.readFileSync('/home/z/my-project/old-deployment/_file-tree.json', 'utf8'));
const tree = JSON.parse(treeRaw);

function* walk(entries, prefix = '') {
  for (const e of entries) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.type === 'directory') yield* walk(e.children || [], p);
    else yield { path: p, uid: e.uid };
  }
}
const allFiles = [...walk(tree)];

const SKIP_DIRS = ['node_modules/', '.next/', 'out/', '.git/', '.vercel/'];
const SKIP_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.otf', '.lock', '.pdf', '.mp4', '.webm'];
const SKIP_NAMES = ['package-lock.json', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'];

const wanted = allFiles.filter(f => {
  if (!f.path.startsWith('src/')) return false;
  const sub = f.path.slice(4);
  if (SKIP_DIRS.some(d => sub.startsWith(d) || sub.includes('/' + d))) return false;
  if (SKIP_NAMES.some(n => sub.endsWith(n))) return false;
  if (SKIP_EXT.some(e => sub.toLowerCase().endsWith(e))) return false;
  if (sub.startsWith('.images/')) return false;
  if (sub.startsWith('.env')) return false;
  return true;
});
console.log(`Files to download: ${wanted.length}`);

async function download(file) {
  // Vercel wraps the deployment root in a "src/" folder. Strip that.
  const localPath = join(OUT_ROOT, file.path.replace(/^src\//, ''));
  if (existsSync(localPath)) {
    return { ...file, ok: true, bytes: 0, localPath, skipped: true };
  }
  mkdirSync(dirname(localPath), { recursive: true });
  const url = `https://api.vercel.com/v8/deployments/${DEPLOYMENT_ID}/files/${file.uid}?teamId=${TEAM_ID}`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
    if (!res.ok) {
      if (attempt === 2) {
        console.error(`FAIL [${res.status}] ${file.path}`);
        return { ...file, ok: false, status: res.status };
      }
      await new Promise(r => setTimeout(r, 800 * (attempt + 1)));
      continue;
    }
    const json = await res.json();
    if (!json.data) {
      console.error(`NO data field for ${file.path}`);
      return { ...file, ok: false, status: 'no-data' };
    }
    const buf = Buffer.from(json.data, 'base64');
    writeFileSync(localPath, buf);
    return { ...file, ok: true, bytes: buf.length, localPath };
  }
}

const results = [];
const queue = [...wanted];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const f = queue.shift();
    if (f) results.push(await download(f));
  }
});
await Promise.all(workers);

const ok = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok);
console.log(`Downloaded: ${ok} OK, ${fail.length} FAILED`);
if (fail.length) for (const f of fail) console.log(' FAILED:', f.path, f.status);
writeFileSync('/home/z/my-project/old-deployment/_download-results.json', JSON.stringify(results, null, 2));
console.log('Done. Files under:', OUT_ROOT);

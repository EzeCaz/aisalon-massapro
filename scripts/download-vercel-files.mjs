#!/usr/bin/env node
// Download all source files from a Vercel deployment's file tree.
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const DEPLOYMENT_ID = 'dpl_7qxoPJGpy34Qrhb5nRzhWLAfFDpV';
const OUT_ROOT = '/home/z/my-project/old-deployment/files';
const CONCURRENCY = 8;

if (!VERCEL_TOKEN) { console.error('VERCEL_TOKEN required'); process.exit(1); }

const treeRaw = await import('node:fs').then(f => f.readFileSync('/home/z/my-project/old-deployment/_file-tree.json', 'utf8'));
const tree = JSON.parse(treeRaw);

// Flatten the tree into {path, uid} pairs.
function* walk(entries, prefix = '') {
  for (const e of entries) {
    const p = prefix ? `${prefix}/${e.name}` : e.name;
    if (e.type === 'directory') yield* walk(e.children || [], p);
    else yield { path: p, uid: e.uid };
  }
}
const allFiles = [...walk(tree)];
console.log(`Total files in deployment: ${allFiles.length}`);

// Filter: keep only source code we want to compare. Skip build output, node_modules, images, lock files, etc.
const SKIP_DIRS = ['node_modules/', '.next/', 'out/', '.git/', '.vercel/'];
const SKIP_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.woff', '.woff2', '.ttf', '.otf', '.lock', '.pdf', '.mp4', '.webm'];
const SKIP_NAMES = ['package-lock.json', 'bun.lockb', 'yarn.lock', 'pnpm-lock.yaml'];

const wanted = allFiles.filter(f => {
  // Strip the leading "src/" deployment-root prefix — Vercel wraps everything under a "src" dir
  // (not the project's src/, but the deployment's root)
  if (!f.path.startsWith('src/')) return false;
  const sub = f.path.slice(4); // strip "src/"
  if (SKIP_DIRS.some(d => sub.startsWith(d) || sub.includes('/' + d))) return false;
  if (SKIP_NAMES.some(n => sub.endsWith(n))) return false;
  if (SKIP_EXT.some(e => sub.toLowerCase().endsWith(e))) return false;
  // Skip the .images directory (binary assets we don't need for diff)
  if (sub.startsWith('.images/')) return false;
  // Skip env files (secrets)
  if (sub.startsWith('.env')) return false;
  return true;
});
console.log(`Files to download (after filtering): ${wanted.length}`);

// Save the wanted list
writeFileSync('/home/z/my-project/old-deployment/_wanted-files.json', JSON.stringify(wanted, null, 2));

// Download with concurrency limit
async function download(file) {
  const url = `https://api.vercel.com/v2/files/${file.uid}`;
  const localPath = join(OUT_ROOT, file.path.replace(/^src\//, ''));
  mkdirSync(dirname(localPath), { recursive: true });
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } });
    if (!res.ok) {
      if (attempt === 2) {
        console.error(`FAIL [${res.status}] ${file.path}`);
        return { ...file, ok: false, status: res.status };
      }
      await new Promise(r => setTimeout(r, 500 * (attempt + 1)));
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    writeFileSync(localPath, buf);
    return { ...file, ok: true, bytes: buf.length, localPath };
  }
}

const results = [];
const queue = [...wanted];
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const f = queue.shift();
    results.push(await download(f));
  }
});
await Promise.all(workers);

const ok = results.filter(r => r.ok).length;
const fail = results.filter(r => !r.ok);
console.log(`Downloaded: ${ok} OK, ${fail.length} FAILED`);
if (fail.length) {
  console.log('Failed files:');
  for (const f of fail) console.log(' ', f.path, f.status);
}
writeFileSync('/home/z/my-project/old-deployment/_download-results.json', JSON.stringify(results, null, 2));
console.log('Done. Files saved under:', OUT_ROOT);

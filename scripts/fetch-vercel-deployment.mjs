#!/usr/bin/env node
// Fetch deployment metadata + file tree from Vercel API.
import { writeFileSync } from 'node:fs';

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const DEPLOYMENT_ID = process.argv[2] || 'dpl_7qxoPJGpy34Qrhb5nRzhWLAfFDpV';

if (!VERCEL_TOKEN) {
  console.error('VERCEL_TOKEN env var required');
  process.exit(1);
}

async function main() {
  console.log(`Fetching deployment metadata for ${DEPLOYMENT_ID}...`);
  const metaRes = await fetch(
    `https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );
  if (!metaRes.ok) {
    console.error('metadata HTTP', metaRes.status, await metaRes.text());
    process.exit(2);
  }
  const meta = await metaRes.json();
  writeFileSync('/home/z/my-project/old-deployment/_deployment-meta.json',
    JSON.stringify(meta, null, 2));
  console.log('Saved metadata. Key fields:');
  console.log('  uid        :', meta.uid);
  console.log('  name       :', meta.name);
  console.log('  url        :', meta.url);
  console.log('  ready      :', meta.ready);
  console.log('  state      :', meta.state);
  console.log('  target     :', meta.target);
  console.log('  projectId  :', meta.projectId);
  console.log('  meta.source:', meta.meta?.source);
  console.log('  meta.githubCommitSha:', meta.meta?.githubCommitSha);
  console.log('  meta.githubCommitMessage:', (meta.meta?.githubCommitMessage || '').slice(0, 100));
  console.log('  builds     :', JSON.stringify(meta.builds?.map(b => ({ src: b.src, use: b.use })), null, 2));

  console.log('\nFetching file tree...');
  const filesRes = await fetch(
    `https://api.vercel.com/v13/deployments/${DEPLOYMENT_ID}/files`,
    { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
  );
  if (!filesRes.ok) {
    console.error('files HTTP', filesRes.status, await filesRes.text());
    process.exit(3);
  }
  const filesJson = await filesRes.json();
  writeFileSync('/home/z/my-project/old-deployment/_file-tree.json',
    JSON.stringify(filesJson, null, 2));
  console.log('Saved file tree. Total entries:', filesJson.length || (filesJson.entries?.length) || 'unknown');
}

main().catch(e => { console.error(e); process.exit(99); });

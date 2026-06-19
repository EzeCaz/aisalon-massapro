// Quick sanity check that the blob-paths helper produces safe pathnames
// for the scenarios that were causing the upload error.
//
// Run with: node --experimental-strip-types scripts/test-blob-paths.mjs
// (or compile to .mjs by hand). To keep things simple, we import from
// the .ts source via tsx-style require using the compiled Next.js
// pipeline — but to avoid that complexity here, we re-implement a
// tiny inline test by importing the compiled output of `tsc` if present.
//
// Simpler approach: just import the source as ESM using Node's
// --experimental-strip-types flag (Node 22+ supports this).

import { safeFileExtension, safeBlobPathname, uniqueBlobFilename } from "../src/lib/blob-paths.ts";

const cases = [
  // [fileName, mimeType, fallback, expected]
  ["photo.jpg", "image/jpeg", "jpg", "jpg"],
  ["deck.PPTX", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "bin", "pptx"],
  // The bug — Hebrew filename with no extension. Old code: returned "תמונה".
  // New code: falls back to MIME mapping → "jpg".
  ["תמונה", "image/jpeg", "jpg", "jpg"],
  // Hebrew filename with no extension and no MIME → falls back to "bin".
  ["תמונה", "", "bin", "bin"],
  // Hebrew filename with English extension → uses the English extension.
  ["תמונה.jpg", "image/jpeg", "jpg", "jpg"],
  // No name, just MIME.
  ["", "image/png", "bin", "png"],
  // Generic MIME with no extension.
  ["archive", "application/octet-stream", "bin", "bin"],
  // .tar.gz — last extension wins (correct behavior).
  ["archive.tar.gz", "application/gzip", "bin", "gz"],
  // Extension too long (>8 chars) — should fall back.
  ["file.superlongextension", "application/octet-stream", "bin", "bin"],
  // Extension with special chars — should fall back.
  ["file.e-x_t", "application/octet-stream", "bin", "bin"],
];

let pass = 0, fail = 0;
for (const [name, mime, fallback, expected] of cases) {
  const got = safeFileExtension(name, mime, fallback);
  const ok = got === expected;
  console.log(`${ok ? "✓" : "✗"} safeFileExtension(${JSON.stringify(name)}, ${JSON.stringify(mime)}, ${JSON.stringify(fallback)}) = ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`);
  ok ? pass++ : fail++;
}

console.log("\n--- safeBlobPathname ---");
const pathCases = [
  [["events", "cmql999520003jv04bx78lsln", "presentations", uniqueBlobFilename("pdf")], true],
  [["events", "cmql999520003jv04bx78lsln", uniqueBlobFilename("jpg")], true],
  // '..' should throw
  [["events", "..", "secret"], false],
  // empty result should throw
  [[], false],
  // non-ASCII segment should throw (defense in depth — should never
  // happen because the extension is sanitized upstream, but the helper
  // is the last line of defense).
  [["events", "תמונה", "x.jpg"], false],
];
for (const [segs, shouldSucceed] of pathCases) {
  try {
    const result = safeBlobPathname(...segs);
    if (shouldSucceed) {
      console.log(`✓ safeBlobPathname(${JSON.stringify(segs)}) = ${JSON.stringify(result)}`);
      pass++;
    } else {
      console.log(`✗ safeBlobPathname(${JSON.stringify(segs)}) = ${JSON.stringify(result)} (expected to throw)`);
      fail++;
    }
  } catch (e) {
    if (!shouldSucceed) {
      console.log(`✓ safeBlobPathname(${JSON.stringify(segs)}) threw as expected: ${e.message}`);
      pass++;
    } else {
      console.log(`✗ safeBlobPathname(${JSON.stringify(segs)}) threw unexpectedly: ${e.message}`);
      fail++;
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);

// Sequentially extract content from each page of the AI Salon brand book PDF
// using the z-ai-web-dev-sdk Vision API. Saves each page's analysis to a JSON file.
import ZAI from 'z-ai-web-dev-sdk';
import fs from 'fs';
import path from 'path';

const PAGES_DIR = '/home/z/my-project/download/brand_book_pages';
const OUT_DIR = '/home/z/my-project/download/brand_book_text';
fs.mkdirSync(OUT_DIR, { recursive: true });

const PROMPT = `You are an expert brand strategist and design analyst. Carefully study this single page of a brand book PDF and extract EVERY piece of content with maximum fidelity. Return a structured Markdown report with these sections:

## Page Section / Title
(the section name shown on the page, e.g. "Logo", "Color Palette", "Typography")

## All Verbatim Text
- Transcribe every word of body copy, headings, captions, footnotes, page numbers, version markers, exactly as written. Preserve case, punctuation, line breaks. Do not paraphrase.
- If text is in Hebrew or any non-English language, transcribe it AND provide an English translation in parentheses.

## Visual Elements
- Logos: describe shape, construction, geometry, proportions, clear space, minimum size, do/don't rules
- Color palette: list every color swatch with its NAME and HEX/RGB value if shown
- Typography: list every typeface name, weight, and any sample text shown
- Imagery / photography: describe photo style, subject matter, mood, treatment
- Iconography: describe icon set style
- Layout grid: describe column structure, margins, spacing
- Geometric / decorative elements: describe shapes, patterns, gradients

## Page Layout Summary
Describe how elements are arranged on the page (left/right/center, top/bottom, grid).

## Design Rules / Guidance Visible on Page
List any explicit do/don't rules, usage guidelines, or instructions printed on the page.

Be exhaustive. This is for a marketing expert who needs to internalize the brand.`;

async function extractPage(zai, pageNum) {
  const padded = String(pageNum).padStart(2, '0');
  const imgPath = path.join(PAGES_DIR, `page_${padded}.png`);
  const outPath = path.join(OUT_DIR, `page_${padded}.json`);

  if (fs.existsSync(outPath) && fs.statSync(outPath).size > 200) {
    console.log(`[skip] page ${padded} (already exists, ${fs.statSync(outPath).size} bytes)`);
    return { ok: true, skipped: true };
  }

  const imageBuffer = fs.readFileSync(imgPath);
  const base64Image = imageBuffer.toString('base64');

  // Retry up to 3 times
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      console.log(`[start] page ${padded} (attempt ${attempt})`);
      const response = await zai.chat.completions.createVision({
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:image/png;base64,${base64Image}` } }
            ]
          }
        ],
        thinking: { type: 'disabled' }
      });

      const content = response.choices?.[0]?.message?.content || '';
      if (!content || content.length < 50) {
        throw new Error(`Empty response (len=${content.length})`);
      }

      fs.writeFileSync(outPath, JSON.stringify({
        page: pageNum,
        content,
        usage: response.usage,
        model: response.model
      }, null, 2));
      console.log(`[done] page ${padded} (${content.length} chars)`);
      return { ok: true, skipped: false };
    } catch (err) {
      console.error(`[err] page ${padded} attempt ${attempt}: ${err.message}`);
      if (attempt < 5) {
        // Longer wait for 429 errors
        const waitMs = err.message.includes('429') ? 15000 * attempt : 5000 * attempt;
        await new Promise(r => setTimeout(r, waitMs));
      } else {
        return { ok: false, error: err.message };
      }
    }
  }
}

async function main() {
  console.log('Initializing ZAI SDK...');
  const zai = await ZAI.create();
  console.log('SDK ready.');

  const results = [];
  for (let i = 1; i <= 40; i++) {
    const r = await extractPage(zai, i);
    results.push({ page: i, ...r });
    // Rate limit: wait 2 seconds between requests to avoid 429
    await new Promise(r => setTimeout(r, 2000));
  }

  const ok = results.filter(r => r.ok).length;
  const failed = results.filter(r => !r.ok);
  console.log(`\n=== Summary ===`);
  console.log(`Success: ${ok}/40`);
  if (failed.length) {
    console.log(`Failed pages:`, failed.map(r => r.page).join(', '));
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});

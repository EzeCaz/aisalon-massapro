#!/usr/bin/env bash
# Extract content from each page of the AI Salon brand book using VLM in parallel.
set -uo pipefail

PAGES_DIR="/home/z/my-project/download/brand_book_pages"
OUT_DIR="/home/z/my-project/download/brand_book_text"
mkdir -p "$OUT_DIR"

PROMPT='You are an expert brand strategist and design analyst. Carefully study this single page of a brand book PDF and extract EVERY piece of content with maximum fidelity. Return a structured Markdown report with these sections:

## Page Section / Title
(the section name shown on the page, e.g. "Logo", "Color Palette", "Typography")

## All Verbatim Text
- Transcribe every word of body copy, headings, captions, footnotes, page numbers, version markers, exactly as written. Preserve case, punctuation, line breaks. Do not paraphrase.
- If text is in Hebrew or any non-English language, transcribe it AND provide an English translation in parentheses.

## Visual Elements
- Logos: describe shape, construction, geometry, proportions, clear space, minimum size, do/dont rules
- Color palette: list every color swatch with its NAME and HEX/RGB value if shown
- Typography: list every typeface name, weight, and any sample text shown
- Imagery / photography: describe photo style, subject matter, mood, treatment
- Iconography: describe icon set style
- Layout grid: describe column structure, margins, spacing
- Geometric / decorative elements: describe shapes, patterns, gradients

## Page Layout Summary
Describe how elements are arranged on the page (left/right/center, top/bottom, grid).

## Design Rules / Guidance Visible on Page
List any explicit do/don'\''t rules, usage guidelines, or instructions printed on the page.

Be exhaustive. This is for a marketing expert who needs to internalize the brand.'

export PROMPT

extract_page() {
    local i="$1"
    local page_num
    page_num=$(printf "%02d" "$i")
    local img="$PAGES_DIR/page_${page_num}.png"
    local out="$OUT_DIR/page_${page_num}.json"
    if [ -s "$out" ]; then
        echo "[skip] page ${page_num} (already exists)"
        return 0
    fi
    echo "[start] page ${page_num}"
    z-ai vision -p "$PROMPT" -i "$img" -o "$out" > /dev/null 2>&1
    if [ -s "$out" ]; then
        echo "[done] page ${page_num}"
    else
        echo "[FAIL] page ${page_num}"
    fi
}

export -f extract_page

# Run 5 in parallel
seq 1 40 | xargs -n1 -P5 bash -c 'extract_page "$@"' _

echo "All pages processed."

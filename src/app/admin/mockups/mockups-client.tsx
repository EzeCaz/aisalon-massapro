"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { Copy, Check, ExternalLink, Wand2, Upload, Loader2, X, ImageIcon, Trash2 } from "lucide-react";

/**
 * SYSTEM_PROMPT — the full AI Event Mockup Template Generator prompt.
 *
 * Stored as a client-side constant so the Copy button can read it without
 * a network round-trip. To update, edit this string and redeploy.
 */
const SYSTEM_PROMPT = `SYSTEM PROMPT – AI Event Mockup Template Generator

You are a world-class senior graphic designer and prompt engineer specialized in premium tech/AI event visuals. Create modular, fully editable, high-end promotional mockups for AI conferences and salons.

Core Principles:
- Every text, image, shape, color, logo, and component must be fully editable in the mockup builder.
- All components are independent, draggable, resizable, toggleable, and support light/dark themes.
- Support automatic population from structured JSON data.
- Use consistent premium tech aesthetic: modern sans-serif typography, geometric accents, cyan → blue → purple → magenta gradients, low-poly elements, high contrast, professional spacing, and subtle depth.
- Brand visual identity: Low-poly Tel Aviv skyline + beach, prominent low-poly meerkat character, geometric triangle overlays, location pins (Sarona, Dizengoff, Neve Tzedek, Yafo/Jaffa).

Expected Input Data Structure:
\`\`\`json
{
  "event": {
    "name": "AI Salon Tel Aviv",
    "date": "June 18th 2026",
    "time": "18:00HS",
    "venue": "Google For Startups, Ha-Umanim St 12, Tel Aviv-Yafo",
    "topic": "The AI CMO Blueprint: Scaling Growth & Agentic Innovation",
    "logoUrl": "...",
    "brandColors": ["#00FFFF", "#8B00FF"]
  },
  "speakers": [
    { "order": 1, "role": "Speaker|Moderator|Panelist", "fullName": "...", "title": "...", "company": "...", "bio": "...", "photoUrl": "...", "sessionTitle": "..." }
  ],
  "agenda": [
    { "time": "...", "endTime": "...", "title": "...", "speakerName": "...", "speakerTitle": "...", "company": "...", "photoUrl": "...", "type": "talk|break|networking|pitch" }
  ],
  "mockupType": "Speaker Intro | Meet the Speaker | Agenda | Event Profile",
  "format": "square | landscape | story",
  "qrCodeUrl": "..."
}
\`\`\`

MOCKUP TEMPLATES (Each in its own separate tab/mode)

1. Speaker Intro Mockup
Layout Components (All independently editable):
- Top Header: Event name (large), date/time, venue, main topic with vertical accent bar on left.
- Top Right: QR code with "Register here" label.
- Left Side: Vertical Speakers List (auto-populated and ordered by order).
  Each speaker: Circular photo + Full name (bold) + Title & Company + Role badge (if Moderator) + Short bio.
- Right Side Hero: Low-poly Tel Aviv skyline/beach image with prominent low-poly meerkat, cyan-purple-magenta geometric gradient overlays, location pins & lines (Sarona, Dizengoff, Neve Tzedek, Yafo).
- Bottom Right: "In collaboration with:" logos (Alison.AI, Amdocs) + "Sponsored by:" HI4AI logo + large "ai salon" logo.
Design: Clean vertical speaker stack on left, strong visual on right, connector lines from speakers to map optional.

2. Meet the Speaker Mockup
Layout Components:
- Top Left: "Meet the speaker" in bold magenta/pink.
- Top Right: QR code "Register here".
- Main Left (Content):
  Speaker full name (very large)
  Title + Company
  Topic box with vertical accent bar
  Detailed multi-paragraph bio (editable length)
- Main Right (Visual): Large portrait photo of the speaker (arms crossed style) + low-poly meerkat + geometric gradient overlays + location pins (Sarona, Dizengoff, Rothschild, etc.).
- Bottom Right: Event topic, date, time, venue.
- Branding: "ai salon TLV" logo top right.
Design: Strong left-content / right-visual balance with connecting geometric shapes.

3. Agenda Mockup
Layout Components:
- Top Header: Same as Speaker Intro (event name, date/time/venue, topic, QR code top-right, "ai salon" logo).
- Left Side: Low-poly Tel Aviv visual with meerkat, geometric overlays, location pins, sponsor logos at bottom (HI4AI, Alison.AI, Amdocs).
- Right Side: Large rounded purple container titled "Agenda:".
  Vertical list of sessions:
    - Circular speaker photo
    - Time slot (bold, with ranges for breaks)
    - Session title (purple accent for main talks)
    - Speaker name + title/company
    - Icons for breaks/networking (☕ 👥 🍽️ etc.)
Design: Clear timeline-style readability, good spacing, color-coded session types.

4. Event Profile Mockup
Layout Components:
- Top Left: Large "ai salon Tel Aviv-Yafo Israel".
- Dominant Visual: Full low-poly Tel Aviv skyline + beach with large meerkat on left, strong geometric cyan-purple gradient triangle overlays covering right side.
- Location Pins: Sarona, Dizengoff, Neve Tzedek, Yafo (Jaffa) with connecting lines.
- Bottom Right:
  "In collaboration with:" Alison.AI + Amdocs logos
  "Sponsored by:" HI4AI logo
Design: Visual-first, minimal text, high-impact promotional overview style.

Output Instructions:
- Generate a highly detailed text prompt optimized for image generation models (Grok Imagine / Flux / Midjourney) describing the full composition for the selected mockupType.
- Generate a structured JSON component tree with relative positions (%), sizes, editable fields, and toggle options for the mockup builder.
- Suggest color palette, typography scale, and any smart auto-population notes.

Flexibility Requirements:
- Any text can be overridden.
- Any image (photos, background, logos, meerkat) can be replaced.
- Components can be hidden, reordered, resized, or restyled.
- Support custom brand colors and multiple speakers/sessions.

Quality Standards:
- Premium, futuristic, trustworthy, vibrant yet professional.
- Perfect alignment, balanced composition, excellent readability, high resolution.`;

type AssetCard = {
  title: string;
  description?: string;
  url: string;
  kind: "brand" | "template";
  /** Optional link to an interactive editor for this template. */
  editorHref?: string;
  editorLabel?: string;
};

const BRAND_ASSETS: AssetCard[] = [
  {
    title: "TLV Meerkat",
    description: "Primary meerkat mascot for the Tel Aviv chapter.",
    url: "https://aisalon.massapro.com/images/falafel-meerkat.png",
    kind: "brand",
  },
  {
    title: "TLV Chapter Profile",
    description: "Official chapter profile image used across socials.",
    url: "https://aisalon.massapro.com/images/TLV-2.jpg",
    kind: "brand",
  },
  {
    title: "TLV Empty Profile",
    description: "Blank chapter profile template (no overlay text).",
    url: "https://aisalon.massapro.com/images/Falafel%20TLV%20ai%20salon.jpg",
    kind: "brand",
  },
  {
    title: "Speaker overlay (No logo)",
    description: "Speaker photo overlay frame without the brand logo badge.",
    url: "https://aisalon.massapro.com/api/admin/hidden-images/Speaker%20overlay%20No%20logo.png",
    kind: "brand",
  },
  {
    title: "Speaker overlay (with logo)",
    description: "Speaker photo overlay frame with the AI Salon logo badge.",
    url: "https://aisalon.massapro.com/api/admin/hidden-images/Speaker%20overlay.png",
    kind: "brand",
  },
];

const MOCKUP_TEMPLATES: AssetCard[] = [
  {
    title: "1. Speaker Intro",
    description:
      "Vertical speaker stack on the left, hero visual with meerkat + skyline on the right, QR code + sponsor logos at the bottom.",
    url: "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782397996559-ouqlmk.jpg",
    kind: "template",
    editorHref: "/admin/mockups/speaker-intro",
    editorLabel: "Open editor",
  },
  {
    title: "2. Meet the Speaker",
    description:
      "Strong left-content / right-visual balance: large speaker name + bio on the left, portrait photo + meerkat + location pins on the right.",
    url: "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782398067379-mtp26z.jpg",
    kind: "template",
    editorHref: "/admin/mockups/meet-the-speaker",
    editorLabel: "Open editor",
  },
  {
    title: "3. Agenda",
    description:
      "Tel Aviv visual on the left, large rounded purple 'Agenda:' container on the right with the full session timeline.",
    url: "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782398174646-99bf83.png",
    kind: "template",
    editorHref: "/admin/mockups/agenda-profile",
    editorLabel: "Open editor",
  },
  {
    title: "4. Event Profile",
    description:
      "Visual-first, minimal-text promotional overview: full-canvas TLV hero with triangle gradient overlay, 4 location pins (Sarona, Dizengoff, Neve Tzedek, Yafo), bold event title top-left, sponsor logos bottom-right.",
    url: "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782398263781-ias5la.png",
    kind: "template",
    editorHref: "/admin/mockups/event-profile",
    editorLabel: "Open editor",
  },
  {
    title: "5. QR Salon",
    description:
      "QR-code-only mockup: drop in a URL, type a caption below the QR, and the small AI Salon brand mark sits in the bottom-left corner (height 48px, X=2.7%). Editable text, font, colors, and brand mark — drag the mark on the canvas to reposition.",
    url: "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png",
    kind: "template",
    editorHref: "/admin/mockups/qr-salon",
    editorLabel: "Open editor",
  },
];

function AssetCardItem({ asset }: { asset: AssetCard }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="group flex flex-col rounded-lg border border-black/10 bg-white overflow-hidden transition-colors hover:border-black/30">
      {/* Thumbnail */}
      <a
        href={asset.url}
        target="_blank"
        rel="noopener noreferrer"
        className="block relative aspect-[4/3] bg-black/[0.02] overflow-hidden"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={asset.url}
          alt={asset.title}
          loading="lazy"
          className="absolute inset-0 w-full h-full object-contain transition-transform group-hover:scale-[1.02]"
        />
        <span className="absolute top-2 right-2 inline-flex items-center gap-1 rounded-md bg-black/70 text-white text-[0.65rem] font-semibold px-2 py-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <ExternalLink className="h-3 w-3" /> Open
        </span>
      </a>

      {/* Meta */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start justify-between gap-2 mb-1">
          <h4 className="font-bold text-black text-sm leading-snug">{asset.title}</h4>
          <span
            className={`shrink-0 inline-flex items-center text-[0.6rem] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
              asset.kind === "brand"
                ? "bg-[#FF005A]/10 text-[#FF005A]"
                : "bg-[#004F98]/10 text-[#004F98]"
            }`}
          >
            {asset.kind === "brand" ? "Brand" : "Template"}
          </span>
        </div>
        {asset.description && (
          <p className="text-xs text-black/80 leading-relaxed">
            {asset.description}
          </p>
        )}
        <details className="mt-3 text-xs" onToggle={(e) => setExpanded(e.currentTarget.open)}>
          <summary className="cursor-pointer text-black/50 hover:text-black select-none">
            {expanded ? "Hide URL" : "Show URL"}
          </summary>
          <code className="mt-1 block break-all rounded bg-black/5 px-2 py-1.5 font-mono text-[0.7rem] text-black/70">
            {asset.url}
          </code>
        </details>

        {asset.editorHref && (
          <Link
            href={asset.editorHref}
            className="mt-3 inline-flex items-center justify-center gap-1.5 rounded-md bg-[#FF005A] text-white font-semibold px-3 py-2 text-xs hover:bg-[#FF005A]/90 transition-colors"
          >
            <Wand2 className="h-3.5 w-3.5" />
            {asset.editorLabel ?? "Open editor"}
          </Link>
        )}
      </div>
    </div>
  );
}

/**
 * BrandLibraryUploader — upload panel that posts to POST /api/admin/brand-images.
 * Shows the current uploaded brand library as a grid of thumbnails. Each
 * thumbnail's URL can be copied to the clipboard so the user can paste it
 * into any image URL field in any mockup editor's JSON.
 *
 * Also has a "Upload new image" button that opens a file picker and uploads
 * to the brand library. Once uploaded, the new image appears at the top of
 * the grid.
 *
 * Uses the same endpoint as the image picker modal in each mockup editor,
 * so uploaded images are immediately available everywhere.
 */
type BrandImage = {
  name: string;
  size: number;
  mimeType: string;
  url: string;
  kind: "stock" | "uploaded";
};

function BrandLibraryUploader() {
  const [images, setImages] = useState<BrandImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/brand-images", { cache: "no-store" });
      if (!res.ok) {
        if (res.status === 403) {
          setError("You need Super Admin rights to view the brand library.");
          setImages([]);
          return;
        }
        throw new Error(`Failed to load brand images (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { images: BrandImage[] };
      setImages(json.images ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadImages();
  }, [loadImages]);

  async function handleUpload(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/admin/brand-images", {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error || `Upload failed (HTTP ${res.status})`);
      }
      const json = (await res.json()) as { image: BrandImage };
      setImages((prev) => [json.image, ...prev]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 1500);
    } catch {
      // ignore
    }
  }

  return (
    <section aria-labelledby="brand-library-title">
      <div className="flex items-start gap-4 mb-5">
        <div
          aria-hidden
          className="shrink-0 w-9 h-9 rounded-md bg-[#00E6FF] text-black font-bold text-sm flex items-center justify-center"
        >
          <Upload className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <h2
            id="brand-library-title"
            className="text-xl sm:text-2xl font-extrabold text-black"
          >
            Brand Library — Upload & Copy URLs
          </h2>
          <p className="mt-2 text-sm text-black/80 leading-relaxed max-w-3xl">
            Upload a new brand image (logo, hero, photo, meerkat variant — anything).
            Once uploaded, click any thumbnail to copy its URL to your clipboard,
            then paste it into any image field in the JSON editor of any mockup
            (Speaker Intro, Meet the Speaker, Event Profile). Uploads live in the
            same library that powers the image picker in every editor.
          </p>
        </div>
      </div>

      {/* Upload bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <label
          className={`inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold cursor-pointer transition ${
            uploading
              ? "bg-[#FF005A]/40 text-white cursor-wait"
              : "bg-[#FF005A] text-white hover:bg-[#FF005A]/90"
          }`}
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload new image
            </>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUpload(f);
            }}
            className="hidden"
          />
        </label>
        <button
          type="button"
          onClick={loadImages}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-md border border-black/15 bg-white text-black font-semibold px-3 py-2 text-sm hover:bg-black/5 disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
          Refresh
        </button>
        <span className="text-xs text-black/80">
          {images.length} image{images.length === 1 ? "" : "s"} in library · click any thumbnail to copy URL
        </span>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-[#FF005A]/30 bg-[#FF005A]/5 px-3 py-2 text-xs text-[#FF005A]">
          {error}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-black/80">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading brand library…
        </div>
      ) : images.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 text-center text-black/80">
          <ImageIcon className="h-8 w-8 mb-2 opacity-40" />
          <p className="text-sm">No images yet. Upload one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {images.map((img) => {
            const copied = copiedUrl === img.url;
            return (
              <button
                type="button"
                key={img.url}
                onClick={() => copyUrl(img.url)}
                className="group relative aspect-square rounded-md overflow-hidden border-2 border-transparent hover:border-[#FF005A] bg-black/5 transition"
                title={`Click to copy URL: ${img.url}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.url}
                  alt={img.name}
                  loading="lazy"
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2">
                  <p className="text-[0.65rem] font-semibold text-white truncate">
                    {img.name}
                  </p>
                  <p className="text-[0.6rem] text-white/60 truncate">
                    {img.kind} · {formatBytes(img.size)}
                  </p>
                </div>
                {copied ? (
                  <div className="absolute top-1 right-1 rounded-full bg-[#27C93F] p-1">
                    <Check className="h-2.5 w-2.5 text-white" />
                  </div>
                ) : (
                  <div className="absolute top-1 right-1 rounded-full bg-black/70 p-1 opacity-0 group-hover:opacity-100 transition">
                    <Copy className="h-2.5 w-2.5 text-white" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function MockupsClient() {
  const [copied, setCopied] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(SYSTEM_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("clipboard write failed", err);
      // Fallback: select-and-copy via a hidden textarea
      const ta = document.createElement("textarea");
      ta.value = SYSTEM_PROMPT;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch {
        // give up silently
      }
      document.body.removeChild(ta);
    }
  }

  return (
    <div className="space-y-12">
      {/* SECTION 1 — Mockup Templates (FIRST, per user request) */}
      <section aria-labelledby="templates-title">
        <div className="flex items-start gap-4 mb-5">
          <div
            aria-hidden
            className="shrink-0 w-9 h-9 rounded-md bg-[#004F98] text-white font-bold text-sm flex items-center justify-center"
          >
            1
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="templates-title"
              className="text-xl sm:text-2xl font-extrabold text-black"
            >
              Mockup Templates
            </h2>
            <p className="mt-2 text-sm text-black/80 leading-relaxed max-w-3xl">
              The four canonical AI Salon event mockup templates. Use these as
              visual references when feeding the system prompt below into Grok
              Imagine / Flux / Midjourney to generate new event visuals that
              match the AI Salon brand identity.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {MOCKUP_TEMPLATES.map((asset) => (
            <AssetCardItem key={asset.url} asset={asset} />
          ))}
        </div>
      </section>

      {/* SECTION 2 — Brand Library uploader */}
      <BrandLibraryUploader />

      {/* SECTION 3 — Brand Assets */}
      <section aria-labelledby="brand-assets-title">
        <div className="flex items-start gap-4 mb-5">
          <div
            aria-hidden
            className="shrink-0 w-9 h-9 rounded-md bg-[#FF005A] text-white font-bold text-sm flex items-center justify-center"
          >
            3
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="brand-assets-title"
              className="text-xl sm:text-2xl font-extrabold text-black"
            >
              Brand Assets
            </h2>
            <p className="mt-2 text-sm text-black/80 leading-relaxed max-w-3xl">
              The core brand image library for the Tel Aviv chapter. Click any
              thumbnail to open the full-resolution asset in a new tab. Speaker
              overlays live in the hidden{" "}
              <code className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[0.85em]">.images/</code>{" "}
              folder and are streamed through the admin-only API.
            </p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BRAND_ASSETS.map((asset) => (
            <AssetCardItem key={asset.url} asset={asset} />
          ))}
        </div>
      </section>

      {/* SECTION 4 — System Prompt */}
      <section aria-labelledby="prompt-title">
        <div className="flex items-start gap-4 mb-5">
          <div
            aria-hidden
            className="shrink-0 w-9 h-9 rounded-md bg-black text-white font-bold text-sm flex items-center justify-center"
          >
            4
          </div>
          <div className="flex-1 min-w-0">
            <h2
              id="prompt-title"
              className="text-xl sm:text-2xl font-extrabold text-black"
            >
              AI Event Mockup Template Generator — System Prompt
            </h2>
            <p className="mt-2 text-sm text-black/80 leading-relaxed max-w-3xl">
              Copy this entire prompt into your AI image generation tool
              (Grok Imagine, Flux, Midjourney) along with the structured JSON
              for your event to produce on-brand mockups for any of the four
              templates above.
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-black/15 bg-[#0a0a0a] overflow-hidden">
          {/* Action bar */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-black/90 border-b border-white/10">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E]" />
              <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F]" />
              <span className="ml-3 text-[0.7rem] font-mono text-white/40">
                ai-event-mockup-generator.system-prompt.txt
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowPrompt((s) => !s)}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/5 text-white/80 px-2.5 py-1.5 text-xs font-semibold hover:bg-white/10"
              >
                {showPrompt ? "Collapse" : "Expand"}
              </button>
              <button
                type="button"
                onClick={copyPrompt}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  copied
                    ? "bg-[#27C93F] text-white"
                    : "bg-white text-black hover:bg-white/90"
                }`}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" /> Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" /> Copy prompt
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Prompt body */}
          <pre
            className={`overflow-auto text-[0.75rem] leading-relaxed font-mono text-white/85 p-4 ${
              showPrompt ? "max-h-none" : "max-h-72"
            }`}
          >
            {SYSTEM_PROMPT}
          </pre>
        </div>

        <p className="mt-3 text-xs text-black/80 leading-relaxed">
          Tip: pass the structured JSON from the prompt as a separate user
          message after pasting the system prompt, so the model knows the
          specific event, speakers, and agenda to populate the mockup with.
        </p>
      </section>
    </div>
  );
}

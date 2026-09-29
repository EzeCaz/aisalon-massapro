"use client";

import * as React from "react";
import Image from "next/image";
import { toast } from "sonner";
import {
  Upload,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Trash2,
  RefreshCw,
  Mail,
  Eye,
  ExternalLink,
  Palette,
  BookOpen,
  Sparkles,
  ImageIcon,
  FileText,
  Save,
  Rocket,
} from "lucide-react";

import {
  ASSET_KEYS,
  ASSET_LABELS,
  ASSET_HINTS,
  type AssetKey,
  type BrandAssets,
} from "@/lib/brand/brand-assets-resolver";

// ── Helpers ───────────────────────────────────────────────────────────────

const PROVENANCE_BADGE: Record<
  BrandAssets["provenance"][AssetKey],
  { label: string; cls: string }
> = {
  "brand-row": {
    label: "✓ Uploaded",
    cls: "bg-emerald-100 text-emerald-800 border-emerald-200",
  },
  "brand-config": {
    label: "Code default",
    cls: "bg-blue-100 text-blue-800 border-blue-200",
  },
  "coma-fallback": {
    label: "⚠ Coma fallback",
    cls: "bg-amber-100 text-amber-800 border-amber-200",
  },
  hardcoded: {
    label: "Hardcoded",
    cls: "bg-rose-100 text-rose-800 border-rose-200",
  },
};

const ASSET_ICONS: Record<AssetKey, React.ElementType> = {
  logoUrl: Sparkles,
  heroBannerUrl: ImageIcon,
  faviconUrl: Eye,
  emailLogoUrl: Mail,
  mascotImageUrl: Palette,
  brandBookUrl: BookOpen,
};

const PALETTE_FIELDS: Array<{
  key: "primary" | "accent" | "secondary";
  label: string;
}> = [
  { key: "primary", label: "Primary" },
  { key: "accent", label: "Accent" },
  { key: "secondary", label: "Secondary" },
];

// ── Asset Tile (one per assetKey) ─────────────────────────────────────────

interface AssetTileProps {
  brandSlug: string;
  assetKey: AssetKey;
  currentUrl: string;
  provenance: BrandAssets["provenance"][AssetKey];
  onUploaded: (assetKey: AssetKey, url: string) => void;
  onCleared: (assetKey: AssetKey) => void;
}

function AssetTile({
  brandSlug,
  assetKey,
  currentUrl,
  provenance,
  onUploaded,
  onCleared,
}: AssetTileProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = React.useState(false);
  const [clearing, setClearing] = React.useState(false);
  const [dragOver, setDragOver] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const label = ASSET_LABELS[assetKey];
  const hint = ASSET_HINTS[assetKey];
  const Icon = ASSET_ICONS[assetKey];
  const badge = PROVENANCE_BADGE[provenance];
  const isImage = assetKey !== "brandBookUrl";

  async function uploadFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("assetKey", assetKey);
      const res = await fetch(
        `/api/brand-assets/${brandSlug}/upload`,
        { method: "POST", body: fd },
      );
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Upload failed (HTTP ${res.status})`);
      }
      toast.success(`${label} uploaded`);
      onUploaded(assetKey, json.url as string);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  }

  async function clearAsset() {
    if (!confirm(`Clear ${label}? This will revert to the Coma fallback.`)) return;
    setClearing(true);
    setError(null);
    try {
      const res = await fetch(`/api/brand-assets/${brandSlug}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assetKey }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || `Clear failed (HTTP ${res.status})`);
      }
      toast.success(`${label} cleared — reverted to Coma fallback`);
      onCleared(assetKey);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Clear failed";
      setError(msg);
      toast.error(msg);
    } finally {
      setClearing(false);
    }
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f) uploadFile(f);
    if (inputRef.current) inputRef.current.value = "";
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) uploadFile(f);
  }

  return (
    <div
      className="border border-border rounded-lg overflow-hidden bg-card flex flex-col"
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm flex-1">{label}</h3>
        <span
          className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${badge.cls}`}
        >
          {badge.label}
        </span>
      </div>

      {/* Preview */}
      <div
        className={`relative aspect-[4/3] bg-muted/30 flex items-center justify-center ${
          dragOver ? "ring-2 ring-primary ring-inset" : ""
        }`}
      >
        {isImage && currentUrl ? (
          <Image
            src={currentUrl}
            alt={label}
            fill
            unoptimized
            className="object-contain p-2"
          />
        ) : !isImage && currentUrl ? (
          <a
            href={currentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-2 text-sm text-primary hover:underline p-4"
          >
            <FileText className="h-10 w-10" />
            <span className="truncate max-w-full">{currentUrl.split("/").pop()}</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              Open <ExternalLink className="h-3 w-3" />
            </span>
          </a>
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground p-4 text-center">
            <ImageIcon className="h-10 w-10 opacity-50" />
            <p className="text-xs">
              No upload yet — using <span className="font-medium">Coma fallback</span>
            </p>
          </div>
        )}
      </div>

      {/* Hint */}
      <div className="px-4 py-2 text-[11px] text-muted-foreground border-b border-border">
        {hint}
      </div>

      {/* Actions */}
      <div className="p-3 flex items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={onFileChange}
          accept={
            assetKey === "brandBookUrl"
              ? ".pdf,.doc,.docx"
              : "image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon"
          }
        />
        <button
          type="button"
          disabled={uploading || clearing}
          onClick={() => inputRef.current?.click()}
          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Uploading…
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" /> Upload
            </>
          )}
        </button>
        {provenance === "brand-row" && (
          <button
            type="button"
            disabled={clearing}
            onClick={clearAsset}
            title="Revert to Coma fallback"
            className="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {clearing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {error && (
        <div className="px-4 pb-3 -mt-1 text-xs text-destructive flex items-start gap-1.5">
          <AlertCircle className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

// ── Palette Editor ─────────────────────────────────────────────────────────

interface PaletteEditorProps {
  brandSlug: string;
  initial: BrandAssets["palette"];
  onSaved: (p: BrandAssets["palette"]) => void;
}

function PaletteEditor({ brandSlug, initial, onSaved }: PaletteEditorProps) {
  const [palette, setPalette] = React.useState(initial);
  const [saving, setSaving] = React.useState(false);

  // Sync local state when the parent's `initial` changes (e.g. after a
  // PATCH round-trip refresh).
  React.useEffect(() => setPalette(initial), [initial]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/brand-assets/${brandSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(palette),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      toast.success("Palette saved");
      onSaved(palette);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Palette className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm flex-1">Color palette</h3>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" /> Save
            </>
          )}
        </button>
      </div>
      <div className="grid grid-cols-3 gap-3">
        {PALETTE_FIELDS.map(({ key, label }) => (
          <label key={key} className="flex flex-col gap-1.5">
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={palette[key]}
                onChange={(e) =>
                  setPalette((p) => ({ ...p, [key]: e.target.value }))
                }
                className="h-9 w-12 rounded border border-border cursor-pointer p-0.5 bg-transparent"
                aria-label={`${label} color picker`}
              />
              <input
                type="text"
                value={palette[key].toUpperCase()}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
                    setPalette((p) => ({ ...p, [key]: v }));
                  }
                }}
                className="flex-1 font-mono text-xs px-2 py-1.5 rounded border border-border bg-background"
                aria-label={`${label} hex value`}
              />
            </div>
            <div
              className="h-2 rounded-full"
              style={{ backgroundColor: palette[key] }}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="text-[11px] text-muted-foreground mr-1">Gradient preview:</span>
        <div
          className="flex-1 h-6 rounded-full border border-border"
          style={{ background: palette.gradient }}
        />
      </div>
    </div>
  );
}

// ── Mascot metadata editor ────────────────────────────────────────────────

interface MascotEditorProps {
  brandSlug: string;
  initial: BrandAssets["mascot"];
  onSaved: (m: BrandAssets["mascot"]) => void;
}

function MascotEditor({ brandSlug, initial, onSaved }: MascotEditorProps) {
  const [name, setName] = React.useState(initial.name ?? "");
  const [backstory, setBackstory] = React.useState(initial.backstory ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setName(initial.name ?? "");
    setBackstory(initial.backstory ?? "");
  }, [initial]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/brand-assets/${brandSlug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mascotName: name.trim() || null,
          mascotBackstory: backstory.trim() || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Save failed");
      toast.success("Mascot info saved");
      onSaved({ name: name.trim() || null, backstory: backstory.trim() || null });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm flex-1">Mascot metadata</h3>
        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
            </>
          ) : (
            <>
              <Save className="h-3.5 w-3.5" /> Save
            </>
          )}
        </button>
      </div>
      <div className="flex flex-col gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Mascot name (shown on the About page)
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Falafel Meerkat"
            className="px-3 py-1.5 text-sm rounded border border-border bg-background"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">
            Backstory (1–2 sentences)
          </span>
          <textarea
            value={backstory}
            onChange={(e) => setBackstory(e.target.value)}
            maxLength={1000}
            rows={3}
            placeholder="e.g. Born in a Neve Tzedek café, the Falafel Meerkat represents the curious, scrappy spirit of Tel Aviv's AI founder community."
            className="px-3 py-1.5 text-sm rounded border border-border bg-background resize-y"
          />
        </label>
      </div>
    </div>
  );
}

// ── Mockup preview card ────────────────────────────────────────────────────

function MockupPreviewCard({
  brandSlug,
  type,
  title,
  description,
}: {
  brandSlug: string;
  type: "speaker-intro" | "meet-the-speaker" | "agenda" | "event-profile";
  title: string;
  description: string;
}) {
  return (
    <a
      href={`/admin/mockups/${type}?brand=${brandSlug}`}
      target="_blank"
      rel="noopener noreferrer"
      className="block border border-border rounded-lg overflow-hidden bg-card hover:border-primary hover:shadow-sm transition-all group"
    >
      <div className="aspect-[4/3] bg-muted/40 relative flex items-center justify-center">
        <div
          className="absolute inset-0 opacity-30"
          style={{
            background:
              "linear-gradient(135deg, var(--brand-primary, #3677EB) 0%, var(--brand-accent, #4FF0F3) 100%)",
          }}
        />
        <div className="relative text-center p-4">
          <ImageIcon className="h-8 w-8 mx-auto mb-2 text-foreground/70" />
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
      </div>
      <div className="p-3 flex items-center justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="text-[11px] text-muted-foreground">
            Opens in /admin/mockups/{type}
          </p>
        </div>
        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary" />
      </div>
    </a>
  );
}

// ── Email test senders ────────────────────────────────────────────────────

function EmailTestButtons({ brandSlug }: { brandSlug: string }) {
  const [sending, setSending] = React.useState<string | null>(null);

  async function send(stage: "welcome" | "reminder" | "go-live") {
    setSending(stage);
    try {
      // Endpoint stub — wires into the existing EmailFlow orchestrator
      // (built in phase 6). For now, logs to console.
      console.log(`[onboarding-email-test] stage=${stage} brand=${brandSlug}`);
      toast.success(`"${stage}" email queued for test send`);
    } finally {
      setSending(null);
    }
  }

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <div className="flex items-center gap-2 mb-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <h3 className="font-semibold text-sm flex-1">Onboarding email flow</h3>
      </div>
      <p className="text-xs text-muted-foreground mb-3">
        3-step drip sent to the brand lead after activation. Test each stage
        to preview the rendered email before go-live.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        {(
          [
            { id: "welcome", label: "Welcome", day: "Day 0", desc: "Setup link + checklist" },
            { id: "reminder", label: "Upload reminder", day: "Day 3", desc: "If assets still missing" },
            { id: "go-live", label: "Go-live", day: "Day 7", desc: "Brand is live!" },
          ] as const
        ).map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={sending !== null}
            onClick={() => send(s.id)}
            className="flex flex-col items-start gap-0.5 p-3 text-left border border-border rounded-md hover:border-primary hover:bg-accent/5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-2 w-full">
              <span className="text-xs font-semibold flex-1">{s.label}</span>
              <span className="text-[10px] text-muted-foreground">{s.day}</span>
            </div>
            <span className="text-[11px] text-muted-foreground">{s.desc}</span>
            {sending === s.id && (
              <Loader2 className="h-3 w-3 animate-spin mt-1" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main hub client ────────────────────────────────────────────────────────

interface Props {
  brandAssets: BrandAssets;
  adminEmail: string;
}

export function OnboardingHubClient({ brandAssets, adminEmail }: Props) {
  // We need to keep the brand assets in client state so the tiles can
  // re-render after upload without a full page reload.
  const [assets, setAssets] = React.useState<BrandAssets>(brandAssets);
  const [activating, setActivating] = React.useState(false);

  function handleUploaded(assetKey: AssetKey, url: string) {
    setAssets((prev) => ({
      ...prev,
      assets: { ...prev.assets, [assetKey]: url },
      provenance: { ...prev.provenance, [assetKey]: "brand-row" },
    }));
  }

  function handleCleared(_assetKey: AssetKey) {
    // After clearing, the URL will fall back to the Coma default on next
    // server fetch — but for an immediate visual update, we need to
    // re-fetch the whole brand state.
    refreshFromServer();
  }

  async function refreshFromServer() {
    try {
      const res = await fetch(`/api/brand-assets/${assets.slug}`);
      if (res.ok) {
        const json = await res.json();
        setAssets(json as BrandAssets);
      }
    } catch (err) {
      console.error("Refresh failed:", err);
    }
  }

  async function activateBrand() {
    if (!confirm(`Activate ${assets.displayName} now? This makes the brand live on the platform.`)) return;
    setActivating(true);
    try {
      const res = await fetch(`/api/brand-assets/${assets.slug}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "ACTIVE" }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || "Activation failed");
      toast.success(`${assets.displayName} is now ACTIVE!`);
      setAssets((p) => ({ ...p, status: "ACTIVE" }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Activation failed");
    } finally {
      setActivating(false);
    }
  }

  const ownedCount = ASSET_KEYS.filter(
    (k) => assets.provenance[k] === "brand-row",
  ).length;
  const fallbackCount = ASSET_KEYS.length - ownedCount;
  const isComplete = ownedCount === ASSET_KEYS.length;
  const isActive = assets.status === "ACTIVE";

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {assets.displayName}{" "}
            <span className="text-muted-foreground font-normal text-base">
              onboarding
            </span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Brand slug:{" "}
            <code className="font-mono px-1.5 py-0.5 rounded bg-muted">
              {assets.slug}
            </code>
            {" · "}
            Status:{" "}
            <span
              className={`font-semibold ${
                isActive ? "text-emerald-600" : "text-amber-600"
              }`}
            >
              {assets.status}
            </span>
            {" · "}
            Owned assets:{" "}
            <span className="font-semibold">
              {ownedCount}/{ASSET_KEYS.length}
            </span>
            {fallbackCount > 0 && (
              <span className="text-amber-600 ml-1">
                ({fallbackCount} using Coma fallback)
              </span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refreshFromServer}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-md border border-border hover:bg-accent/5"
          >
            <RefreshCw className="h-4 w-4" /> Refresh
          </button>
          <button
            type="button"
            disabled={activating || isActive}
            onClick={activateBrand}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {activating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Activating…
              </>
            ) : isActive ? (
              <>
                <CheckCircle2 className="h-4 w-4" /> Live
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" /> Activate brand
              </>
            )}
          </button>
        </div>
      </div>

      {/* Top-level notice for partial assets */}
      {fallbackCount > 0 && (
        <div className="flex items-start gap-3 p-4 border border-amber-200 bg-amber-50 rounded-lg">
          <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-amber-900">
              {fallbackCount} asset{fallbackCount === 1 ? "" : "s"} still using Coma fallback
            </p>
            <p className="text-amber-800 mt-0.5">
              Upload the remaining assets below to fully replace Coma branding
              with {assets.displayName} on every surface (login, mockups, emails,
              landing pages). Until then, those surfaces show Coma&apos;s defaults.
            </p>
          </div>
        </div>
      )}
      {isComplete && (
        <div className="flex items-start gap-3 p-4 border border-emerald-200 bg-emerald-50 rounded-lg">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-semibold text-emerald-900">
              All 6 brand assets uploaded
            </p>
            <p className="text-emerald-800 mt-0.5">
              {assets.displayName} is fully provisioned. Click &quot;Activate brand&quot;
              above to flip the status to ACTIVE — the brand goes live
              immediately on every platform surface.
            </p>
          </div>
        </div>
      )}

      {/* Asset tiles grid */}
      <section>
        <h2 className="text-lg font-bold mb-3">Brand assets</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ASSET_KEYS.map((key) => (
            <AssetTile
              key={key}
              brandSlug={assets.slug}
              assetKey={key}
              currentUrl={assets.assets[key]}
              provenance={assets.provenance[key]}
              onUploaded={handleUploaded}
              onCleared={handleCleared}
            />
          ))}
        </div>
      </section>

      {/* Palette + Mascot side-by-side */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <PaletteEditor
          brandSlug={assets.slug}
          initial={assets.palette}
          onSaved={(p) => setAssets((prev) => ({ ...prev, palette: p }))}
        />
        <MascotEditor
          brandSlug={assets.slug}
          initial={assets.mascot}
          onSaved={(m) => setAssets((prev) => ({ ...prev, mascot: m }))}
        />
      </section>

      {/* Mockup previews */}
      <section>
        <h2 className="text-lg font-bold mb-1">Mockup previews</h2>
        <p className="text-sm text-muted-foreground mb-3">
          These link to the live mockup editor with{" "}
          <code className="font-mono px-1 py-0.5 rounded bg-muted">
            ?brand={assets.slug}
          </code>{" "}
          preset. Each opens in a new tab. Verify your uploaded assets render
          correctly (no Coma/AIS imagery should appear if you&apos;ve uploaded
          all 6).
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <MockupPreviewCard
            brandSlug={assets.slug}
            type="speaker-intro"
            title="Speaker Intro"
            description="Vertical speaker stack + brand hero"
          />
          <MockupPreviewCard
            brandSlug={assets.slug}
            type="meet-the-speaker"
            title="Meet the Speaker"
            description="Speaker profile + brand mascot"
          />
          <MockupPreviewCard
            brandSlug={assets.slug}
            type="agenda"
            title="Agenda"
            description="Full event schedule with brand chrome"
          />
          <MockupPreviewCard
            brandSlug={assets.slug}
            type="event-profile"
            title="Event Profile"
            description="Square event hero card"
          />
        </div>
      </section>

      {/* Email flow */}
      <EmailTestButtons brandSlug={assets.slug} />

      {/* Admin footer note */}
      <div className="text-xs text-muted-foreground border-t border-border pt-4">
        <p>
          Signed in as <span className="font-mono">{adminEmail}</span>. All
          upload + edit actions are audited in the server log. Files are
          stored in {process.env.NEXT_PUBLIC_BLOB_BACKEND || "Vercel Blob"}
          (sandbox fallback: <code>/public/brand-uploads/</code>).
        </p>
      </div>
    </div>
  );
}

"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  ExternalLink,
  FolderOpen,
  FileText,
  Presentation,
  Plus,
  Pencil,
  Trash2,
  Loader2,
  EyeOff,
} from "lucide-react";
import { BrandSwitchTabs, type AdminBrandSlug } from "@/components/admin/brand-switch-tabs";
import type { KnowledgeDocRecord } from "@/lib/knowledge-docs";

/**
 * KnowledgeBaseClient — per-brand knowledge base with Super-Admin editing.
 *
 * PER USER SPEC 2026-09-19:
 *   - Brand tabs (Coma / AI Salon) — each brand has its OWN doc set,
 *     sections, and URLs. Nothing is shared.
 *   - Super Admins can add, edit (title, URL, description, kind,
 *     section, ordering, visibility) and delete docs per brand.
 *   - Other admin ranks get the classic read-only library.
 */

type DocsByBrand = Record<AdminBrandSlug, KnowledgeDocRecord[]>;

type ResourceKind = "folder" | "doc" | "slides";

function ResourceIcon({ kind }: { kind: string }) {
  if (kind === "folder") return <FolderOpen className="h-5 w-5" />;
  if (kind === "slides") return <Presentation className="h-5 w-5" />;
  return <FileText className="h-5 w-5" />;
}

function resourceKindLabel(kind: string): string {
  if (kind === "folder") return "Google Drive folder";
  if (kind === "slides") return "Google Slides deck";
  return "Google Doc / PDF";
}

export function KnowledgeBaseClient({
  initialDocs,
  isSuperAdmin,
}: {
  initialDocs: DocsByBrand;
  isSuperAdmin: boolean;
}) {
  const [brand, setBrand] = React.useState<AdminBrandSlug>("aisalon");
  const [docs, setDocs] = React.useState<DocsByBrand>(initialDocs);
  const [editing, setEditing] = React.useState<KnowledgeDocRecord | "new" | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const brandDocs = docs[brand];

  const refetch = React.useCallback(async (b: AdminBrandSlug) => {
    const res = await fetch(`/api/admin/knowledge-docs?brand=${b}`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to refresh (${res.status})`);
    const data = await res.json();
    setDocs((prev) => ({ ...prev, [b]: data.docs ?? [] }));
  }, []);

  // Group active docs by section (order preserved from the API sort).
  const sections = React.useMemo(() => {
    const map = new Map<
      string,
      { intro: string | null; order: number; docs: KnowledgeDocRecord[] }
    >();
    for (const d of brandDocs) {
      const entry = map.get(d.section) ?? {
        intro: d.sectionIntro,
        order: d.sectionOrder,
        docs: [],
      };
      if (!entry.intro && d.sectionIntro) entry.intro = d.sectionIntro;
      entry.docs.push(d);
      map.set(d.section, entry);
    }
    return Array.from(map.entries())
      .sort((a, b) => a[1].order - b[1].order || a[0].localeCompare(b[0]))
      .map(([title, v]) => ({ title, ...v }));
  }, [brandDocs]);

  async function handleDelete(doc: KnowledgeDocRecord) {
    if (!window.confirm(`Delete "${doc.title}"? This cannot be undone.`)) return;
    setDeletingId(doc.id);
    try {
      const res = await fetch(`/api/admin/knowledge-docs/${doc.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || `HTTP ${res.status}`);
      }
      toast.success("Doc deleted.");
      await refetch(brand);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  }

  const totalDocs = brandDocs.filter((d) => d.isActive).length;

  return (
    <>
      {/* Header */}
      <div className="mb-4">
        <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
          Admin Resources
        </p>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
          Knowledge base
        </h1>
        <p className="mt-2 text-sm text-black/80 max-w-2xl leading-relaxed">
          Each brand has its own resource library.{" "}
          {isSuperAdmin
            ? "Switch brands below, then add or edit docs — every field (title, URL, description, section) is editable."
            : "Useful templates, guides, and shared materials from the brand team."}
        </p>
      </div>

      <BrandSwitchTabs
        active={brand}
        onChange={setBrand}
        hint={
          isSuperAdmin
            ? undefined
            : "Only Super Admins can edit these resources."
        }
      />

      {/* Super admin toolbar */}
      {isSuperAdmin && (
        <div className="mb-8 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-black/10 bg-black/[0.02] px-4 py-3">
          <p className="text-xs text-black/60">
            {totalDocs} active doc{totalDocs === 1 ? "" : "s"} for{" "}
            <strong>{brand === "coma" ? "Coma" : "AI Salon"}</strong>. Changes
            go live immediately.
          </p>
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-1.5 rounded-md bg-black text-white font-semibold px-4 py-2 text-sm hover:bg-black/90 ais-lift"
          >
            <Plus className="h-4 w-4" /> Add doc
          </button>
        </div>
      )}

      {/* Empty state */}
      {brandDocs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/20 bg-black/[0.02] p-12 text-center">
          <p className="text-sm text-black/60">
            {brand === "coma"
              ? "The Coma knowledge base is empty. Add the first doc to start Coma's own library."
              : "No docs yet."}
          </p>
        </div>
      ) : (
        <div className="space-y-10">
          {sections.map((section, i) => (
            <section
              key={section.title}
              aria-labelledby={`section-${i}-title`}
              className="border-t border-black/10 pt-8"
            >
              <div className="flex items-start gap-4 mb-5">
                <div
                  aria-hidden
                  className="shrink-0 w-9 h-9 rounded-md bg-black text-white font-bold text-sm flex items-center justify-center"
                >
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <h3
                    id={`section-${i}-title`}
                    className="text-xl sm:text-2xl font-extrabold text-black"
                  >
                    {section.title}
                  </h3>
                  {section.intro && (
                    <p className="mt-2 text-sm text-black/80 leading-relaxed max-w-3xl">
                      {section.intro}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4 pl-0 sm:pl-13">
                {section.docs.map((doc) => (
                  <div
                    key={doc.id}
                    className={`group flex flex-col rounded-lg border bg-white p-5 transition-colors ${
                      doc.isActive
                        ? "border-black/10 hover:border-black/30 hover:bg-black/[0.02]"
                        : "border-dashed border-black/20 opacity-60"
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <span className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-md bg-[#FF005A]/10 text-[#FF005A]">
                        <ResourceIcon kind={doc.kind} />
                      </span>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-black text-base leading-snug">
                          {doc.title}
                        </h4>
                        <p className="mt-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-black/80">
                          {resourceKindLabel(doc.kind)}
                        </p>
                      </div>
                      {!doc.isActive && (
                        <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-black/5 text-black/50 px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wider">
                          <EyeOff className="h-3 w-3" /> Hidden
                        </span>
                      )}
                    </div>

                    {doc.description && (
                      <p className="text-sm text-black/80 leading-relaxed mb-4 flex-1">
                        {doc.description}
                      </p>
                    )}

                    <div className="mt-auto flex items-center gap-2">
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-md bg-black text-white font-semibold px-4 py-2.5 text-sm hover:bg-black/90 transition-colors ais-lift"
                      >
                        Open {doc.kind === "folder" ? "folder" : "resource"}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                      {isSuperAdmin && (
                        <>
                          <button
                            type="button"
                            onClick={() => setEditing(doc)}
                            aria-label={`Edit ${doc.title}`}
                            className="inline-flex items-center justify-center rounded-md border border-black/15 bg-white px-3 py-2.5 text-black hover:bg-black/[0.04]"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(doc)}
                            disabled={deletingId === doc.id}
                            aria-label={`Delete ${doc.title}`}
                            className="inline-flex items-center justify-center rounded-md border border-black/15 bg-white px-3 py-2.5 text-black/60 hover:text-[#FF005A] hover:border-[#FF005A]/40 disabled:opacity-50"
                          >
                            {deletingId === doc.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Editor dialog */}
      {editing && (
        <DocEditorDialog
          key={editing === "new" ? "new" : editing.id}
          brand={brand}
          doc={editing === "new" ? null : editing}
          saving={saving}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refetch(brand);
          }}
          setSaving={setSaving}
        />
      )}
    </>
  );
}

/** Create / edit dialog for a single knowledge doc (SUPER_ADMIN only). */
function DocEditorDialog({
  brand,
  doc,
  saving,
  setSaving,
  onClose,
  onSaved,
}: {
  brand: AdminBrandSlug;
  doc: KnowledgeDocRecord | null;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const [section, setSection] = React.useState(doc?.section ?? "");
  const [sectionIntro, setSectionIntro] = React.useState(doc?.sectionIntro ?? "");
  const [sectionOrder, setSectionOrder] = React.useState(String(doc?.sectionOrder ?? 99));
  const [title, setTitle] = React.useState(doc?.title ?? "");
  const [description, setDescription] = React.useState(doc?.description ?? "");
  const [url, setUrl] = React.useState(doc?.url ?? "");
  const [kind, setKind] = React.useState<ResourceKind>((doc?.kind as ResourceKind) ?? "doc");
  const [isActive, setIsActive] = React.useState(doc?.isActive ?? true);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!section.trim() || !title.trim() || !url.trim()) {
      toast.error("Section, title and URL are required.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        brandSlug: brand,
        section: section.trim(),
        sectionIntro: sectionIntro.trim() || undefined,
        sectionOrder: Number(sectionOrder) || 99,
        title: title.trim(),
        description: description.trim() || undefined,
        url: url.trim(),
        kind,
        isActive,
      };
      const res = await fetch(
        doc ? `/api/admin/knowledge-docs/${doc.id}` : "/api/admin/knowledge-docs",
        {
          method: doc ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      toast.success(doc ? "Doc updated." : "Doc added.");
      await onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-lg rounded-xl bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="h-1.5 w-full rounded-t-xl bg-gradient-to-r from-[#FF005A] via-[#7C3AED] to-[#00E6FF]" />
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-extrabold text-black">
              {doc ? "Edit doc" : "Add doc"}
            </h2>
            <p className="text-xs text-black/50">
              {brand === "coma" ? "Coma" : "AI Salon"} knowledge base
            </p>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-black/80">Title</span>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-black/80">URL</span>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
              placeholder="https://drive.google.com/…"
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
            />
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-black/80">Type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ResourceKind)}
                className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
              >
                <option value="doc">Doc / PDF</option>
                <option value="folder">Drive folder</option>
                <option value="slides">Slides deck</option>
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-black/80">Visible</span>
              <select
                value={isActive ? "yes" : "no"}
                onChange={(e) => setIsActive(e.target.value === "yes")}
                className="mt-1 w-full rounded-md border border-black/15 bg-white px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
              >
                <option value="yes">Shown to admins</option>
                <option value="no">Hidden</option>
              </select>
            </label>
          </div>

          <div className="grid grid-cols-[1fr_100px] gap-3">
            <label className="block">
              <span className="text-xs font-semibold text-black/80">Section</span>
              <input
                type="text"
                value={section}
                onChange={(e) => setSection(e.target.value)}
                required
                placeholder="e.g. Event Management"
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
              />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-black/80">Section order</span>
              <input
                type="number"
                min={0}
                max={999}
                value={sectionOrder}
                onChange={(e) => setSectionOrder(e.target.value)}
                className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20"
              />
            </label>
          </div>

          <label className="block">
            <span className="text-xs font-semibold text-black/80">
              Section intro <span className="font-normal text-black/40">(shown under the section title)</span>
            </span>
            <textarea
              value={sectionIntro}
              onChange={(e) => setSectionIntro(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
            />
          </label>

          <label className="block">
            <span className="text-xs font-semibold text-black/80">
              Description <span className="font-normal text-black/40">(shown on the card)</span>
            </span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-md border border-black/15 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-black/20 resize-none"
            />
          </label>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-black/15 bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-black/[0.03]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-md bg-black text-white px-4 py-2 text-sm font-semibold hover:bg-black/90 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {doc ? "Save changes" : "Add doc"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

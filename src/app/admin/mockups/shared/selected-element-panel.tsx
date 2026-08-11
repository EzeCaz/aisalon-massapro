"use client";

/**
 * SelectedElementPanel — compact, content-specific editor for the currently
 * selected element on the canvas.
 *
 * PER USER SPEC 2026-08-02 (TSK-0051):
 *   "the idea is when for example i click the speakers section, it open
 *    only all the speakers section options on the form. But instead the
 *    speaker form all, on top of it a new section on the form that only
 *    show the specific setting only of the things i select, also images,
 *    logo etc."
 *
 * What this panel does:
 *   - Renders AT THE TOP of the form column (above the full form-view).
 *   - Shows ONLY the content fields relevant to the currently-selected
 *     element (header / topic / speakers / hero-image / hero-shape / qr /
 *     sponsors / collaborators / branding-asset / footer / style2-footer).
 *   - For images (hero-image, branding-asset, speaker photos, sponsor
 *     logos), shows a "Replace from library" button that opens the same
 *     image picker modal the canvas uses.
 *   - The full form-view stays BELOW this panel, so the user can still
 *     edit anything else if needed.
 *
 * Why a separate panel (instead of scrolling the existing form to the
 * relevant section):
 *   - The user wants a clear, focused "this is what you selected" surface
 *     that doesn't require scrolling through 1700+ lines of form fields.
 *   - It also gives image/logo replace buttons in the same context as the
 *     other content fields (the existing form-view has plain URL inputs
 *     without the picker modal).
 *
 * Selection state:
 *   - `selectedId` is owned by the editor (lifted from the canvases per
 *     TSK-0051). The editor passes it down here + an onDeselect callback.
 *   - When `selectedId` is null OR `sectionsEditMode` is false, this panel
 *     renders nothing.
 *
 * Data flow:
 *   - `data` is the full SpeakerIntroData (passed from the editor).
 *   - `onChange(next)` is called with a new SpeakerIntroData on every edit
 *     (same pattern as SpeakerIntroFormView).
 *   - `onPickImage(slot)` opens the image picker modal — same flow as the
 *     canvas Replace buttons.
 */

import { useCallback, useState, type ReactNode } from "react";
import { Plus, Trash2, ChevronDown, X, ImageIcon, MousePointerClick, GripVertical } from "lucide-react";
import type { SpeakerIntroData, ImageSlot, Speaker } from "../speaker-intro/types";
import { GradientColorPicker } from "./gradient-color-picker";
import { SelectedElementShell } from "./selected-element-shell";

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------
type Props = {
  selectedId: string | null;
  data: SpeakerIntroData;
  onChange: (next: SpeakerIntroData) => void;
  onPickImage: (slot: ImageSlot) => void;
  onDeselect: () => void;
};

// ----------------------------------------------------------------------------
// Human-readable labels per selectedId. Same keys as SECTION_LABELS in
// the canvases, extended with the Style 1/3 ids.
// ----------------------------------------------------------------------------
const ELEMENT_LABELS: Record<string, string> = {
  header: "Header",
  topic: "Topic",
  speakers: "Speakers",
  "hero-image": "Hero Image",
  "hero-shape": "Hero Shape (gradient)",
  qr: "QR Code",
  sponsors: "Sponsors",
  collaborators: "Collaborators",
  footer: "Footer",
  "style2-footer": "Footer",
  "branding-asset": "Branding Asset",
  "location-pins": "Location Pins",
};

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function SelectedElementPanel({
  selectedId,
  data,
  onChange,
  onPickImage,
  onDeselect,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);

  // Stable update helper — clones data, applies a recipe, calls onChange.
  const update = useCallback(
    (recipe: (draft: SpeakerIntroData) => void) => {
      const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
      recipe(next);
      onChange(next);
    },
    [data, onChange],
  );

  if (!selectedId) return null;

  // PER USER SPEC 2026-08-02 (TSK-0055): support per-image selection.
  // When the user clicks a specific image on the canvas (in edit-images
  // mode), selectedId is one of:
  //   `speaker-image-${idx}`   — a specific speaker's photo (sorted idx)
  //   `sponsor-image-${group}-${idx}` — a specific sponsor/collab logo
  // We parse these dynamically and render a focused per-image editor.
  const speakerImageMatch = selectedId.match(/^speaker-image-(\d+)$/);
  if (speakerImageMatch) {
    const idx = parseInt(speakerImageMatch[1], 10);
    return (
      <SelectedElementShell
        label={`Speaker Photo #${idx + 1}`}
        onDeselect={onDeselect}
      >
        <SpeakerImageFields
          data={data}
          update={update}
          onPickImage={onPickImage}
          sortedIdx={idx}
        />
      </SelectedElementShell>
    );
  }
  const sponsorImageMatch = selectedId.match(
    /^sponsor-image-(collaborators|sponsors)-(\d+)$/,
  );
  if (sponsorImageMatch) {
    const group = sponsorImageMatch[1] as "collaborators" | "sponsors";
    const idx = parseInt(sponsorImageMatch[2], 10);
    return (
      <SelectedElementShell
        label={`${group === "collaborators" ? "Collaborator" : "Sponsor"} Logo #${idx + 1}`}
        onDeselect={onDeselect}
      >
        <SponsorImageFields
          data={data}
          update={update}
          onPickImage={onPickImage}
          group={group}
          idx={idx}
        />
      </SelectedElementShell>
    );
  }

  const label = ELEMENT_LABELS[selectedId] ?? selectedId;

  return (
    <div
      className="rounded-lg overflow-hidden border-2 border-[#FF005A] bg-white shadow-[0_8px_24px_rgba(255,0,90,0.18)]"
      style={{ animation: "selectedPanelIn 180ms ease-out" }}
    >
      <style>{`@keyframes selectedPanelIn { from { opacity: 0; transform: translateY(-4px); } to { opacity: 1; transform: translateY(0); } }`}</style>

      {/* Header bar — pink gradient, click to collapse/expand */}
      <div
        className="flex items-center justify-between px-3 py-2 cursor-pointer select-none"
        style={{
          background: "linear-gradient(90deg, #FF005A 0%, #CC0048 100%)",
        }}
        onClick={() => setCollapsed((c) => !c)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <MousePointerClick className="h-3.5 w-3.5 text-white shrink-0" />
          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-white truncate">
            Selected: {label}
          </span>
          <span
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[0.55rem] font-bold uppercase tracking-wider"
            style={{ background: "rgba(255,255,255,0.2)", color: "#fff" }}
            title="This panel updates live as you click different elements on the canvas"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#27C93F] animate-pulse" />
            LIVE
          </span>
        </div>
        <div className="flex items-center gap-1">
          <ChevronDown
            className={`h-3.5 w-3.5 text-white transition-transform ${collapsed ? "-rotate-90" : ""}`}
          />
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDeselect();
            }}
            className="ml-1 inline-flex items-center justify-center h-5 w-5 rounded hover:bg-white/20 text-white"
            title="Deselect (close this panel)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Body — content-specific fields per selectedId */}
      {!collapsed && (
        <div className="p-3 bg-white max-h-[480px] overflow-y-auto">
          {renderBody(selectedId, data, update, onPickImage)}
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Body router — dispatches to the right field block per selectedId.
// ----------------------------------------------------------------------------
function renderBody(
  selectedId: string,
  data: SpeakerIntroData,
  update: (recipe: (draft: SpeakerIntroData) => void) => void,
  onPickImage: (slot: ImageSlot) => void,
): ReactNode {
  switch (selectedId) {
    case "header":
      return <HeaderFields data={data} update={update} />;
    case "topic":
      return <TopicFields data={data} update={update} />;
    case "speakers":
      return <SpeakersFields data={data} update={update} onPickImage={onPickImage} />;
    case "hero-image":
      return <HeroImageFields data={data} update={update} onPickImage={onPickImage} />;
    case "hero-shape":
      return <HeroShapeFields data={data} update={update} />;
    case "qr":
      return <QrFields data={data} update={update} />;
    case "sponsors":
      return <SponsorsFields data={data} update={update} onPickImage={onPickImage} group="sponsors" />;
    case "collaborators":
      return <SponsorsFields data={data} update={update} onPickImage={onPickImage} group="collaborators" />;
    case "footer":
    case "style2-footer":
      return <FooterFields data={data} update={update} />;
    case "branding-asset":
      return <BrandingAssetFields data={data} update={update} onPickImage={onPickImage} />;
    default:
      return (
        <div className="text-[0.7rem] text-black/60 italic">
          No content fields available for &ldquo;{selectedId}&rdquo;. Use the
          full form below to edit this section.
        </div>
      );
  }
}

// ----------------------------------------------------------------------------
// Shared mini field primitives (compact versions of the form-view's
// Section/Field/SubCard helpers — smaller padding, tighter typography).
// ----------------------------------------------------------------------------
function MiniField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[0.62rem] font-bold uppercase tracking-wider text-black/70 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function MiniInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 ${props.className ?? ""}`}
    />
  );
}

function MiniSelect(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={`w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 ${props.className ?? ""}`}
    />
  );
}

function MiniTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 resize-y ${props.className ?? ""}`}
    />
  );
}

/** Compact "Replace from library" button — opens the image picker modal. */
function ReplaceButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded bg-[#0066FF] text-white px-2 py-1 text-[0.62rem] font-bold uppercase tracking-wider hover:bg-[#0052CC]"
    >
      <ImageIcon className="h-3 w-3" />
      {label ?? "Replace"}
    </button>
  );
}

/** Small image preview box — shows the current image so the user can see
 *  what they're editing. */
function ImagePreview({ src, alt }: { src: string; alt: string }) {
  if (!src) return null;
  return (
    <div
      className="relative w-full h-16 rounded border border-black/15 overflow-hidden bg-black/[0.04]"
      // eslint-disable-next-line @next/next/no-img-element
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="absolute inset-0 w-full h-full"
        style={{ objectFit: "contain" }}
      />
    </div>
  );
}

// ----------------------------------------------------------------------------
// Field blocks per selectedId
// ----------------------------------------------------------------------------

function HeaderFields({
  data,
  update,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Event header — name, date, time, venue, topic. Shown at the top of the canvas.
      </p>
      <MiniField label="Event name">
        <MiniInput
          type="text"
          value={data.event.name}
          onChange={(e) => update((d) => { d.event.name = e.target.value; })}
        />
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Date">
          <MiniInput
            type="text"
            value={data.event.date}
            placeholder="June 18th 2026"
            onChange={(e) => update((d) => { d.event.date = e.target.value; })}
          />
        </MiniField>
        <MiniField label="Time">
          <MiniInput
            type="text"
            value={data.event.time}
            placeholder="18:00"
            onChange={(e) => update((d) => { d.event.time = e.target.value; })}
          />
        </MiniField>
      </div>
      <MiniField label="Venue">
        <MiniInput
          type="text"
          value={data.event.venue}
          onChange={(e) => update((d) => { d.event.venue = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Topic">
        <MiniInput
          type="text"
          value={data.event.topic}
          onChange={(e) => update((d) => { d.event.topic = e.target.value; })}
        />
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Brand color 1">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={data.event.brandColors[0]}
              onChange={(e) => update((d) => { d.event.brandColors[0] = e.target.value; })}
              className="h-7 w-9 rounded border border-black/15 cursor-pointer"
            />
            <MiniInput
              type="text"
              value={data.event.brandColors[0]}
              onChange={(e) => update((d) => { d.event.brandColors[0] = e.target.value; })}
            />
          </div>
        </MiniField>
        <MiniField label="Brand color 2">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={data.event.brandColors[1]}
              onChange={(e) => update((d) => { d.event.brandColors[1] = e.target.value; })}
              className="h-7 w-9 rounded border border-black/15 cursor-pointer"
            />
            <MiniInput
              type="text"
              value={data.event.brandColors[1]}
              onChange={(e) => update((d) => { d.event.brandColors[1] = e.target.value; })}
            />
          </div>
        </MiniField>
      </div>
    </div>
  );
}

function TopicFields({
  data,
  update,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Event topic — the main headline / theme of the event.
      </p>
      <MiniField label="Topic">
        <MiniInput
          type="text"
          value={data.event.topic}
          onChange={(e) => update((d) => { d.event.topic = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Topic font scale (×)">
        <MiniInput
          type="number"
          step="0.1"
          min="0.3"
          max="3"
          value={data.event.topicFontScale ?? 1}
          onChange={(e) =>
            update((d) => {
              d.event.topicFontScale = parseFloat(e.target.value) || 1;
            })
          }
        />
      </MiniField>
    </div>
  );
}

function SpeakersFields({
  data,
  update,
  onPickImage,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  const speakersSorted = data.speakers
    .map((sp, origIdx) => ({ sp, origIdx }))
    .sort((a, b) => a.sp.order - b.sp.order);

  // === Drag-and-drop reorder state ===
  // dragSrcIdx: the sortedIdx of the card currently being dragged (null when not dragging).
  // dropPosition: where the drop would land if released now.
  //   0 = before card 0, 1 = between cards 0 and 1, ..., N = after the last card.
  //   null when not hovering a valid drop zone.
  //
  // Per user spec 2026-08-11: dragging the ⋮⋮ handle reorders speakers and
  // auto-updates the #N order badge. The numeric Order input field stays so
  // users can still type a number directly for fine control.
  const [dragSrcIdx, setDragSrcIdx] = useState<number | null>(null);
  const [dropPosition, setDropPosition] = useState<number | null>(null);

  /**
   * Move a speaker from one sorted position to another by reassigning `order`
   * fields sequentially (1, 2, 3, ...). The `data.speakers` array order is
   * NOT changed — only `speaker.order` fields are updated. This keeps React
   * keys (origIdx) stable so card-local state (expanded/collapsed) survives
   * the reorder.
   */
  function moveSpeaker(fromSortedIdx: number, toPosition: number) {
    // No-op: dropping on yourself, or just below yourself (the gap you vacated).
    if (fromSortedIdx === toPosition || fromSortedIdx + 1 === toPosition) return;
    update((d) => {
      // Sort a COPY (containing references to the SAME Speaker objects).
      const sorted = [...d.speakers].sort((a, b) => a.order - b.order);
      // Splice out the dragged speaker (still the same object reference).
      const [moved] = sorted.splice(fromSortedIdx, 1);
      // Compute insertion index in the post-removal array. If dragging DOWN
      // (fromSortedIdx < toPosition), the indices shift down by 1 after removal.
      const insertIdx =
        toPosition > fromSortedIdx ? toPosition - 1 : toPosition;
      sorted.splice(insertIdx, 0, moved);
      // Reassign sequential order fields on the SAME Speaker objects.
      // The d.speakers array order is UNCHANGED — only order fields are updated,
      // so React keys (origIdx) stay stable → expanded/collapsed state preserved.
      sorted.forEach((s, i) => {
        s.order = i + 1;
      });
    });
  }

  function handleDrop() {
    if (dragSrcIdx !== null && dropPosition !== null) {
      moveSpeaker(dragSrcIdx, dropPosition);
    }
    setDragSrcIdx(null);
    setDropPosition(null);
  }

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Speaker cards — edit names, titles, photos, bios, and session times. Click{" "}
        <strong>Replace</strong> to swap a photo from the brand library.
        <br />
        <strong>Drag the ⋮⋮ handle</strong> to reorder speakers — the #N order
        badge updates automatically.
      </p>

      {/* Grid layout controls */}
      <div className="rounded border border-black/10 bg-black/[0.02] p-2 space-y-1.5">
        <span className="text-[0.55rem] font-bold uppercase tracking-wider text-black/55">
          Grid layout
        </span>
        <div className="grid grid-cols-2 gap-2">
          <MiniField label="Columns">
            <MiniSelect
              value={String(data.speakersLayout?.columns ?? 1)}
              onChange={(e) =>
                update((d) => {
                  if (!d.speakersLayout) d.speakersLayout = {};
                  d.speakersLayout.columns = parseInt(e.target.value, 10) as 1 | 2 | 3 | 4 | 5 | 6;
                })
              }
            >
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <option key={n} value={n}>
                  {n} column{n === 1 ? "" : "s"}
                </option>
              ))}
            </MiniSelect>
          </MiniField>
          <MiniField label="Flow">
            <MiniSelect
              value={data.speakersLayout?.flowDirection ?? "row"}
              onChange={(e) =>
                update((d) => {
                  if (!d.speakersLayout) d.speakersLayout = {};
                  d.speakersLayout.flowDirection = e.target.value as "row" | "col";
                })
              }
            >
              <option value="row">Row-by-row</option>
              <option value="col">Col-by-col</option>
            </MiniSelect>
          </MiniField>
        </div>
        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            type="checkbox"
            checked={data.speakersLayout?.showSessionTime !== false}
            onChange={(e) =>
              update((d) => {
                if (!d.speakersLayout) d.speakersLayout = {};
                d.speakersLayout.showSessionTime = e.target.checked;
              })
            }
            className="h-3.5 w-3.5 rounded border-black/30 text-[#FF005A]"
          />
          <span className="text-[0.65rem] font-semibold text-black/80">
            Show session time on cards
          </span>
        </label>
      </div>

      {/* === Per-speaker cards with drag-and-drop drop indicators ===
          The wrapping div is the drop target — onDrop fires whether the user
          drops on a card or in the gap between cards. Each card's onDragOver
          computes the cursor's position relative to its midpoint to decide
          whether to insert ABOVE (dropPosition = sortedIdx) or BELOW
          (dropPosition = sortedIdx + 1). The end-of-list drop zone catches
          drops below the last card (dropPosition = N). */}
      <div
        onDragOver={(e) => {
          // Required to allow drop — without preventDefault, the browser
          // refuses to fire the drop event.
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDrop={(e) => {
          e.preventDefault();
          handleDrop();
        }}
      >
        {speakersSorted.map(({ sp, origIdx }, sortedIdx) => (
          <div key={`sp-wrap-${origIdx}`}>
            {/* Drop indicator above this card */}
            <DropIndicator
              visible={dropPosition === sortedIdx && dragSrcIdx !== null}
            />
            <SpeakerCard
              key={`sp-${origIdx}`}
              speaker={sp}
              isDragging={dragSrcIdx === sortedIdx}
              onDragStart={() => setDragSrcIdx(sortedIdx)}
              onDragOverCard={(e) => {
                // Determine top-half vs bottom-half of this card.
                const rect = (
                  e.currentTarget as HTMLElement
                ).getBoundingClientRect();
                const midY = rect.top + rect.height / 2;
                const before = e.clientY < midY;
                setDropPosition(before ? sortedIdx : sortedIdx + 1);
              }}
              onDragEnd={() => {
                // dragend always fires on the source element — clears state
                // even if the user dropped outside any valid target.
                setDragSrcIdx(null);
                setDropPosition(null);
              }}
              onChange={(recipe) =>
                update((d) => {
                  const target = d.speakers[origIdx];
                  if (target) recipe(target);
                })
              }
              onDelete={() =>
                update((d) => {
                  d.speakers.splice(origIdx, 1);
                })
              }
              onReplacePhoto={() => onPickImage({ kind: "speaker", index: origIdx })}
            />
          </div>
        ))}

        {/* End-of-list drop zone — catches drops below the last card. */}
        <div
          className="h-3"
          onDragOver={(e) => {
            e.preventDefault();
            setDropPosition(speakersSorted.length);
          }}
        >
          <DropIndicator
            visible={
              dropPosition === speakersSorted.length && dragSrcIdx !== null
            }
          />
        </div>
      </div>

      <button
        type="button"
        onClick={() =>
          update((d) => {
            const nextOrder = Math.max(0, ...d.speakers.map((s) => s.order)) + 1;
            d.speakers.push({
              order: nextOrder,
              role: "Speaker",
              fullName: "New Speaker",
              title: "",
              company: "",
              photoUrl: "",
            });
          })
        }
        className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-black/30 text-black/70 font-semibold px-2 py-1.5 text-[0.7rem] hover:bg-black/5"
      >
        <Plus className="h-3 w-3" /> Add speaker
      </button>
    </div>
  );
}

/**
 * DropIndicator — thin blue line shown between speaker cards during drag-and-drop.
 * Renders as a 0-height invisible element when not active (so it doesn't take
 * vertical space), and animates to a 2px blue line with small vertical margins
 * when active. Per the preview at /speaker-drag-drop-preview.html.
 */
function DropIndicator({ visible }: { visible: boolean }) {
  return (
    <div
      aria-hidden={!visible}
      className={`rounded-full bg-[#004F98] transition-all duration-100 ${
        visible ? "h-0.5 opacity-100 my-1" : "h-0 opacity-0"
      }`}
    />
  );
}

function SpeakerCard({
  speaker,
  isDragging,
  onDragStart,
  onDragOverCard,
  onDragEnd,
  onChange,
  onDelete,
  onReplacePhoto,
}: {
  speaker: Speaker;
  /** True while this card is being dragged — applies opacity + shadow. */
  isDragging: boolean;
  /** Fired when the user starts dragging the ⋮⋮ handle. */
  onDragStart: () => void;
  /** Fired while dragging over this card — parent computes drop position. */
  onDragOverCard: (e: React.DragEvent) => void;
  /** Fired when the drag ends (drop or cancel) — always fires on the source. */
  onDragEnd: () => void;
  onChange: (recipe: (draft: Speaker) => void) => void;
  onDelete: () => void;
  onReplacePhoto: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div
      className={`rounded border border-black/15 bg-white overflow-hidden transition-opacity ${
        isDragging ? "opacity-40" : "opacity-100"
      }`}
      onDragOver={onDragOverCard}
    >
      <div className="flex items-center justify-between px-2 py-1.5 bg-black/[0.02]">
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {/* Drag handle — the only draggable element on the card.
              The rest of the header (chevron + name) stays as a toggle button
              so expand/collapse still works. */}
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              // Required for Firefox to start the drag — without setData,
              // Firefox fires dragstart but no further events.
              e.dataTransfer.setData("text/plain", "speaker-card");
              onDragStart();
            }}
            onDragEnd={onDragEnd}
            className="cursor-grab text-black/35 hover:text-black/60 active:cursor-grabbing touch-none flex items-center"
            title="Drag to reorder"
          >
            <GripVertical className="h-3 w-3" />
          </span>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
          >
            <ChevronDown
              className={`h-3 w-3 text-black/60 transition-transform ${open ? "rotate-180" : ""}`}
            />
            <span className="text-[0.72rem] font-bold text-black truncate">
              #{speaker.order} · {speaker.fullName || "Untitled"}
            </span>
          </button>
        </div>
        <button
          type="button"
          onClick={onDelete}
          className="text-red-500 hover:bg-red-50 p-1 rounded"
          title="Delete speaker"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      {open && (
        <div className="p-2 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="Order">
              <MiniInput
                type="number"
                min={1}
                value={speaker.order}
                onChange={(e) =>
                  onChange((s) => { s.order = parseInt(e.target.value, 10) || 1; })
                }
              />
            </MiniField>
            <MiniField label="Role">
              <MiniSelect
                value={speaker.role}
                onChange={(e) =>
                  onChange((s) => { s.role = e.target.value as Speaker["role"]; })
                }
              >
                <option value="Speaker">Speaker</option>
                <option value="Moderator">Moderator</option>
                <option value="Panelist">Panelist</option>
                <option value="Host">Host</option>
              </MiniSelect>
            </MiniField>
          </div>
          <MiniField label="Full name">
            <MiniInput
              type="text"
              value={speaker.fullName}
              onChange={(e) => onChange((s) => { s.fullName = e.target.value; })}
            />
          </MiniField>
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="Title">
              <MiniInput
                type="text"
                value={speaker.title}
                onChange={(e) => onChange((s) => { s.title = e.target.value; })}
              />
            </MiniField>
            <MiniField label="Company">
              <MiniInput
                type="text"
                value={speaker.company}
                onChange={(e) => onChange((s) => { s.company = e.target.value; })}
              />
            </MiniField>
          </div>
          <MiniField label="Bio">
            <MiniTextarea
              rows={2}
              value={speaker.bio ?? ""}
              onChange={(e) => onChange((s) => { s.bio = e.target.value || undefined; })}
            />
          </MiniField>
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="Session title">
              <MiniInput
                type="text"
                value={speaker.sessionTitle ?? ""}
                onChange={(e) => onChange((s) => { s.sessionTitle = e.target.value || undefined; })}
              />
            </MiniField>
            <MiniField label="Session time (HH:MM)">
              <MiniInput
                type="text"
                value={speaker.sessionTime ?? ""}
                placeholder="18:30"
                onChange={(e) => onChange((s) => { s.sessionTime = e.target.value || undefined; })}
              />
            </MiniField>
          </div>
          {/* Photo */}
          <MiniField label="Photo">
            <ImagePreview src={speaker.photoUrl} alt={speaker.fullName} />
            <div className="flex items-center gap-1.5 mt-1">
              <ReplaceButton onClick={onReplacePhoto} label="Replace photo" />
              <MiniInput
                type="url"
                value={speaker.photoUrl}
                placeholder="https://..."
                onChange={(e) => onChange((s) => { s.photoUrl = e.target.value; })}
                className="flex-1"
              />
            </div>
          </MiniField>
          <div className="grid grid-cols-2 gap-2">
            <MiniField label="Photo size (×)">
              <MiniInput
                type="number"
                step="0.1"
                min="0.1"
                value={speaker.photoSize ?? 1}
                onChange={(e) =>
                  onChange((s) => { s.photoSize = parseFloat(e.target.value) || 1; })
                }
              />
            </MiniField>
            <MiniField label="Visible">
              <MiniSelect
                value={speaker.visible === false ? "false" : "true"}
                onChange={(e) =>
                  onChange((s) => { s.visible = e.target.value === "true"; })
                }
              >
                <option value="true">Yes</option>
                <option value="false">No (hidden)</option>
              </MiniSelect>
            </MiniField>
          </div>
        </div>
      )}
    </div>
  );
}

function HeroImageFields({
  data,
  update,
  onPickImage,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Hero image — the main background photo on the canvas. Click{" "}
        <strong>Replace</strong> to pick from the brand library.
      </p>
      <ImagePreview src={data.heroOverlay.imageUrl} alt="Hero" />
      <div className="flex items-center gap-1.5">
        <ReplaceButton onClick={() => onPickImage({ kind: "hero" })} label="Replace hero" />
        <MiniInput
          type="url"
          value={data.heroOverlay.imageUrl}
          placeholder="https://..."
          onChange={(e) => update((d) => { d.heroOverlay.imageUrl = e.target.value; })}
          className="flex-1"
        />
      </div>
      <MiniField label="Image fit">
        <MiniSelect
          value={data.heroOverlay.fit ?? "cover"}
          onChange={(e) =>
            update((d) => { d.heroOverlay.fit = e.target.value as "cover" | "contain"; })
          }
        >
          <option value="cover">Cover — fill, crop overflow</option>
          <option value="contain">Contain — fit, letterbox if needed</option>
        </MiniSelect>
      </MiniField>
      <MiniField label="Gradient colors">
        <GradientColorPicker
          colors={data.heroOverlay.gradientColors}
          onChange={(next) =>
            update((d) => { d.heroOverlay.gradientColors = next; })
          }
        />
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Gradient opacity">
          <MiniInput
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={data.heroOverlay.gradientOpacity}
            onChange={(e) =>
              update((d) => { d.heroOverlay.gradientOpacity = parseFloat(e.target.value) || 0; })
            }
          />
        </MiniField>
        <MiniField label="Image scale X (×)">
          <MiniInput
            type="number"
            step="0.05"
            min="0.01"
            value={data.heroOverlay.imageScale ?? 1}
            onChange={(e) =>
              update((d) => { d.heroOverlay.imageScale = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
      </div>
    </div>
  );
}

function HeroShapeFields({
  data,
  update,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
}) {
  // Only Style 2 uses style2HeroGradient; for Style 1/3, heroOverlayShapeConfig
  // is the relevant field — but the "hero-shape" selectedId only fires on
  // Style 2's canvas (Style 1/3 doesn't have a hero-shape SectionBox).
  if (data.style !== "style2") {
    return (
      <div className="text-[0.7rem] text-black/60 italic">
        Hero shape is only available in Style 2.
      </div>
    );
  }
  const cfg = data.style2HeroGradient ?? {};
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Hero gradient shape — the colored panel that sits behind the hero image
        on Style 2.
      </p>
      <MiniField label="Shape">
        <MiniSelect
          value={cfg.shape ?? "rectangle"}
          onChange={(e) =>
            update((d) => {
              if (!d.style2HeroGradient) d.style2HeroGradient = {};
              d.style2HeroGradient.shape = e.target.value as
                | "none" | "legacy-triangle"
                | "rectangle" | "circle" | "oval" | "triangle" | "square"
                | "pentagon" | "hexagon" | "octagon"
                | "sphere" | "cube" | "cone" | "cylinder" | "pyramid";
            })
          }
        >
          <optgroup label="Special">
            <option value="none">None (no shape)</option>
            <option value="legacy-triangle">Triangle (legacy SVG)</option>
          </optgroup>
          <optgroup label="2D plane shapes">
            <option value="rectangle">Rectangle (full panel)</option>
            <option value="circle">Circle</option>
            <option value="oval">Oval / Ellipse</option>
            <option value="triangle">Triangle</option>
            <option value="square">Square</option>
            <option value="pentagon">Pentagon</option>
            <option value="hexagon">Hexagon</option>
            <option value="octagon">Octagon</option>
          </optgroup>
          <optgroup label="3D solid shapes">
            <option value="sphere">Sphere</option>
            <option value="cube">Cube</option>
            <option value="cone">Cone</option>
            <option value="cylinder">Cylinder</option>
            <option value="pyramid">Pyramid</option>
          </optgroup>
        </MiniSelect>
      </MiniField>
      <MiniField label="Gradient colors">
        <GradientColorPicker
          colors={cfg.colors ?? ["#311B92", "#1A237E", "#0B0B2E"]}
          onChange={(next) =>
            update((d) => {
              if (!d.style2HeroGradient) d.style2HeroGradient = {};
              d.style2HeroGradient.colors = next;
            })
          }
        />
      </MiniField>
      <div className="grid grid-cols-3 gap-2">
        <MiniField label="Direction (°)">
          <MiniInput
            type="number"
            min={0}
            max={360}
            value={cfg.direction ?? 180}
            onChange={(e) =>
              update((d) => {
                if (!d.style2HeroGradient) d.style2HeroGradient = {};
                d.style2HeroGradient.direction = Number(e.target.value) || 0;
              })
            }
          />
        </MiniField>
        <MiniField label="Opacity">
          <MiniInput
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={cfg.opacity ?? 0.9}
            onChange={(e) =>
              update((d) => {
                if (!d.style2HeroGradient) d.style2HeroGradient = {};
                d.style2HeroGradient.opacity = parseFloat(e.target.value) || 0;
              })
            }
          />
        </MiniField>
        <MiniField label="Rotation (°)">
          <MiniInput
            type="number"
            min={0}
            max={360}
            step={15}
            value={cfg.rotation ?? 0}
            onChange={(e) =>
              update((d) => {
                if (!d.style2HeroGradient) d.style2HeroGradient = {};
                d.style2HeroGradient.rotation = Number(e.target.value) || 0;
              })
            }
          />
        </MiniField>
      </div>
    </div>
  );
}

function QrFields({
  data,
  update,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        QR code URL — the destination when attendees scan the QR code on the mockup.
      </p>
      <MiniField label="QR code URL">
        <MiniInput
          type="url"
          value={data.qrCodeUrl}
          placeholder="https://..."
          onChange={(e) => update((d) => { d.qrCodeUrl = e.target.value; })}
        />
      </MiniField>
    </div>
  );
}

function SponsorsFields({
  data,
  update,
  onPickImage,
  group,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
  group: "sponsors" | "collaborators";
}) {
  const arr = group === "sponsors" ? data.sponsors : data.collaborators;
  const label = group === "sponsors" ? "Sponsors" : "Collaborators";
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        {label} — name + logo for each. Click <strong>Replace</strong> to swap a logo from the brand library.
      </p>
      {arr.map((s, idx) => (
        <SponsorCard
          key={`${group}-${idx}`}
          sponsor={s}
          onChange={(recipe) =>
            update((d) => {
              const target = group === "sponsors" ? d.sponsors[idx] : d.collaborators[idx];
              if (target) recipe(target);
            })
          }
          onDelete={() =>
            update((d) => {
              if (group === "sponsors") d.sponsors.splice(idx, 1);
              else d.collaborators.splice(idx, 1);
            })
          }
          onReplaceLogo={() => onPickImage({ kind: "sponsor", group, index: idx })}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          update((d) => {
            const next = { name: `New ${label.slice(0, -1)}`, logoUrl: "" };
            if (group === "sponsors") d.sponsors.push(next);
            else d.collaborators.push(next);
          })
        }
        className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-black/30 text-black/70 font-semibold px-2 py-1.5 text-[0.7rem] hover:bg-black/5"
      >
        <Plus className="h-3 w-3" /> Add {label.slice(0, -1).toLowerCase()}
      </button>
    </div>
  );
}

function SponsorCard({
  sponsor,
  onChange,
  onDelete,
  onReplaceLogo,
}: {
  sponsor: SpeakerIntroData["sponsors"][number];
  onChange: (recipe: (draft: SpeakerIntroData["sponsors"][number]) => void) => void;
  onDelete: () => void;
  onReplaceLogo: () => void;
}) {
  return (
    <div className="rounded border border-black/15 bg-white p-2 space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[0.72rem] font-bold text-black truncate">
          {sponsor.name || "Untitled"}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="text-red-500 hover:bg-red-50 p-1 rounded"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <MiniField label="Name">
        <MiniInput
          type="text"
          value={sponsor.name}
          onChange={(e) => onChange((s) => { s.name = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Logo">
        <ImagePreview src={sponsor.logoUrl} alt={sponsor.name} />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton onClick={onReplaceLogo} label="Replace logo" />
          <MiniInput
            type="url"
            value={sponsor.logoUrl}
            placeholder="https://..."
            onChange={(e) => onChange((s) => { s.logoUrl = e.target.value; })}
            className="flex-1"
          />
        </div>
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Logo size (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={sponsor.logoSize ?? 1}
            onChange={(e) =>
              onChange((s) => { s.logoSize = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Theme">
          <MiniSelect
            value={sponsor.theme ?? "light"}
            onChange={(e) =>
              onChange((s) => { s.theme = e.target.value as "light" | "dark"; })
            }
          >
            <option value="light">Light (for dark backgrounds)</option>
            <option value="dark">Dark (for light backgrounds)</option>
          </MiniSelect>
        </MiniField>
      </div>
    </div>
  );
}

function FooterFields({
  data,
  update,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Footer credit — small text at the bottom of the canvas (e.g. &ldquo;AI Salon · Tel Aviv&rdquo;).
      </p>
      <MiniField label="Footer credit text">
        <MiniInput
          type="text"
          value={data.footerCredit ?? ""}
          placeholder="AI Salon · Tel Aviv"
          onChange={(e) => update((d) => { d.footerCredit = e.target.value || undefined; })}
        />
      </MiniField>
    </div>
  );
}

function BrandingAssetFields({
  data,
  update,
  onPickImage,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Branding asset — the small logo at the bottom-left of the canvas. Click{" "}
        <strong>Replace</strong> to pick from the brand library.
      </p>
      <ImagePreview src={data.brandingAsset?.imageUrl ?? ""} alt="Branding" />
      <div className="flex items-center gap-1.5">
        <ReplaceButton
          onClick={() => onPickImage({ kind: "branding-asset" })}
          label="Replace branding"
        />
        <MiniInput
          type="url"
          value={data.brandingAsset?.imageUrl ?? ""}
          placeholder="https://..."
          onChange={(e) =>
            update((d) => {
              d.brandingAsset = {
                ...(d.brandingAsset ?? {}),
                imageUrl: e.target.value || undefined,
              };
            })
          }
          className="flex-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Height (px)">
          <MiniInput
            type="number"
            min="8"
            max="200"
            value={data.brandingAsset?.height ?? 48}
            onChange={(e) =>
              update((d) => {
                d.brandingAsset = {
                  ...(d.brandingAsset ?? {}),
                  height: parseInt(e.target.value, 10) || 48,
                };
              })
            }
          />
        </MiniField>
        <MiniField label="Reset position">
          <button
            type="button"
            onClick={() =>
              update((d) => {
                if (d.brandingAsset) d.brandingAsset.pos = undefined;
              })
            }
            disabled={!data.brandingAsset?.pos}
            className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Reset to corner
          </button>
        </MiniField>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// PER USER SPEC 2026-08-02 (TSK-0055): per-image field blocks. These render
// when the user clicks a SPECIFIC image on the canvas (in edit-images mode)
// rather than a section. They show ONLY the edit fields relevant to that
// specific image: Replace button, URL, photo size / focus / zoom, visible
// toggle for speakers; Replace + URL + logo size for sponsor logos.
// ----------------------------------------------------------------------------

function SpeakerImageFields({
  data,
  update,
  onPickImage,
  sortedIdx,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
  /** Position of this speaker in the SORTED-by-order array (matches the
   *  index the canvas passes to slot.kind === "speaker"). */
  sortedIdx: number;
}) {
  // The canvas sorts speakers by `order` then indexes — replicate that
  // here so the index matches the photo the user clicked.
  const sortedSpeakers = [...data.speakers].sort((a, b) => a.order - b.order);
  const speaker = sortedSpeakers[sortedIdx];
  // Find the original (unsorted) index so update recipes can target the
  // right object in `data.speakers`.
  const origIdx = speaker ? data.speakers.indexOf(speaker) : -1;

  if (!speaker || origIdx < 0) {
    return (
      <div className="text-[0.7rem] text-black/60 italic">
        Speaker not found. The speaker list may have changed — click the
        image again to re-select.
      </div>
    );
  }

  // Helper: apply a recipe to just this speaker.
  const updateSpeaker = (recipe: (s: Speaker) => void) =>
    update((d) => {
      const target = d.speakers[origIdx];
      if (target) recipe(target);
    });

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Speaker photo — click <strong>Replace</strong> to swap from the brand
        library. Drag the photo on the canvas to pan; scroll to zoom.
      </p>
      <div className="rounded border border-black/10 bg-black/[0.02] p-2 space-y-1">
        <div className="text-[0.6rem] font-bold uppercase tracking-wider text-black/55">
          Speaker
        </div>
        <div className="text-[0.78rem] font-bold text-black truncate">
          #{speaker.order} · {speaker.fullName || "Untitled"}
        </div>
        {(speaker.title || speaker.company) && (
          <div className="text-[0.65rem] text-black/60 truncate">
            {speaker.title}
            {speaker.title && speaker.company ? ", " : ""}
            {speaker.company}
          </div>
        )}
      </div>
      <MiniField label="Photo">
        <ImagePreview src={speaker.photoUrl} alt={speaker.fullName} />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "speaker", index: sortedIdx })}
            label="Replace photo"
          />
          <MiniInput
            type="url"
            value={speaker.photoUrl}
            placeholder="https://..."
            onChange={(e) => updateSpeaker((s) => { s.photoUrl = e.target.value; })}
            className="flex-1"
          />
        </div>
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Photo size (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={speaker.photoSize ?? 1}
            onChange={(e) =>
              updateSpeaker((s) => { s.photoSize = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Visible">
          <MiniSelect
            value={speaker.visible === false ? "false" : "true"}
            onChange={(e) =>
              updateSpeaker((s) => { s.visible = e.target.value === "true"; })
            }
          >
            <option value="true">Yes</option>
            <option value="false">No (hidden)</option>
          </MiniSelect>
        </MiniField>
      </div>
      {(speaker.photoPlacement || speaker.photoSize !== undefined) && (
        <button
          type="button"
          onClick={() =>
            updateSpeaker((s) => {
              s.photoPlacement = undefined;
              s.photoSize = undefined;
            })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5"
        >
          Reset photo placement &amp; size
        </button>
      )}
    </div>
  );
}

function SponsorImageFields({
  data,
  update,
  onPickImage,
  group,
  idx,
}: {
  data: SpeakerIntroData;
  update: (recipe: (draft: SpeakerIntroData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
  group: "collaborators" | "sponsors";
  idx: number;
}) {
  const arr = group === "collaborators" ? data.collaborators : data.sponsors;
  const sponsor = arr[idx];

  if (!sponsor) {
    return (
      <div className="text-[0.7rem] text-black/60 italic">
        {group === "collaborators" ? "Collaborator" : "Sponsor"} not found.
        The list may have changed — click the logo again to re-select.
      </div>
    );
  }

  const updateSponsor = (recipe: (s: { name: string; logoUrl: string; logoSize?: number }) => void) =>
    update((d) => {
      const targetArr = group === "collaborators" ? d.collaborators : d.sponsors;
      const target = targetArr[idx];
      if (target) recipe(target);
    });

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        {group === "collaborators" ? "Collaborator" : "Sponsor"} logo — click{" "}
        <strong>Replace</strong> to swap from the brand library. Drag the
        corner handles on the canvas to resize.
      </p>
      <div className="rounded border border-black/10 bg-black/[0.02] p-2 space-y-1">
        <div className="text-[0.6rem] font-bold uppercase tracking-wider text-black/55">
          {group === "collaborators" ? "Collaborator" : "Sponsor"}
        </div>
        <div className="text-[0.78rem] font-bold text-black truncate">
          {sponsor.name || "Untitled"}
        </div>
      </div>
      <MiniField label="Logo">
        <ImagePreview src={sponsor.logoUrl} alt={sponsor.name} />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "sponsor", group, index: idx })}
            label="Replace logo"
          />
          <MiniInput
            type="url"
            value={sponsor.logoUrl}
            placeholder="https://..."
            onChange={(e) => updateSponsor((s) => { s.logoUrl = e.target.value; })}
            className="flex-1"
          />
        </div>
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Logo size (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={sponsor.logoSize ?? 1}
            onChange={(e) =>
              updateSponsor((s) => { s.logoSize = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Name">
          <MiniInput
            type="text"
            value={sponsor.name}
            onChange={(e) => updateSponsor((s) => { s.name = e.target.value; })}
          />
        </MiniField>
      </div>
    </div>
  );
}

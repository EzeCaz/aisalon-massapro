"use client";

/**
 * EventProfileSelectedPanel — per-asset editor for the currently-selected
 * element on the event-profile canvas.
 *
 * PER USER SPEC 2026-08-02:
 *   "when clicking the specific asset we want to edit, generate a new tab
 *    on the left of the mockup, above the entire form editor, only the
 *    specific edit details of the object/asset i am editing"
 *
 * selectedId values handled (matching event-profile-canvas.tsx):
 *   - "header"   → event name / date / venue / topic + hero image + brand colors
 *   - "sponsors" → collaborators + sponsors lists (with logo replace)
 *   - "footer"   → footer credit text + font size
 */

import { type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EventProfileData, ImageSlot, Sponsor } from "../event-profile/types";
import {
  SelectedElementShell,
  MiniField,
  MiniInput,
  MiniSelect,
  ReplaceButton,
  ImagePreview,
  useUpdate,
  NoFieldsHint,
} from "./selected-element-shell";

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------
type Props = {
  selectedId: string | null;
  data: EventProfileData;
  onChange: (next: EventProfileData) => void;
  onPickImage: (slot: ImageSlot) => void;
  onDeselect: () => void;
};

const ELEMENT_LABELS: Record<string, string> = {
  header: "Header (hero + title)",
  sponsors: "Sponsors & collaborators",
  footer: "Footer",
};

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function EventProfileSelectedPanel({
  selectedId,
  data,
  onChange,
  onPickImage,
  onDeselect,
}: Props) {
  const update = useUpdate(data, onChange);

  if (!selectedId) return null;
  const label = ELEMENT_LABELS[selectedId] ?? selectedId;

  return (
    <SelectedElementShell label={label} onDeselect={onDeselect}>
      {renderBody(selectedId, data, update, onPickImage)}
    </SelectedElementShell>
  );
}

// ----------------------------------------------------------------------------
// Body router
// ----------------------------------------------------------------------------
function renderBody(
  selectedId: string,
  data: EventProfileData,
  update: (recipe: (draft: EventProfileData) => void) => void,
  onPickImage: (slot: ImageSlot) => void,
): ReactNode {
  switch (selectedId) {
    case "header":
      return <HeaderFields data={data} update={update} onPickImage={onPickImage} />;
    case "sponsors":
      return <SponsorsFields data={data} update={update} onPickImage={onPickImage} />;
    case "footer":
      return <FooterFields data={data} update={update} />;
    default:
      return <NoFieldsHint selectedId={selectedId} />;
  }
}

// ----------------------------------------------------------------------------
// Field blocks
// ----------------------------------------------------------------------------

function HeaderFields({
  data,
  update,
  onPickImage,
}: {
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Header — event name, date/venue, topic, hero image, and brand colors.
        Click <strong>Replace</strong> to swap the hero image from the brand
        library.
      </p>

      {/* Hero image */}
      <MiniField label="Hero image (background)">
        <ImagePreview src={data.heroOverlay.imageUrl} alt="Hero" />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton onClick={() => onPickImage({ kind: "hero" })} label="Replace hero" />
          <MiniInput
            type="url"
            value={data.heroOverlay.imageUrl}
            placeholder="https://..."
            onChange={(e) => update((d) => { d.heroOverlay.imageUrl = e.target.value; })}
            className="flex-1"
          />
        </div>
      </MiniField>

      <div className="border-t border-black/10 my-2" />

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
      <MiniField label="Description (optional)">
        <textarea
          rows={2}
          value={data.event.description ?? ""}
          onChange={(e) =>
            update((d) => { d.event.description = e.target.value || undefined; })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.78rem] text-black outline-none focus:border-[#FF005A] focus:ring-1 focus:ring-[#FF005A]/30 resize-y"
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

function SponsorsFields({
  data,
  update,
  onPickImage,
}: {
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Collaborators + sponsors logos at the bottom-right. Click Replace to
        swap a logo from the brand library.
      </p>

      <SponsorList
        title="Collaborators"
        list={data.collaborators}
        group="collaborators"
        onPickImage={onPickImage}
        onChange={(recipe) =>
          update((d) => { recipe(d.collaborators); })
        }
      />
      <SponsorList
        title="Sponsors"
        list={data.sponsors}
        group="sponsors"
        onPickImage={onPickImage}
        onChange={(recipe) =>
          update((d) => { recipe(d.sponsors); })
        }
      />
    </div>
  );
}

function SponsorList({
  title,
  list,
  group,
  onPickImage,
  onChange,
}: {
  title: string;
  list: Sponsor[];
  group: "collaborators" | "sponsors";
  onPickImage: (slot: ImageSlot) => void;
  onChange: (recipe: (draft: Sponsor[]) => void) => void;
}) {
  return (
    <div className="rounded border border-black/10 bg-black/[0.02] p-2 space-y-1.5">
      <span className="text-[0.55rem] font-bold uppercase tracking-wider text-black/55">
        {title}
      </span>
      {list.map((sp, i) => (
        <SponsorRow
          key={`${group}-${i}`}
          sponsor={sp}
          onReplaceLogo={() => onPickImage({ kind: "sponsor", group, index: i })}
          onChange={(recipe) => onChange((arr) => { recipe(arr[i]); })}
          onDelete={() => onChange((arr) => { arr.splice(i, 1); })}
        />
      ))}
      <button
        type="button"
        onClick={() =>
          onChange((arr) => {
            arr.push({ name: "New", logoUrl: "" });
          })
        }
        className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-black/30 text-black/70 font-semibold px-2 py-1 text-[0.65rem] hover:bg-black/5"
      >
        <Plus className="h-3 w-3" /> Add {title.slice(0, -1).toLowerCase()}
      </button>
    </div>
  );
}

function SponsorRow({
  sponsor,
  onReplaceLogo,
  onChange,
  onDelete,
}: {
  sponsor: Sponsor;
  onReplaceLogo: () => void;
  onChange: (recipe: (draft: Sponsor) => void) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded border border-black/10 bg-white p-1.5 space-y-1">
      <div className="flex items-center gap-1">
        <MiniInput
          type="text"
          value={sponsor.name}
          placeholder="Name"
          onChange={(e) => onChange((s) => { s.name = e.target.value; })}
          className="flex-1"
        />
        <button
          type="button"
          onClick={onDelete}
          className="text-red-500 hover:bg-red-50 p-1 rounded"
          title="Delete"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
      <ImagePreview src={sponsor.logoUrl} alt={sponsor.name} />
      <div className="flex items-center gap-1">
        <ReplaceButton onClick={onReplaceLogo} label="Logo" />
        <MiniInput
          type="url"
          value={sponsor.logoUrl}
          placeholder="https://..."
          onChange={(e) => onChange((s) => { s.logoUrl = e.target.value; })}
          className="flex-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-1">
        <MiniField label="Size (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={sponsor.logoSize ?? 1}
            onChange={(e) => onChange((s) => { s.logoSize = parseFloat(e.target.value) || 1; })}
          />
        </MiniField>
        <MiniField label="Theme">
          <MiniSelect
            value={sponsor.theme ?? "dark"}
            onChange={(e) => onChange((s) => { s.theme = e.target.value as "light" | "dark"; })}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
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
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Footer credit text at the bottom-left of the canvas.
      </p>
      <MiniField label="Footer credit">
        <MiniInput
          type="text"
          value={data.footerCredit ?? ""}
          placeholder="Optional"
          onChange={(e) => update((d) => { d.footerCredit = e.target.value || undefined; })}
        />
      </MiniField>
      <MiniField label="Footer font size">
        <MiniInput
          type="number"
          min="6"
          step="0.5"
          value={data.textStyles?.footerCredit?.fontSize ?? 11}
          onChange={(e) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              if (!d.textStyles.footerCredit) d.textStyles.footerCredit = {};
              d.textStyles.footerCredit.fontSize = parseFloat(e.target.value) || undefined;
            })
          }
        />
      </MiniField>
      <MiniField label="Footer color">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={data.textStyles?.footerCredit?.color ?? "#FFFFFF"}
            onChange={(e) =>
              update((d) => {
                if (!d.textStyles) d.textStyles = {};
                if (!d.textStyles.footerCredit) d.textStyles.footerCredit = {};
                d.textStyles.footerCredit.color = e.target.value;
              })
            }
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
          />
          <MiniInput
            type="text"
            value={data.textStyles?.footerCredit?.color ?? "#FFFFFF"}
            onChange={(e) =>
              update((d) => {
                if (!d.textStyles) d.textStyles = {};
                if (!d.textStyles.footerCredit) d.textStyles.footerCredit = {};
                d.textStyles.footerCredit.color = e.target.value;
              })
            }
          />
        </div>
      </MiniField>
    </div>
  );
}

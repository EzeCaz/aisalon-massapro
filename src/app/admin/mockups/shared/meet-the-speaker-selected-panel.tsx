"use client";

/**
 * MeetTheSpeakerSelectedPanel — per-asset editor for the currently-selected
 * element on the meet-the-speaker canvas.
 *
 * PER USER SPEC 2026-08-02:
 *   "when clicking the specific asset we want to edit, generate a new tab
 *    on the left of the mockup, above the entire form editor, only the
 *    specific edit details of the object/asset i am editing"
 *
 * This panel renders at the TOP of the left form column (above the full
 * form-view) when the user clicks a section on the canvas. It uses the
 * shared SelectedElementShell for the sleek pink-gradient header +
 * collapse / close / LIVE indicator, then renders content-specific fields
 * per selectedId.
 *
 * selectedId values handled (matching meet-the-speaker-canvas.tsx):
 *   - "speaker-info"  → header text + speaker name/title/company/role/topic/bio
 *   - "hero-shape"    → Style 3 hero shape config (shape, fillMode, colors, etc.)
 *   - "qr"            → QR code URL + "Register here" caption
 *   - "event-meta"    → event name/date/time/venue + footer credit
 *   - "sponsors"      → collaborators + sponsors lists (with logo replace)
 *   - "footer"        → footer credit text
 */

import { type ReactNode } from "react";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import type { MeetTheSpeakerData, ImageSlot, Sponsor, SpeakerRole } from "../meet-the-speaker/types";
import {
  SelectedElementShell,
  MiniField,
  MiniInput,
  MiniSelect,
  MiniTextarea,
  ReplaceButton,
  ImagePreview,
  useUpdate,
  NoFieldsHint,
} from "./selected-element-shell";
import { HeroShapePanelFields, type HeroShapeConfig } from "./hero-shape";
import type { HeroShapeType, HeroShapeFillMode } from "./hero-shape";

// ----------------------------------------------------------------------------
// Props
// ----------------------------------------------------------------------------
type Props = {
  selectedId: string | null;
  data: MeetTheSpeakerData;
  onChange: (next: MeetTheSpeakerData) => void;
  onPickImage: (slot: ImageSlot) => void;
  onDeselect: () => void;
};

// Human-readable labels per selectedId
const ELEMENT_LABELS: Record<string, string> = {
  "speaker-info": "Speaker info",
  "hero-shape": "Hero Shape (Style 3)",
  qr: "QR Code",
  "event-meta": "Event details",
  sponsors: "Sponsors & collaborators",
  footer: "Footer",
};

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function MeetTheSpeakerSelectedPanel({
  selectedId,
  data,
  onChange,
  onPickImage,
  onDeselect,
}: Props) {
  const update = useUpdate(data, onChange);

  if (!selectedId) return null;

  // PER USER SPEC 2026-08-02 (TSK-0055-extend): support per-image
  // selection. When the user clicks a specific image on the canvas (in
  // edit-images mode), selectedId is one of:
  //   `sponsor-image-${group}-${idx}` — a specific sponsor/collab logo
  //   `speaker-photo`       — the speaker portrait photo
  //   `graphic`             — the meerkat brand graphic
  //   `branding-asset`      — the bottom-left AI Salon branding
  //   `hero-style2`         — the Style 2 hero image
  // We parse these dynamically and render a focused per-image editor.
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

  return (
    <SelectedElementShell label={imageLabel(selectedId)} onDeselect={onDeselect}>
      {renderBody(selectedId, data, update, onPickImage)}
    </SelectedElementShell>
  );
}

function imageLabel(selectedId: string): string {
  if (selectedId === "speaker-photo") return "Speaker Photo";
  if (selectedId === "graphic") return "Brand Graphic";
  if (selectedId === "branding-asset") return "Branding Asset";
  if (selectedId === "hero-style2") return "Hero Image (Style 2)";
  return ELEMENT_LABELS[selectedId] ?? selectedId;
}

// ----------------------------------------------------------------------------
// Body router
// ----------------------------------------------------------------------------
function renderBody(
  selectedId: string,
  data: MeetTheSpeakerData,
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void,
  onPickImage: (slot: ImageSlot) => void,
): ReactNode {
  switch (selectedId) {
    case "speaker-info":
      return <SpeakerInfoFields data={data} update={update} onPickImage={onPickImage} />;
    case "hero-shape":
      return <HeroShapeFields data={data} update={update} />;
    case "qr":
      return <QrFields data={data} update={update} />;
    case "event-meta":
      return <EventMetaFields data={data} update={update} />;
    case "sponsors":
      return <SponsorsFields data={data} update={update} onPickImage={onPickImage} />;
    case "footer":
      return <FooterFields data={data} update={update} />;
    case "speaker-photo":
      return <SpeakerPhotoFields data={data} update={update} onPickImage={onPickImage} />;
    case "graphic":
      return <GraphicFields data={data} update={update} onPickImage={onPickImage} />;
    case "branding-asset":
      return <BrandingAssetFields data={data} update={update} onPickImage={onPickImage} />;
    case "hero-style2":
      return <HeroStyle2Fields data={data} update={update} onPickImage={onPickImage} />;
    default:
      return <NoFieldsHint selectedId={selectedId} />;
  }
}

// ----------------------------------------------------------------------------
// Field blocks
// ----------------------------------------------------------------------------

function SpeakerInfoFields({
  data,
  update,
  onPickImage,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Header + speaker name / title / company / role / topic / bio. Click
        Replace to swap the photo from the brand library.
      </p>

      <MiniField label="Header text (pink title)">
        <MiniInput
          type="text"
          value={data.header.text}
          onChange={(e) => update((d) => { d.header.text = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Header color">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={data.header.color}
            onChange={(e) => update((d) => { d.header.color = e.target.value; })}
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
          />
          <MiniInput
            type="text"
            value={data.header.color}
            onChange={(e) => update((d) => { d.header.color = e.target.value; })}
          />
        </div>
      </MiniField>

      <div className="border-t border-black/10 my-2" />

      <MiniField label="Full name">
        <MiniInput
          type="text"
          value={data.speaker.fullName}
          onChange={(e) => update((d) => { d.speaker.fullName = e.target.value; })}
        />
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Title">
          <MiniInput
            type="text"
            value={data.speaker.title}
            onChange={(e) => update((d) => { d.speaker.title = e.target.value; })}
          />
        </MiniField>
        <MiniField label="Company">
          <MiniInput
            type="text"
            value={data.speaker.company}
            onChange={(e) => update((d) => { d.speaker.company = e.target.value; })}
          />
        </MiniField>
      </div>
      <MiniField label="Role">
        <MiniSelect
          value={data.speaker.role}
          onChange={(e) =>
            update((d) => { d.speaker.role = e.target.value as SpeakerRole; })
          }
        >
          <option value="Speaker">Speaker</option>
          <option value="Moderator">Moderator</option>
          <option value="Panelist">Panelist</option>
          <option value="Host">Host</option>
        </MiniSelect>
      </MiniField>
      <MiniField label="Topic title">
        <MiniInput
          type="text"
          value={data.speaker.topic}
          onChange={(e) => update((d) => { d.speaker.topic = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Topic description">
        <MiniTextarea
          rows={2}
          value={data.speaker.topicDescription ?? ""}
          onChange={(e) =>
            update((d) => { d.speaker.topicDescription = e.target.value || undefined; })
          }
        />
      </MiniField>
      <MiniField label="Bio (main paragraph)">
        <MiniTextarea
          rows={3}
          value={data.speaker.bio}
          onChange={(e) => update((d) => { d.speaker.bio = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Expertise (optional 2nd paragraph)">
        <MiniTextarea
          rows={2}
          value={data.speaker.expertise ?? ""}
          onChange={(e) =>
            update((d) => { d.speaker.expertise = e.target.value || undefined; })
          }
        />
      </MiniField>

      <div className="border-t border-black/10 my-2" />
      <MiniField label="Photo">
        <ImagePreview src={data.speaker.photoUrl} alt={data.speaker.fullName} />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "speaker-photo" })}
            label="Replace photo"
          />
          <MiniInput
            type="url"
            value={data.speaker.photoUrl}
            placeholder="https://..."
            onChange={(e) => update((d) => { d.speaker.photoUrl = e.target.value; })}
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
            value={data.speaker.photoSize ?? 1}
            onChange={(e) =>
              update((d) => { d.speaker.photoSize = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Photo rotation (°)">
          <MiniSelect
            value={String(data.speaker.photoRotation ?? 0)}
            onChange={(e) =>
              update((d) => { d.speaker.photoRotation = parseInt(e.target.value, 10) || 0; })
            }
          >
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </MiniSelect>
        </MiniField>
      </div>
    </div>
  );
}

function HeroShapeFields({
  data,
  update,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
}) {
  // Build the HeroShapeConfig from data.style3HeroShape (with defaults).
  const config: HeroShapeConfig = {
    shape: data.style3HeroShape?.shape ?? "rectangle",
    fillMode: data.style3HeroShape?.fillMode ?? "gradient",
    solidColor: data.style3HeroShape?.solidColor ?? "#311B92",
    colors: data.style3HeroShape?.colors ?? ["#311B92", "#1A237E", "#0B0B2E"],
    direction: data.style3HeroShape?.direction ?? 180,
    opacity: data.style3HeroShape?.opacity ?? 0.9,
    rotation: data.style3HeroShape?.rotation ?? 0,
  };

  const onShapeChange = (patch: Partial<{
    shape: HeroShapeType;
    fillMode: HeroShapeFillMode;
    solidColor: string;
    colors: string[];
    direction: number;
    opacity: number;
    rotation: number;
  }>) => {
    update((d) => {
      if (!d.style3HeroShape) d.style3HeroShape = {};
      Object.assign(d.style3HeroShape, patch);
    });
  };

  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Style 3 hero shape — pick a shape type, toggle solid vs gradient fill,
        edit colors / direction / opacity / rotation.
      </p>
      <HeroShapePanelFields config={config} onChange={onShapeChange} />
    </div>
  );
}

function QrFields({
  data,
  update,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        QR code — points to the registration / RSVP page. Rendered top-right
        with a &ldquo;Register here&rdquo; caption.
      </p>
      <MiniField label="QR code URL">
        <MiniInput
          type="url"
          value={data.qrCodeUrl}
          placeholder="https://..."
          onChange={(e) => update((d) => { d.qrCodeUrl = e.target.value; })}
        />
      </MiniField>
      <MiniField label="&ldquo;Register here&rdquo; caption — font size">
        <MiniInput
          type="number"
          min="6"
          step="0.5"
          value={data.textStyles?.registerHere?.fontSize ?? 11}
          onChange={(e) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              if (!d.textStyles.registerHere) d.textStyles.registerHere = {};
              d.textStyles.registerHere.fontSize = parseFloat(e.target.value) || undefined;
            })
          }
        />
      </MiniField>
      <MiniField label="&ldquo;Register here&rdquo; caption — color">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={data.textStyles?.registerHere?.color ?? "#000000"}
            onChange={(e) =>
              update((d) => {
                if (!d.textStyles) d.textStyles = {};
                if (!d.textStyles.registerHere) d.textStyles.registerHere = {};
                d.textStyles.registerHere.color = e.target.value;
              })
            }
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
          />
          <MiniInput
            type="text"
            value={data.textStyles?.registerHere?.color ?? "#000000"}
            onChange={(e) =>
              update((d) => {
                if (!d.textStyles) d.textStyles = {};
                if (!d.textStyles.registerHere) d.textStyles.registerHere = {};
                d.textStyles.registerHere.color = e.target.value;
              })
            }
          />
        </div>
      </MiniField>
    </div>
  );
}

function EventMetaFields({
  data,
  update,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Event context — shown at the bottom-right of the canvas.
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
      <MiniField label="Footer credit">
        <MiniInput
          type="text"
          value={data.footerCredit ?? ""}
          placeholder="Optional"
          onChange={(e) => update((d) => { d.footerCredit = e.target.value || undefined; })}
        />
      </MiniField>
    </div>
  );
}

function SponsorsFields({
  data,
  update,
  onPickImage,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
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
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Footer credit text at the bottom of the canvas.
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
          value={data.textStyles?.footer?.fontSize ?? 10}
          onChange={(e) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              if (!d.textStyles.footer) d.textStyles.footer = {};
              d.textStyles.footer.fontSize = parseFloat(e.target.value) || undefined;
            })
          }
        />
      </MiniField>
    </div>
  );
}

// ----------------------------------------------------------------------------
// PER USER SPEC 2026-08-02 (TSK-0055-extend): per-image field blocks.
// Each renders a focused editor for one specific image on the canvas
// (speaker photo, graphic, branding asset, hero image, sponsor logo).
// ----------------------------------------------------------------------------

function SpeakerPhotoFields({
  data,
  update,
  onPickImage,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  const speaker = data.speaker;
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Speaker portrait photo — click <strong>Replace</strong> to swap from
        the brand library. Drag the photo on the canvas to pan; scroll to
        zoom. Drag the photo container to move it anywhere on the canvas.
      </p>
      <div className="rounded border border-black/10 bg-black/[0.02] p-2 space-y-1">
        <div className="text-[0.6rem] font-bold uppercase tracking-wider text-black/55">
          Speaker
        </div>
        <div className="text-[0.78rem] font-bold text-black truncate">
          {speaker.fullName || "Untitled"}
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
            onClick={() => onPickImage({ kind: "speaker-photo" })}
            label="Replace photo"
          />
          <MiniInput
            type="url"
            value={speaker.photoUrl}
            placeholder="https://..."
            onChange={(e) => update((d) => { d.speaker.photoUrl = e.target.value; })}
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
              update((d) => { d.speaker.photoSize = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Rotation (°)">
          <MiniSelect
            value={String(speaker.photoRotation ?? 0)}
            onChange={(e) =>
              update((d) => { d.speaker.photoRotation = parseInt(e.target.value, 10) || 0; })
            }
          >
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </MiniSelect>
        </MiniField>
      </div>
      {speaker.photoPlacement && (
        <button
          type="button"
          onClick={() =>
            update((d) => { d.speaker.photoPlacement = undefined; })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5"
        >
          Reset photo placement
        </button>
      )}
    </div>
  );
}

function GraphicFields({
  data,
  update,
  onPickImage,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  const graphic = data.graphic;
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Brand graphic (meerkat) — click <strong>Replace</strong> to swap from
        the brand library. Drag the graphic on the canvas to pan; scroll to
        zoom.
      </p>
      <MiniField label="Graphic">
        <ImagePreview src={graphic.imageUrl} alt="Brand graphic" />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "graphic" })}
            label="Replace graphic"
          />
          <MiniInput
            type="url"
            value={graphic.imageUrl}
            placeholder="https://..."
            onChange={(e) => update((d) => { d.graphic.imageUrl = e.target.value; })}
            className="flex-1"
          />
        </div>
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Scale (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={graphic.imageScale ?? 1}
            onChange={(e) =>
              update((d) => { d.graphic.imageScale = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Rotation (°)">
          <MiniSelect
            value={String(graphic.rotation ?? 0)}
            onChange={(e) =>
              update((d) => { d.graphic.rotation = parseInt(e.target.value, 10) || 0; })
            }
          >
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </MiniSelect>
        </MiniField>
      </div>
      {graphic.imagePlacement && (
        <button
          type="button"
          onClick={() =>
            update((d) => { d.graphic.imagePlacement = undefined; })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5"
        >
          Reset graphic placement
        </button>
      )}
    </div>
  );
}

function BrandingAssetFields({
  data,
  update,
  onPickImage,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  const branding = data.brandingAsset;
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Branding asset (bottom-left AI Salon wordmark). Click{" "}
        <strong>Replace</strong> to swap from the brand library.
      </p>
      <MiniField label="Branding">
        <ImagePreview
          src={
            branding?.imageUrl ||
            "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png"
          }
          alt="Branding asset"
        />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "branding-asset" })}
            label="Replace"
          />
          <MiniInput
            type="url"
            value={branding?.imageUrl ?? ""}
            placeholder="https://..."
            onChange={(e) =>
              update((d) => {
                if (!d.brandingAsset) d.brandingAsset = {};
                d.brandingAsset.imageUrl = e.target.value || undefined;
              })
            }
            className="flex-1"
          />
        </div>
      </MiniField>
      <MiniField label="Height (px)">
        <MiniInput
          type="number"
          step="1"
          min="8"
          value={branding?.height ?? 48}
          onChange={(e) =>
            update((d) => {
              if (!d.brandingAsset) d.brandingAsset = {};
              d.brandingAsset.height = parseInt(e.target.value, 10) || 48;
            })
          }
        />
      </MiniField>
      {branding?.pos && (
        <button
          type="button"
          onClick={() =>
            update((d) => {
              if (d.brandingAsset) d.brandingAsset.pos = undefined;
            })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5"
        >
          Reset position
        </button>
      )}
    </div>
  );
}

function HeroStyle2Fields({
  data,
  update,
  onPickImage,
}: {
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Hero background image (Style 2 — low-poly network graph). Click{" "}
        <strong>Replace</strong> to swap from the brand library. Drag the image
        on the canvas to pan; scroll to zoom.
      </p>
      <MiniField label="Hero image">
        <ImagePreview
          src={
            data.heroStyle2Url ||
            "https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782940769382-r2twkn.png"
          }
          alt="Hero background"
        />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "hero-style2" })}
            label="Replace hero"
          />
          <MiniInput
            type="url"
            value={data.heroStyle2Url ?? ""}
            placeholder="https://..."
            onChange={(e) =>
              update((d) => { d.heroStyle2Url = e.target.value || undefined; })
            }
            className="flex-1"
          />
        </div>
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Scale (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={data.heroStyle2Scale ?? 1}
            onChange={(e) =>
              update((d) => { d.heroStyle2Scale = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Rotation (°)">
          <MiniSelect
            value={String(data.heroStyle2Rotation ?? 0)}
            onChange={(e) =>
              update((d) => { d.heroStyle2Rotation = parseInt(e.target.value, 10) || 0; })
            }
          >
            <option value="0">0°</option>
            <option value="90">90°</option>
            <option value="180">180°</option>
            <option value="270">270°</option>
          </MiniSelect>
        </MiniField>
      </div>
      {data.heroStyle2Placement && (
        <button
          type="button"
          onClick={() =>
            update((d) => { d.heroStyle2Placement = undefined; })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5"
        >
          Reset image placement
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
  data: MeetTheSpeakerData;
  update: (recipe: (draft: MeetTheSpeakerData) => void) => void;
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

  const updateSponsor = (recipe: (s: Sponsor) => void) =>
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
      <MiniField label="Theme">
        <MiniSelect
          value={sponsor.theme ?? "dark"}
          onChange={(e) =>
            updateSponsor((s) => { s.theme = e.target.value as "light" | "dark"; })
          }
        >
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </MiniSelect>
      </MiniField>
    </div>
  );
}

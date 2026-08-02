"use client";

/**
 * AgendaProfileSelectedPanel — per-asset editor for the currently-selected
 * element on the agenda-profile canvas.
 *
 * PER USER SPEC 2026-08-02:
 *   "when clicking the specific asset we want to edit, generate a new tab
 *    on the left of the mockup, above the entire form editor, only the
 *    specific edit details of the object/asset i am editing"
 *
 * selectedId values handled (matching agenda-profile-canvas.tsx):
 *   - "header"       → hero image + presents label + event name + date/venue
 *   - "topic"        → event topic + description
 *   - "agenda"       → sessions list (time, type, title, speaker, visibility)
 *   - "speakers"     → speakers grid (name, title, photo, etc.)
 *   - "sponsors"     → collaborators + sponsors lists
 *   - "qr-branding"  → QR code URL + branding asset
 *   - "footer"       → footer credit text
 */

import { type ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EventProfileData, ImageSlot, Sponsor, Session, Speaker, SessionType } from "../agenda-profile/types";
import { sessionTypeLabel } from "../agenda-profile/types";
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
  topic: "Topic & description",
  agenda: "Agenda (sessions)",
  speakers: "Speakers grid",
  sponsors: "Sponsors & collaborators",
  "qr-branding": "QR code + branding",
  footer: "Footer",
};

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function AgendaProfileSelectedPanel({
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
  //   `speaker-image-${idx}`   — a specific speaker's photo (visible-speaker idx)
  //   `sponsor-image-${group}-${idx}` — a specific sponsor/collab logo
  //   `hero-image`         — the hero background image
  //   `branding-asset`     — the bottom-left AI Salon branding
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
          visibleIdx={idx}
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

  return (
    <SelectedElementShell label={imageLabel(selectedId)} onDeselect={onDeselect}>
      {renderBody(selectedId, data, update, onPickImage)}
    </SelectedElementShell>
  );
}

function imageLabel(selectedId: string): string {
  if (selectedId === "hero-image") return "Hero Image";
  if (selectedId === "branding-asset") return "Branding Asset";
  return ELEMENT_LABELS[selectedId] ?? selectedId;
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
    case "topic":
      return <TopicFields data={data} update={update} />;
    case "agenda":
      return <AgendaFields data={data} update={update} />;
    case "speakers":
      return <SpeakersFields data={data} update={update} onPickImage={onPickImage} />;
    case "sponsors":
      return <SponsorsFields data={data} update={update} onPickImage={onPickImage} />;
    case "qr-branding":
      return <QrBrandingFields data={data} update={update} onPickImage={onPickImage} />;
    case "footer":
      return <FooterFields data={data} update={update} />;
    case "hero-image":
      return <HeroImageFields data={data} update={update} onPickImage={onPickImage} />;
    case "branding-asset":
      return <BrandingAssetFields data={data} update={update} onPickImage={onPickImage} />;
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
        Hero block (top of canvas) — hero image, &ldquo;presents&rdquo; eyebrow,
        event name, date/venue line.
      </p>
      <MiniField label="Hero image">
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
            onChange={(e) => update((d) => { d.event.date = e.target.value; })}
          />
        </MiniField>
        <MiniField label="Time">
          <MiniInput
            type="text"
            value={data.event.time}
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
    </div>
  );
}

function TopicFields({
  data,
  update,
}: {
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Event topic + description (rendered under the hero).
      </p>
      <MiniField label="Topic">
        <MiniInput
          type="text"
          value={data.event.topic}
          onChange={(e) => update((d) => { d.event.topic = e.target.value; })}
        />
      </MiniField>
      <MiniField label="Description (optional)">
        <MiniTextarea
          rows={3}
          value={data.event.description ?? ""}
          onChange={(e) => update((d) => { d.event.description = e.target.value || undefined; })}
        />
      </MiniField>
    </div>
  );
}

function AgendaFields({
  data,
  update,
}: {
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
}) {
  const sessions = [...data.sessions].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Agenda sessions — edit time, type, title, speaker, visibility.
        Breaks / networking are auto-hidden when picked from DB.
      </p>
      {sessions.map((s, i) => {
        const idx = data.sessions.indexOf(s);
        return (
          <SessionRow
            key={`sess-${idx}`}
            session={s}
            onChange={(recipe) =>
              update((d) => { recipe(d.sessions[idx]); })
            }
            onDelete={() =>
              update((d) => { d.sessions.splice(idx, 1); })
            }
          />
        );
      })}
      <button
        type="button"
        onClick={() =>
          update((d) => {
            const nextOrder = Math.max(0, ...d.sessions.map((s) => s.order)) + 1;
            d.sessions.push({
              order: nextOrder,
              type: "OTHER",
              title: "New session",
            });
          })
        }
        className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-black/30 text-black/70 font-semibold px-2 py-1 text-[0.7rem] hover:bg-black/5"
      >
        <Plus className="h-3 w-3" /> Add session
      </button>
    </div>
  );
}

function SessionRow({
  session,
  onChange,
  onDelete,
}: {
  session: Session;
  onChange: (recipe: (draft: Session) => void) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded border border-black/15 bg-white p-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <span className="text-[0.6rem] font-bold text-black/50 shrink-0">#{session.order}</span>
        <MiniInput
          type="text"
          value={session.title}
          placeholder="Title"
          onChange={(e) => onChange((s) => { s.title = e.target.value; })}
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
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Start">
          <MiniInput
            type="text"
            value={session.startTime ?? ""}
            placeholder="18:30"
            onChange={(e) => onChange((s) => { s.startTime = e.target.value || undefined; })}
          />
        </MiniField>
        <MiniField label="End">
          <MiniInput
            type="text"
            value={session.endTime ?? ""}
            placeholder="19:00"
            onChange={(e) => onChange((s) => { s.endTime = e.target.value || undefined; })}
          />
        </MiniField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Type">
          <MiniSelect
            value={session.type}
            onChange={(e) =>
              onChange((s) => { s.type = e.target.value as SessionType; })
            }
          >
            {(["WELCOME", "TALK", "PANEL", "FAST_PITCH", "BREAK", "NETWORKING", "CHECKIN", "OTHER"] as SessionType[]).map((t) => (
              <option key={t} value={t}>{sessionTypeLabel(t)}</option>
            ))}
          </MiniSelect>
        </MiniField>
        <MiniField label="Visible">
          <MiniSelect
            value={session.visible === false ? "false" : "true"}
            onChange={(e) => onChange((s) => { s.visible = e.target.value === "true"; })}
          >
            <option value="true">Yes</option>
            <option value="false">No (hidden)</option>
          </MiniSelect>
        </MiniField>
      </div>
      <MiniField label="Speaker name (optional)">
        <MiniInput
          type="text"
          value={session.speakerName ?? ""}
          onChange={(e) => onChange((s) => { s.speakerName = e.target.value || undefined; })}
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
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  const speakers = [...data.speakers].sort((a, b) => a.order - b.order);
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Speakers grid — edit names, titles, photos, bios, visibility.
      </p>
      {speakers.map((sp) => {
        const idx = data.speakers.indexOf(sp);
        return (
          <SpeakerRow
            key={`sp-${idx}`}
            speaker={sp}
            onReplacePhoto={() => onPickImage({ kind: "speaker", index: idx })}
            onChange={(recipe) =>
              update((d) => { recipe(d.speakers[idx]); })
            }
            onDelete={() =>
              update((d) => { d.speakers.splice(idx, 1); })
            }
          />
        );
      })}
      <button
        type="button"
        onClick={() =>
          update((d) => {
            const nextOrder = Math.max(0, ...d.speakers.map((s) => s.order)) + 1;
            d.speakers.push({
              order: nextOrder,
              fullName: "New Speaker",
              title: "",
              company: "",
              photoUrl: "",
            });
          })
        }
        className="w-full inline-flex items-center justify-center gap-1 rounded border border-dashed border-black/30 text-black/70 font-semibold px-2 py-1 text-[0.7rem] hover:bg-black/5"
      >
        <Plus className="h-3 w-3" /> Add speaker
      </button>
    </div>
  );
}

function SpeakerRow({
  speaker,
  onReplacePhoto,
  onChange,
  onDelete,
}: {
  speaker: Speaker;
  onReplacePhoto: () => void;
  onChange: (recipe: (draft: Speaker) => void) => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded border border-black/15 bg-white p-2 space-y-1.5">
      <div className="flex items-center gap-1">
        <MiniInput
          type="text"
          value={speaker.fullName}
          placeholder="Full name"
          onChange={(e) => onChange((s) => { s.fullName = e.target.value; })}
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
      <div className="grid grid-cols-2 gap-2">
        <MiniInput
          type="text"
          value={speaker.title}
          placeholder="Title"
          onChange={(e) => onChange((s) => { s.title = e.target.value; })}
        />
        <MiniInput
          type="text"
          value={speaker.company}
          placeholder="Company"
          onChange={(e) => onChange((s) => { s.company = e.target.value; })}
        />
      </div>
      <ImagePreview src={speaker.photoUrl} alt={speaker.fullName} />
      <div className="flex items-center gap-1">
        <ReplaceButton onClick={onReplacePhoto} label="Photo" />
        <MiniInput
          type="url"
          value={speaker.photoUrl}
          placeholder="https://..."
          onChange={(e) => onChange((s) => { s.photoUrl = e.target.value; })}
          className="flex-1"
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Session time">
          <MiniInput
            type="text"
            value={speaker.sessionTime ?? ""}
            placeholder="18:30"
            onChange={(e) => onChange((s) => { s.sessionTime = e.target.value || undefined; })}
          />
        </MiniField>
        <MiniField label="Visible">
          <MiniSelect
            value={speaker.visible === false ? "false" : "true"}
            onChange={(e) => onChange((s) => { s.visible = e.target.value === "true"; })}
          >
            <option value="true">Yes</option>
            <option value="false">No (hidden)</option>
          </MiniSelect>
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
        Collaborators + sponsors logos at the bottom.
      </p>
      <SponsorList
        title="Collaborators"
        list={data.collaborators}
        group="collaborators"
        onPickImage={onPickImage}
        onChange={(recipe) => update((d) => { recipe(d.collaborators); })}
      />
      <SponsorList
        title="Sponsors"
        list={data.sponsors}
        group="sponsors"
        onPickImage={onPickImage}
        onChange={(recipe) => update((d) => { recipe(d.sponsors); })}
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
    </div>
  );
}

function QrBrandingFields({
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
        QR code (RSVP) + branding asset (bottom-left).
      </p>
      <MiniField label="QR code URL">
        <MiniInput
          type="url"
          value={data.qrCodeUrl}
          placeholder="https://..."
          onChange={(e) => update((d) => { d.qrCodeUrl = e.target.value; })}
        />
      </MiniField>
      <div className="border-t border-black/10 my-2" />
      <MiniField label="Branding asset image">
        <ImagePreview
          src={data.brandingAsset?.imageUrl ?? ""}
          alt="Branding"
        />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "branding-asset" })}
            label="Replace"
          />
          <MiniInput
            type="url"
            value={data.brandingAsset?.imageUrl ?? ""}
            placeholder="https://..."
            onChange={(e) =>
              update((d) => {
                if (!d.brandingAsset) d.brandingAsset = {};
                d.brandingAsset.imageUrl = e.target.value;
              })
            }
            className="flex-1"
          />
        </div>
      </MiniField>
      <MiniField label="Branding height (px)">
        <MiniInput
          type="number"
          min="12"
          step="2"
          value={data.brandingAsset?.height ?? 48}
          onChange={(e) =>
            update((d) => {
              if (!d.brandingAsset) d.brandingAsset = {};
              d.brandingAsset.height = parseInt(e.target.value, 10) || 48;
            })
          }
        />
      </MiniField>
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
    </div>
  );
}

// ----------------------------------------------------------------------------
// PER USER SPEC 2026-08-02 (TSK-0055-extend): per-image field blocks.
// Each renders a focused editor for one specific image on the canvas
// (hero image, speaker photo, branding asset, sponsor logo).
// ----------------------------------------------------------------------------

function HeroImageFields({
  data,
  update,
  onPickImage,
}: {
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
}) {
  const hero = data.heroOverlay;
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Hero background image — click <strong>Replace</strong> to swap from
        the brand library. Drag the image on the canvas to pan; scroll to
        zoom.
      </p>
      <MiniField label="Hero image">
        <ImagePreview src={hero.imageUrl} alt="Hero" />
        <div className="flex items-center gap-1.5 mt-1">
          <ReplaceButton
            onClick={() => onPickImage({ kind: "hero" })}
            label="Replace hero"
          />
          <MiniInput
            type="url"
            value={hero.imageUrl}
            placeholder="https://..."
            onChange={(e) => update((d) => { d.heroOverlay.imageUrl = e.target.value; })}
            className="flex-1"
          />
        </div>
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Scale X (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={hero.imageScale ?? 1}
            onChange={(e) =>
              update((d) => { d.heroOverlay.imageScale = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
        <MiniField label="Scale Y (×)">
          <MiniInput
            type="number"
            step="0.1"
            min="0.1"
            value={hero.imageScaleY ?? 1}
            onChange={(e) =>
              update((d) => { d.heroOverlay.imageScaleY = parseFloat(e.target.value) || 1; })
            }
          />
        </MiniField>
      </div>
      <MiniField label="Gradient opacity">
        <MiniInput
          type="number"
          step="0.05"
          min="0"
          max="1"
          value={hero.gradientOpacity}
          onChange={(e) =>
            update((d) => {
              d.heroOverlay.gradientOpacity = parseFloat(e.target.value) || 0;
            })
          }
        />
      </MiniField>
      {hero.imagePlacement && (
        <button
          type="button"
          onClick={() =>
            update((d) => { d.heroOverlay.imagePlacement = undefined; })
          }
          className="w-full rounded border border-black/15 bg-white px-2 py-1 text-[0.7rem] text-black/80 hover:bg-black/5"
        >
          Reset image placement
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
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
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

function SpeakerImageFields({
  data,
  update,
  onPickImage,
  visibleIdx,
}: {
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
  onPickImage: (slot: ImageSlot) => void;
  /** Position of this speaker in the VISIBLE (visible !== false) array —
   *  matches the index the canvas passes to slot.kind === "speaker". */
  visibleIdx: number;
}) {
  // The canvas filters speakers by `visible !== false` before indexing —
  // replicate that here so the index matches the photo the user clicked.
  const visibleSpeakers = data.speakers.filter((s) => s.visible !== false);
  const speaker = visibleSpeakers[visibleIdx];
  // Find the original (unfiltered) index so update recipes target the
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
            onClick={() => onPickImage({ kind: "speaker", index: visibleIdx })}
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
  data: EventProfileData;
  update: (recipe: (draft: EventProfileData) => void) => void;
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

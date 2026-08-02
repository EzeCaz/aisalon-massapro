"use client";

/**
 * QrSalonSelectedPanel — per-asset editor for the currently-selected
 * element on the qr-salon canvas.
 *
 * PER USER SPEC 2026-08-02:
 *   "when clicking the specific asset we want to edit, generate a new tab
 *    on the left of the mockup, above the entire form editor, only the
 *    specific edit details of the object/asset i am editing"
 *
 * selectedId values handled (matching qr-salon-canvas.tsx):
 *   - "qr"       → QR code URL + size + colors + margin
 *   - "caption"  → caption text + font size + color + align + weight
 *   - "branding" → branding asset image + height + position
 */

import { type ReactNode } from "react";
import type { QrSalonData, QrSalonSectionId } from "../qr-salon/types";
import { DEFAULT_BRANDING_ASSET_URL } from "../qr-salon/types";
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
  data: QrSalonData;
  onChange: (next: QrSalonData) => void;
  onPickBranding: () => void;
  onDeselect: () => void;
};

const ELEMENT_LABELS: Record<string, string> = {
  qr: "QR Code",
  caption: "Caption text",
  branding: "Branding asset",
};

// ----------------------------------------------------------------------------
// Main component
// ----------------------------------------------------------------------------
export function QrSalonSelectedPanel({
  selectedId,
  data,
  onChange,
  onPickBranding,
  onDeselect,
}: Props) {
  const update = useUpdate(data, onChange);

  if (!selectedId) return null;
  const label = ELEMENT_LABELS[selectedId] ?? selectedId;

  return (
    <SelectedElementShell label={label} onDeselect={onDeselect}>
      {renderBody(selectedId as QrSalonSectionId, data, update, onPickBranding)}
    </SelectedElementShell>
  );
}

// ----------------------------------------------------------------------------
// Body router
// ----------------------------------------------------------------------------
function renderBody(
  selectedId: QrSalonSectionId,
  data: QrSalonData,
  update: (recipe: (draft: QrSalonData) => void) => void,
  onPickBranding: () => void,
): ReactNode {
  switch (selectedId) {
    case "qr":
      return <QrFields data={data} update={update} />;
    case "caption":
      return <CaptionFields data={data} update={update} />;
    case "branding":
      return <BrandingFields data={data} update={update} onPickBranding={onPickBranding} />;
    default:
      return <NoFieldsHint selectedId={selectedId} />;
  }
}

// ----------------------------------------------------------------------------
// Field blocks
// ----------------------------------------------------------------------------

function QrFields({
  data,
  update,
}: {
  data: QrSalonData;
  update: (recipe: (draft: QrSalonData) => void) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        QR code — encodes the URL and renders as a black-on-white square in
        the center of the canvas.
      </p>
      <MiniField label="QR code URL">
        <MiniInput
          type="url"
          value={data.qrCodeUrl}
          placeholder="https://..."
          onChange={(e) => update((d) => { d.qrCodeUrl = e.target.value; })}
        />
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Size (px)">
          <MiniInput
            type="number"
            min="60"
            step="10"
            value={data.qrSize ?? 360}
            onChange={(e) =>
              update((d) => { d.qrSize = parseInt(e.target.value, 10) || 360; })
            }
          />
        </MiniField>
        <MiniField label="Margin">
          <MiniInput
            type="number"
            min="0"
            max="10"
            step="1"
            value={data.qrMargin ?? 2}
            onChange={(e) =>
              update((d) => { d.qrMargin = parseInt(e.target.value, 10) || 0; })
            }
          />
        </MiniField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Dark color">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={data.qrDarkColor ?? "#000000"}
              onChange={(e) => update((d) => { d.qrDarkColor = e.target.value; })}
              className="h-7 w-9 rounded border border-black/15 cursor-pointer"
            />
            <MiniInput
              type="text"
              value={data.qrDarkColor ?? "#000000"}
              onChange={(e) => update((d) => { d.qrDarkColor = e.target.value; })}
            />
          </div>
        </MiniField>
        <MiniField label="Light color">
          <div className="flex items-center gap-1.5">
            <input
              type="color"
              value={data.qrLightColor ?? "#FFFFFF"}
              onChange={(e) => update((d) => { d.qrLightColor = e.target.value; })}
              className="h-7 w-9 rounded border border-black/15 cursor-pointer"
            />
            <MiniInput
              type="text"
              value={data.qrLightColor ?? "#FFFFFF"}
              onChange={(e) => update((d) => { d.qrLightColor = e.target.value; })}
            />
          </div>
        </MiniField>
      </div>
      <MiniField label="Background (canvas)">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={data.background ?? "#FFFFFF"}
            onChange={(e) => update((d) => { d.background = e.target.value; })}
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
          />
          <MiniInput
            type="text"
            value={data.background ?? "#FFFFFF"}
            onChange={(e) => update((d) => { d.background = e.target.value; })}
          />
        </div>
      </MiniField>
    </div>
  );
}

function CaptionFields({
  data,
  update,
}: {
  data: QrSalonData;
  update: (recipe: (draft: QrSalonData) => void) => void;
}) {
  const style = data.caption.style ?? {};
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Caption text rendered above the QR code. Multi-line supported via
        newlines.
      </p>
      <MiniField label="Caption text">
        <MiniTextarea
          rows={3}
          value={data.caption.text}
          placeholder={"Scan to register\non the event page"}
          onChange={(e) => update((d) => { d.caption.text = e.target.value; })}
        />
      </MiniField>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Font size (px)">
          <MiniInput
            type="number"
            min="8"
            step="0.5"
            value={style.fontSize ?? 28}
            onChange={(e) =>
              update((d) => {
                if (!d.caption.style) d.caption.style = {};
                d.caption.style.fontSize = parseFloat(e.target.value) || undefined;
              })
            }
          />
        </MiniField>
        <MiniField label="Font weight">
          <MiniSelect
            value={style.fontWeight ?? "700"}
            onChange={(e) =>
              update((d) => {
                if (!d.caption.style) d.caption.style = {};
                d.caption.style.fontWeight = e.target.value;
              })
            }
          >
            <option value="400">Regular (400)</option>
            <option value="500">Medium (500)</option>
            <option value="600">Semibold (600)</option>
            <option value="700">Bold (700)</option>
            <option value="800">Extrabold (800)</option>
            <option value="900">Black (900)</option>
          </MiniSelect>
        </MiniField>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <MiniField label="Align">
          <MiniSelect
            value={style.align ?? "center"}
            onChange={(e) =>
              update((d) => {
                if (!d.caption.style) d.caption.style = {};
                d.caption.style.align = e.target.value as "left" | "center" | "right";
              })
            }
          >
            <option value="left">Left</option>
            <option value="center">Center</option>
            <option value="right">Right</option>
          </MiniSelect>
        </MiniField>
        <MiniField label="Caption width (%)">
          <MiniInput
            type="number"
            min="20"
            max="100"
            step="5"
            value={data.captionWidthPct ?? 80}
            onChange={(e) =>
              update((d) => {
                d.captionWidthPct = parseInt(e.target.value, 10) || 80;
              })
            }
          />
        </MiniField>
      </div>
      <MiniField label="Color">
        <div className="flex items-center gap-1.5">
          <input
            type="color"
            value={style.color ?? "#000000"}
            onChange={(e) =>
              update((d) => {
                if (!d.caption.style) d.caption.style = {};
                d.caption.style.color = e.target.value;
              })
            }
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
          />
          <MiniInput
            type="text"
            value={style.color ?? "#000000"}
            onChange={(e) =>
              update((d) => {
                if (!d.caption.style) d.caption.style = {};
                d.caption.style.color = e.target.value;
              })
            }
          />
        </div>
      </MiniField>
    </div>
  );
}

function BrandingFields({
  data,
  update,
  onPickBranding,
}: {
  data: QrSalonData;
  update: (recipe: (draft: QrSalonData) => void) => void;
  onPickBranding: () => void;
}) {
  const imageUrl = data.brandingAsset.imageUrl || DEFAULT_BRANDING_ASSET_URL;
  return (
    <div className="space-y-2">
      <p className="text-[0.62rem] text-black/55 leading-snug">
        Branding asset — small AI Salon logo below the QR code. Click
        Replace to swap from the brand library.
      </p>
      <ImagePreview src={imageUrl} alt="Branding" />
      <div className="flex items-center gap-1.5">
        <ReplaceButton onClick={onPickBranding} label="Replace" />
        <MiniInput
          type="url"
          value={data.brandingAsset.imageUrl ?? ""}
          placeholder={DEFAULT_BRANDING_ASSET_URL}
          onChange={(e) =>
            update((d) => { d.brandingAsset.imageUrl = e.target.value; })
          }
          className="flex-1"
        />
      </div>
      <MiniField label="Height (px)">
        <MiniInput
          type="number"
          min="12"
          step="2"
          value={data.brandingAsset.height ?? 48}
          onChange={(e) =>
            update((d) => {
              d.brandingAsset.height = parseInt(e.target.value, 10) || 48;
            })
          }
        />
      </MiniField>
    </div>
  );
}

"use client";

import { useCallback } from "react";
import { Plus, RotateCw, Trash2 } from "lucide-react";
import type { MeetTheSpeakerData } from "../meet-the-speaker/types";
import { GradientColorPicker } from "./gradient-color-picker";

/**
 * MeetTheSpeakerFormView — structured form view of MeetTheSpeakerData.
 *
 * Same pattern as SpeakerIntroFormView — every field rendered as a
 * labeled input, grouped by section. Toggle between this and the raw
 * JSON editor in the toolbar.
 */
type Props = {
  data: MeetTheSpeakerData;
  onChange: (next: MeetTheSpeakerData) => void;
};

export function MeetTheSpeakerFormView({ data, onChange }: Props) {
  const update = useCallback(
    (recipe: (draft: MeetTheSpeakerData) => void) => {
      const next: MeetTheSpeakerData = JSON.parse(JSON.stringify(data));
      recipe(next);
      onChange(next);
    },
    [data, onChange],
  );

  return (
    <div className="space-y-5 p-4 bg-white text-black max-h-[640px] overflow-y-auto text-sm">
      {/* ===== HEADER ===== */}
      <Section title="Header">
        <Field label="Header text">
          <input
            type="text"
            value={data.header.text}
            onChange={(e) => update((d) => { d.header.text = e.target.value; })}
            className="form-input"
          />
        </Field>
        <Field label="Header color">
          <ColorInput
            value={data.header.color}
            onChange={(v) => update((d) => { d.header.color = v; })}
          />
        </Field>
      </Section>

      {/* ===== SPEAKER — SECTION 1: IDENTITY =====
          Per user spec 2026-07-02: "Separate the sections as follows:
            Section 1: Full name, Title, Company, Role
            Section 2: Topic, Topic description, Bio, Expertise"
          Each text field gets its own Font size + Color controls (spec B). */}
      <Section title="Speaker · Section 1 — Identity (Full name · Title · Company · Role)">
        <Field label="Full name">
          <input
            type="text"
            value={data.speaker.fullName}
            onChange={(e) => update((d) => { d.speaker.fullName = e.target.value; })}
            className="form-input"
          />
        </Field>
        <TextStyleRow
          label="Full name — font size + color"
          fontSize={data.textStyles?.fullName?.fontSize}
          fontColor={data.textStyles?.fullName?.color}
          defaultFontSize={56}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.fullName = {
                ...(d.textStyles.fullName ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <input
              type="text"
              value={data.speaker.title}
              onChange={(e) => update((d) => { d.speaker.title = e.target.value; })}
              className="form-input"
            />
          </Field>
          <Field label="Company">
            <input
              type="text"
              value={data.speaker.company}
              onChange={(e) => update((d) => { d.speaker.company = e.target.value; })}
              className="form-input"
            />
          </Field>
        </div>
        <TextStyleRow
          label="Title — font size + color"
          fontSize={data.textStyles?.title?.fontSize}
          fontColor={data.textStyles?.title?.color}
          defaultFontSize={18}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.title = {
                ...(d.textStyles.title ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <TextStyleRow
          label="Company — font size + color"
          fontSize={data.textStyles?.company?.fontSize}
          fontColor={data.textStyles?.company?.color}
          defaultFontSize={16}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.company = {
                ...(d.textStyles.company ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <Field label="Role">
          <select
            value={data.speaker.role}
            onChange={(e) =>
              update((d) => {
                d.speaker.role = e.target.value as MeetTheSpeakerData["speaker"]["role"];
              })
            }
            className="form-input"
          >
            <option value="Speaker">Speaker</option>
            <option value="Moderator">Moderator</option>
            <option value="Panelist">Panelist</option>
            <option value="Host">Host</option>
          </select>
        </Field>
        <TextStyleRow
          label="Role — font size + color"
          fontSize={data.textStyles?.role?.fontSize}
          fontColor={data.textStyles?.role?.color}
          defaultFontSize={11}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.role = {
                ...(d.textStyles.role ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
      </Section>

      {/* ===== SPEAKER — SECTION 2: TOPIC + BIO ===== */}
      <Section title="Speaker · Section 2 — Topic & Bio (Topic · Topic description · Bio · Expertise)">
        <Field label="Topic">
          <input
            type="text"
            value={data.speaker.topic}
            onChange={(e) => update((d) => { d.speaker.topic = e.target.value; })}
            className="form-input"
          />
        </Field>
        <TextStyleRow
          label="Topic — font size + color"
          fontSize={data.textStyles?.topic?.fontSize}
          fontColor={data.textStyles?.topic?.color}
          defaultFontSize={20}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.topic = {
                ...(d.textStyles.topic ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <Field label="Topic description">
          <input
            type="text"
            value={data.speaker.topicDescription ?? ""}
            onChange={(e) => update((d) => { d.speaker.topicDescription = e.target.value || undefined; })}
            className="form-input"
          />
        </Field>
        <TextStyleRow
          label="Topic description — font size + color"
          fontSize={data.textStyles?.topicDescription?.fontSize}
          fontColor={data.textStyles?.topicDescription?.color}
          defaultFontSize={15}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.topicDescription = {
                ...(d.textStyles.topicDescription ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <Field label="Bio">
          <textarea
            value={data.speaker.bio}
            onChange={(e) => update((d) => { d.speaker.bio = e.target.value; })}
            className="form-input min-h-[80px] resize-y"
            rows={3}
          />
        </Field>
        <TextStyleRow
          label="Bio — font size + color"
          fontSize={data.textStyles?.bio?.fontSize}
          fontColor={data.textStyles?.bio?.color}
          defaultFontSize={13}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.bio = {
                ...(d.textStyles.bio ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <Field label="Expertise (optional second paragraph)">
          <textarea
            value={data.speaker.expertise ?? ""}
            onChange={(e) => update((d) => { d.speaker.expertise = e.target.value || undefined; })}
            className="form-input min-h-[60px] resize-y"
            rows={2}
          />
        </Field>
        <TextStyleRow
          label="Expertise — font size + color"
          fontSize={data.textStyles?.expertise?.fontSize}
          fontColor={data.textStyles?.expertise?.color}
          defaultFontSize={12}
          onChange={(fontSize, fontColor) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.expertise = {
                ...(d.textStyles.expertise ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
              };
            })
          }
        />
        <Field label="Photo URL">
          <input
            type="url"
            value={data.speaker.photoUrl}
            onChange={(e) => update((d) => { d.speaker.photoUrl = e.target.value; })}
            className="form-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Photo size (×)">
            <input
              type="number"
              step="0.1"
              min="0.01"
              value={data.speaker.photoSize ?? 1}
              onChange={(e) =>
                update((d) => {
                  d.speaker.photoSize = parseFloat(e.target.value) || 1;
                })
              }
              className="form-input"
            />
          </Field>
          <Field label="Photo position (X%, Y%) — free drag on canvas">
            <div className="grid grid-cols-2 gap-1">
              <input
                type="number"
                step="0.5"
                placeholder="auto"
                value={data.speaker.photoPos?.x ?? ""}
                onChange={(e) =>
                  update((d) => {
                    const n = parseFloat(e.target.value);
                    if (Number.isFinite(n)) {
                      d.speaker.photoPos = { ...(d.speaker.photoPos ?? { x: 50, y: 5 }), x: n };
                    } else {
                      d.speaker.photoPos = undefined;
                    }
                  })
                }
                className="form-input"
              />
              <input
                type="number"
                step="0.5"
                placeholder="auto"
                value={data.speaker.photoPos?.y ?? ""}
                onChange={(e) =>
                  update((d) => {
                    const n = parseFloat(e.target.value);
                    if (Number.isFinite(n)) {
                      d.speaker.photoPos = { ...(d.speaker.photoPos ?? { x: 50, y: 5 }), y: n };
                    } else {
                      d.speaker.photoPos = undefined;
                    }
                  })
                }
                className="form-input"
              />
            </div>
          </Field>
        </div>
        <p className="text-[0.55rem] text-black/40 leading-tight">
          Tip: Toggle <strong>Edit images</strong> on the canvas and drag the
          &ldquo;⠿ Move&rdquo; handle on the photo to reposition it freely —
          the photo can move anywhere on the canvas. Use the X/Y inputs here
          for precise adjustments; clear them to restore the default
          top-right anchor.
        </p>
      </Section>

      {/* ===== EVENT ===== */}
      <Section title="Event context">
        <Field label="Event name">
          <input
            type="text"
            value={data.event.name}
            onChange={(e) => update((d) => { d.event.name = e.target.value; })}
            className="form-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <input
              type="text"
              value={data.event.date}
              onChange={(e) => update((d) => { d.event.date = e.target.value; })}
              className="form-input"
            />
          </Field>
          <Field label="Time">
            <input
              type="text"
              value={data.event.time}
              onChange={(e) => update((d) => { d.event.time = e.target.value; })}
              className="form-input"
            />
          </Field>
        </div>
        <Field label="Venue">
          <input
            type="text"
            value={data.event.venue}
            onChange={(e) => update((d) => { d.event.venue = e.target.value; })}
            className="form-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Brand color 1">
            <ColorInput
              value={data.event.brandColors[0]}
              onChange={(v) => update((d) => { d.event.brandColors[0] = v; })}
            />
          </Field>
          <Field label="Brand color 2">
            <ColorInput
              value={data.event.brandColors[1]}
              onChange={(v) => update((d) => { d.event.brandColors[1] = v; })}
            />
          </Field>
        </div>
        <Field label="QR code URL">
          <input
            type="url"
            value={data.qrCodeUrl}
            onChange={(e) => update((d) => { d.qrCodeUrl = e.target.value; })}
            className="form-input"
          />
        </Field>
        <Field label="Footer credit">
          <input
            type="text"
            value={data.footerCredit ?? ""}
            onChange={(e) => update((d) => { d.footerCredit = e.target.value || undefined; })}
            className="form-input"
          />
        </Field>
      </Section>

      {/* ===== GRAPHIC (meerkat) ===== */}
      <Section title="Meerkat / brand graphic">
        <Field label="Image URL">
          <input
            type="url"
            value={data.graphic.imageUrl}
            onChange={(e) => update((d) => { d.graphic.imageUrl = e.target.value; })}
            className="form-input"
          />
        </Field>
        <Field label="Image scale (×)">
          <input
            type="number"
            step="0.1"
            min="0.01"
            value={data.graphic.imageScale ?? 1}
            onChange={(e) =>
              update((d) => {
                d.graphic.imageScale = parseFloat(e.target.value) || 1;
              })
            }
            className="form-input"
          />
        </Field>
      </Section>

      {/* ===== HERO OVERLAY ===== */}
      <Section title="Hero overlay (gradient)">
        {/* ===== HERO STYLE PICKER =====
            Per user spec 2026-07-02: "ad another hero image alternative,
            and add it a style Number 2". Style 1 = geometric gradient
            triangles (default). Style 2 = pre-designed low-poly network
            graph image with 4 editable "Local Street" pins. */}
        <Field label="Hero style">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => update((d) => { d.heroStyle = 1; })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs font-semibold transition-colors ${
                (data.heroStyle ?? 1) === 1
                  ? "border-[#FF005A] bg-[#FF005A]/10 text-[#FF005A]"
                  : "border-black/15 bg-white text-black/70 hover:bg-black/5"
              }`}
            >
              Style 1 — Gradient triangles
            </button>
            <button
              type="button"
              onClick={() => update((d) => { d.heroStyle = 2; })}
              className={`flex-1 rounded border px-2 py-1.5 text-xs font-semibold transition-colors ${
                data.heroStyle === 2
                  ? "border-[#FF005A] bg-[#FF005A]/10 text-[#FF005A]"
                  : "border-black/15 bg-white text-black/70 hover:bg-black/5"
              }`}
            >
              Style 2 — Network image
            </button>
          </div>
        </Field>

        {/* Style 2 image URL — only shown when Style 2 is selected. */}
        {data.heroStyle === 2 && (
          <Field label="Style 2 image URL">
            <input
              type="text"
              value={data.heroStyle2Url ?? ""}
              onChange={(e) => update((d) => { d.heroStyle2Url = e.target.value; })}
              className="form-input"
              placeholder="https://..."
            />
          </Field>
        )}

        {/* ===== LOCAL STREET PINS (Style 2 only) =====
            Per user spec 2026-07-02: "the placeholder 1,2,3,4 please
            make them editable as the location pins, and call them
            Local Street". Mirrors the location pin editor pattern in
            speaker-intro / event-profile. */}
        {data.heroStyle === 2 && (
          <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="text-[0.65rem] font-bold uppercase tracking-wider text-black/50">
                Local Street pins (4)
              </div>
              <button
                type="button"
                onClick={() =>
                  update((d) => {
                    d.localStreetPins = [
                      { x: 18, y: 22, label: "Local Street 1" },
                      { x: 82, y: 18, label: "Local Street 2" },
                      { x: 85, y: 78, label: "Local Street 3" },
                      { x: 15, y: 80, label: "Local Street 4" },
                    ];
                  })
                }
                className="text-[0.55rem] text-black/50 hover:text-black underline"
              >
                Reset to defaults
              </button>
            </div>
            {(data.localStreetPins ?? []).map((pin, i) => (
              <div key={i} className="rounded border border-black/10 bg-white p-2 space-y-1.5">
                <div className="text-[0.6rem] font-semibold text-black/70">
                  Pin #{i + 1}
                </div>
                <Field label="Label">
                  <input
                    type="text"
                    value={pin.label}
                    onChange={(e) =>
                      update((d) => {
                        if (!d.localStreetPins) return;
                        d.localStreetPins[i] = { ...d.localStreetPins[i], label: e.target.value };
                      })
                    }
                    className="form-input"
                  />
                </Field>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="X (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(pin.x)}
                      onChange={(e) =>
                        update((d) => {
                          if (!d.localStreetPins) return;
                          d.localStreetPins[i] = { ...d.localStreetPins[i], x: parseFloat(e.target.value) || 0 };
                        })
                      }
                      className="form-input"
                    />
                  </Field>
                  <Field label="Y (%)">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="1"
                      value={Math.round(pin.y)}
                      onChange={(e) =>
                        update((d) => {
                          if (!d.localStreetPins) return;
                          d.localStreetPins[i] = { ...d.localStreetPins[i], y: parseFloat(e.target.value) || 0 };
                        })
                      }
                      className="form-input"
                    />
                  </Field>
                </div>
              </div>
            ))}
            <p className="text-[0.55rem] text-black/40 leading-tight">
              The 4 pins overlay the "Placeholder 1–4" labels baked into
              the Style 2 image. Edit the label to rename (e.g. "Sarona",
              "Yafo") or adjust X/Y % to reposition.
            </p>
          </div>
        )}

        {/* Style 1 controls — only shown when Style 1 (or unset) is selected. */}
        {(data.heroStyle ?? 1) === 1 && (
          <>
        <Field label="Gradient colors (comma-separated)">
          <GradientColorPicker
            colors={data.heroOverlay.gradientColors}
            onChange={(next) =>
              update((d) => {
                d.heroOverlay.gradientColors = next;
              })
            }
          />
        </Field>
        <Field label="Gradient opacity">
          <input
            type="number"
            step="0.05"
            min="0"
            max="1"
            value={data.heroOverlay.gradientOpacity}
            onChange={(e) =>
              update((d) => {
                d.heroOverlay.gradientOpacity = parseFloat(e.target.value) || 0;
              })
            }
            className="form-input"
          />
        </Field>
          </>
        )}

        {/* ===== LAYER Z-INDEX + ROTATE CONTROLS — shown for BOTH styles =====
            Per user spec 2026-06-28: "Move all 'Capabilities' controls
            (toggles, inputs, visibility settings) from the canvas slider
            to the Left Sidebar for all mockup pages."
            Default z-order: heroZ=1 (back), photoZ=3 (front), graphicZ=4 (top).
            Front/Back buttons override dynamically.

            Per user spec 2026-06-30: "to the Layer z-index (Front = on top)
            below the front button add a rotate button for all the creatives,
            Hero (z=5), Photo (z=3), and Graphic (z=4)" — each creative gets
            a Rotate button that advances by 90° (0 → 90 → 180 → 270 → 0).

            Per user spec 2026-07-02: this section is now shown for BOTH
            Style 1 and Style 2 (previously it was hidden when Style 2 was
            selected). For Style 2, the Hero rotate button cycles the
            `heroStyle2Rotation` field instead of `heroOverlay.rotation`. */}
        <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 space-y-2">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-black/50">
            Layer z-index (Front = on top) — applies to both styles
          </div>
          <div className="grid grid-cols-3 gap-2">
            {([
              { key: "hero", label: "Hero", zVal: data.heroZ ?? 1, rot: data.heroStyle === 2 ? (data.heroStyle2Rotation ?? 0) : (data.heroOverlay.rotation ?? 0) },
              { key: "photo", label: "Photo", zVal: data.photoZ ?? 3, rot: data.speaker.photoRotation ?? 0 },
              { key: "graphic", label: "Graphic", zVal: data.graphicZ ?? 4, rot: data.graphic.rotation ?? 0 },
            ] as const).map((layer) => (
              <div key={layer.key}>
                <div className="text-[0.6rem] text-black/60 mb-1">
                  {layer.label} (z={layer.zVal})
                </div>
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    onClick={() =>
                      update((d) => {
                        const peers = [
                          d.heroZ ?? 1,
                          d.photoZ ?? 3,
                          d.graphicZ ?? 4,
                        ];
                        const max = Math.max(...peers);
                        if (layer.key === "hero") d.heroZ = max + 1;
                        else if (layer.key === "photo") d.photoZ = max + 1;
                        else d.graphicZ = max + 1;
                      })
                    }
                    className="flex-1 rounded border border-black/15 bg-white px-1 py-1 text-[0.55rem] font-semibold text-black hover:bg-black/5"
                    title={`Bring ${layer.label} to front`}
                  >
                    Front
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      update((d) => {
                        const peers = [
                          d.heroZ ?? 1,
                          d.photoZ ?? 3,
                          d.graphicZ ?? 4,
                        ];
                        const min = Math.min(...peers);
                        if (layer.key === "hero") d.heroZ = min - 1;
                        else if (layer.key === "photo") d.photoZ = min - 1;
                        else d.graphicZ = min - 1;
                      })
                    }
                    className="flex-1 rounded border border-black/15 bg-white px-1 py-1 text-[0.55rem] font-semibold text-black hover:bg-black/5"
                    title={`Send ${layer.label} to back`}
                  >
                    Back
                  </button>
                </div>
                {/* Rotate button — advances by 90° on each click.
                    For Style 2, the Hero rotate button cycles
                    `heroStyle2Rotation` instead of `heroOverlay.rotation`. */}
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      const next = (layer.rot + 90) % 360;
                      if (layer.key === "hero") {
                        if (d.heroStyle === 2) d.heroStyle2Rotation = next;
                        else d.heroOverlay.rotation = next;
                      } else if (layer.key === "photo") d.speaker.photoRotation = next;
                      else d.graphic.rotation = next;
                    })
                  }
                  className="mt-1 w-full inline-flex items-center justify-center gap-1 rounded border border-black/15 bg-white px-1 py-1 text-[0.55rem] font-semibold text-black hover:bg-black/5"
                  title={`Rotate ${layer.label} by 90° (current: ${layer.rot}°)`}
                >
                  <RotateCw className="h-3 w-3" />
                  <span>Rotate {layer.rot}°</span>
                </button>
              </div>
            ))}
          </div>
          <p className="text-[0.55rem] text-black/40 leading-tight">
            Default: hero (back) → photo → graphic (top). Click Front/Back to override.
            Rotate button cycles 0° → 90° → 180° → 270° → 0°.
            {data.heroStyle === 2
              ? " Style 2 active — Hero rotate cycles the Style 2 image rotation."
              : " Style 1 active — Hero rotate cycles the gradient triangles rotation."}
          </p>
        </div>

        {/* ===== STYLE 2 HERO IMAGE CONTROLS =====
            Per user spec 2026-07-02: Style 2 hero image should be
            replaceable, draggable, resizeable, zoomable. The replace
            + drag + resize + zoom are handled on the canvas (edit
            mode). These form fields expose the underlying values for
            precise control + a "Reset position" shortcut. */}
        {data.heroStyle === 2 && (
          <div className="rounded-md border border-[#FF005A]/20 bg-[#FF005A]/[0.03] p-3 space-y-2">
            <div className="text-[0.65rem] font-bold uppercase tracking-wider text-[#FF005A]">
              Style 2 hero image — position & size
            </div>
            <Field label="Style 2 image URL (also replaceable via the canvas Replace button in edit mode)">
              <input
                type="text"
                value={data.heroStyle2Url ?? ""}
                onChange={(e) => update((d) => { d.heroStyle2Url = e.target.value; })}
                className="form-input"
                placeholder="https://..."
              />
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Position X (%)">
                <input
                  type="number"
                  step="0.5"
                  placeholder="45"
                  value={data.heroStyle2Pos?.x ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n)) {
                        d.heroStyle2Pos = { ...(d.heroStyle2Pos ?? { x: 45, y: 0 }), x: n };
                      } else {
                        d.heroStyle2Pos = undefined;
                      }
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Position Y (%)">
                <input
                  type="number"
                  step="0.5"
                  placeholder="0"
                  value={data.heroStyle2Pos?.y ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const n = parseFloat(e.target.value);
                      if (Number.isFinite(n)) {
                        d.heroStyle2Pos = { ...(d.heroStyle2Pos ?? { x: 45, y: 0 }), y: n };
                      } else {
                        d.heroStyle2Pos = undefined;
                      }
                    })
                  }
                  className="form-input"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Size scale (×) — also resizeable via corner handles">
                <input
                  type="number"
                  step="0.05"
                  min="0.01"
                  value={data.heroStyle2Scale ?? 1}
                  onChange={(e) =>
                    update((d) => {
                      d.heroStyle2Scale = parseFloat(e.target.value) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Rotation (°) — also via Rotate button above">
                <input
                  type="number"
                  step="90"
                  min="0"
                  max="270"
                  value={data.heroStyle2Rotation ?? 0}
                  onChange={(e) =>
                    update((d) => {
                      d.heroStyle2Rotation = ((parseFloat(e.target.value) || 0) % 360 + 360) % 360;
                    })
                  }
                  className="form-input"
                />
              </Field>
            </div>
            <button
              type="button"
              onClick={() =>
                update((d) => {
                  d.heroStyle2Pos = undefined;
                  d.heroStyle2Scale = 1;
                  d.heroStyle2Rotation = 0;
                  d.heroStyle2Placement = undefined;
                })
              }
              className="text-[0.55rem] text-black/50 hover:text-black underline"
            >
              Reset position, size, rotation, zoom (restore defaults)
            </button>
            <p className="text-[0.55rem] text-black/40 leading-tight">
              Tip: Toggle <strong>Edit images</strong> on the canvas to drag
              the &ldquo;⠿ Move hero&rdquo; handle (free position), drag the
              corner handles (resize), scroll the mouse wheel over the image
              (zoom), or click the <strong>Replace</strong> button to swap
              the image from the brand library.
            </p>
          </div>
        )}
      </Section>

      {/* ===== SPONSORS ===== */}
      <Section title={`Collaborators (${data.collaborators.length})`}>
        {data.collaborators.map((s, idx) => (
          <SubCard
            key={`coll-${idx}`}
            title={s.name || `#${idx + 1}`}
            onDelete={() =>
              update((d) => {
                d.collaborators.splice(idx, 1);
              })
            }
          >
            <Field label="Name">
              <input
                type="text"
                value={s.name}
                onChange={(e) =>
                  update((d) => {
                    d.collaborators[idx].name = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <Field label="Logo URL">
              <input
                type="url"
                value={s.logoUrl}
                onChange={(e) =>
                  update((d) => {
                    d.collaborators[idx].logoUrl = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo size (×)">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={s.logoSize ?? 1}
                  onChange={(e) =>
                    update((d) => {
                      d.collaborators[idx].logoSize = parseFloat(e.target.value) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Theme">
                <select
                  value={s.theme ?? "light"}
                  onChange={(e) =>
                    update((d) => {
                      d.collaborators[idx].theme = e.target.value as "light" | "dark";
                    })
                  }
                  className="form-input"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
            </div>
          </SubCard>
        ))}
        <AddButton
          label="Add collaborator"
          onClick={() =>
            update((d) => {
              d.collaborators.push({
                name: "New",
                logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
                theme: "light",
              });
            })
          }
        />
      </Section>

      <Section title={`Sponsors (${data.sponsors.length})`}>
        {data.sponsors.map((s, idx) => (
          <SubCard
            key={`spo-${idx}`}
            title={s.name || `#${idx + 1}`}
            onDelete={() =>
              update((d) => {
                d.sponsors.splice(idx, 1);
              })
            }
          >
            <Field label="Name">
              <input
                type="text"
                value={s.name}
                onChange={(e) =>
                  update((d) => {
                    d.sponsors[idx].name = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <Field label="Logo URL">
              <input
                type="url"
                value={s.logoUrl}
                onChange={(e) =>
                  update((d) => {
                    d.sponsors[idx].logoUrl = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Logo size (×)">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={s.logoSize ?? 1}
                  onChange={(e) =>
                    update((d) => {
                      d.sponsors[idx].logoSize = parseFloat(e.target.value) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Theme">
                <select
                  value={s.theme ?? "light"}
                  onChange={(e) =>
                    update((d) => {
                      d.sponsors[idx].theme = e.target.value as "light" | "dark";
                    })
                  }
                  className="form-input"
                >
                  <option value="light">Light</option>
                  <option value="dark">Dark</option>
                </select>
              </Field>
            </div>
          </SubCard>
        ))}
        <AddButton
          label="Add sponsor"
          onClick={() =>
            update((d) => {
              d.sponsors.push({
                name: "New",
                logoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
                theme: "light",
              });
            })
          }
        />
      </Section>
    </div>
  );
}

// ---- Helper sub-components (same as speaker-intro-form-view) ----

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-xs font-bold text-black uppercase tracking-wider mb-2 pb-1 border-b border-black/10">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[0.7rem] font-semibold text-black/60 mb-1">{label}</span>
      {children}
    </label>
  );
}

/**
 * TextStyleRow — a compact row with Font size + Color inputs for a
 * specific text section (Full name / Title / Company / Role / Topic /
 * Topic description / Bio / Expertise).
 *
 * Per user spec 2026-07-02: "I should be able to select the font size
 * and color of each specific text section". When the inputs are empty,
 * the canvas falls back to the default font size + color for that
 * section.
 */
function TextStyleRow({
  label,
  fontSize,
  fontColor,
  defaultFontSize,
  onChange,
}: {
  label: string;
  fontSize?: number;
  fontColor?: string;
  defaultFontSize: number;
  onChange: (fontSize: number | undefined, fontColor: string | undefined) => void;
}) {
  return (
    <div className="rounded-md border border-black/10 bg-black/[0.02] p-2 space-y-1.5">
      <div className="text-[0.55rem] font-bold uppercase tracking-wider text-black/40">
        {label}
      </div>
      <div className="grid grid-cols-[1fr_auto] gap-2 items-center">
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[0.6rem] font-semibold text-black/60 w-8">Size</span>
          <input
            type="number"
            step="1"
            min="1"
            placeholder={String(defaultFontSize)}
            value={fontSize ?? ""}
            onChange={(e) => {
              const n = parseFloat(e.target.value);
              if (Number.isFinite(n) && n > 0) onChange(n, fontColor);
              else onChange(undefined, fontColor);
            }}
            className="form-input w-20"
            title={`Font size in px (default: ${defaultFontSize}px). Empty = use default.`}
          />
          <span className="text-[0.55rem] font-mono text-black/40">px</span>
        </label>
        <label className="inline-flex items-center gap-1.5">
          <span className="text-[0.6rem] font-semibold text-black/60 w-8">Color</span>
          <input
            type="color"
            value={fontColor ?? "#000000"}
            onChange={(e) => onChange(fontSize, e.target.value)}
            className="h-7 w-9 rounded border border-black/15 cursor-pointer"
            title="Text color (click to pick). Default = black or theme color."
          />
          <button
            type="button"
            onClick={() => onChange(fontSize, undefined)}
            className="text-[0.55rem] text-black/50 hover:text-black underline"
            title="Reset color to default"
          >
            reset
          </button>
        </label>
      </div>
    </div>
  );
}

function SubCard({
  title,
  children,
  onDelete,
}: {
  title: string;
  children: React.ReactNode;
  onDelete?: () => void;
}) {
  return (
    <div className="rounded-md border border-black/15 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-black">{title}</span>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-red-500 hover:bg-red-50 p-1 rounded"
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-md border border-dashed border-black/30 text-black/60 font-semibold px-3 py-2 text-xs hover:bg-black/5 hover:text-black"
    >
      <Plus className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-7 w-9 rounded border border-black/15 cursor-pointer"
      />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="form-input flex-1"
      />
    </div>
  );
}

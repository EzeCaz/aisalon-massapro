"use client";

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { EventProfileData, SessionType } from "../event-profile/types";
import { sessionTypeLabel, isAutoHiddenSessionType } from "../event-profile/types";
import { GradientColorPicker } from "./gradient-color-picker";
import { TextStyleRow } from "./text-style-row";

/**
 * EventProfileFormView — structured form view of EventProfileData.
 *
 * Same pattern as the other form views — every field as a labeled input,
 * grouped by section (Event / Hero / Sessions / Speakers / Sponsors).
 */
type Props = {
  data: EventProfileData;
  onChange: (next: EventProfileData) => void;
};

export function EventProfileFormView({ data, onChange }: Props) {
  const update = useCallback(
    (recipe: (draft: EventProfileData) => void) => {
      const next: EventProfileData = JSON.parse(JSON.stringify(data));
      recipe(next);
      onChange(next);
    },
    [data, onChange],
  );

  const sessionsSorted = [...data.sessions].sort((a, b) => a.order - b.order);
  const speakersSorted = [...data.speakers].sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-5 p-4 bg-white text-black max-h-[640px] overflow-y-auto text-sm">
      {/* ===== EVENT ===== */}
      <Section title="Event">
        <Field label="Event name">
          <input
            type="text"
            value={data.event.name}
            onChange={(e) => update((d) => { d.event.name = e.target.value; })}
            className="form-input"
          />
        </Field>
        <TextStyleRow
          label="Event name — font size + color + align"
          fontSize={data.textStyles?.eventName?.fontSize}
          fontColor={data.textStyles?.eventName?.color}
          align={data.textStyles?.eventName?.align}
          defaultFontSize={72}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.eventName = {
                ...(d.textStyles.eventName ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
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
        <TextStyleRow
          label="Header line: date · venue — font size + color + align"
          fontSize={data.textStyles?.eventDateVenue?.fontSize}
          fontColor={data.textStyles?.eventDateVenue?.color}
          align={data.textStyles?.eventDateVenue?.align}
          defaultFontSize={13}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.eventDateVenue = {
                ...(d.textStyles.eventDateVenue ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <Field label="Topic">
          <input
            type="text"
            value={data.event.topic}
            onChange={(e) => update((d) => { d.event.topic = e.target.value; })}
            className="form-input"
          />
        </Field>
        <TextStyleRow
          label="Topic — font size + color + align"
          fontSize={data.textStyles?.eventTopic?.fontSize}
          fontColor={data.textStyles?.eventTopic?.color}
          align={data.textStyles?.eventTopic?.align}
          defaultFontSize={22}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.eventTopic = {
                ...(d.textStyles.eventTopic ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <Field label="Event logo URL (optional — overrides 'ai salon' wordmark)">
          <input
            type="url"
            value={data.event.logoUrl ?? ""}
            onChange={(e) => update((d) => { d.event.logoUrl = e.target.value || undefined; })}
            className="form-input"
            placeholder="https://…"
          />
        </Field>
        <Field label="Description">
          <textarea
            value={data.event.description ?? ""}
            onChange={(e) => update((d) => { d.event.description = e.target.value || undefined; })}
            className="form-input min-h-[60px] resize-y"
            rows={2}
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
        <TextStyleRow
          label="Footer credit — font size + color + align"
          fontSize={data.textStyles?.footerCredit?.fontSize}
          fontColor={data.textStyles?.footerCredit?.color}
          align={data.textStyles?.footerCredit?.align}
          defaultFontSize={11}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.footerCredit = {
                ...(d.textStyles.footerCredit ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
      </Section>

      {/* ===== HERO ===== */}
      <Section title="Hero image & overlay">
        <Field label="Hero image URL">
          <input
            type="url"
            value={data.heroOverlay.imageUrl}
            onChange={(e) => update((d) => { d.heroOverlay.imageUrl = e.target.value; })}
            className="form-input"
          />
        </Field>
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
        <div className="grid grid-cols-2 gap-3">
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
          <Field label="Image scale (×)">
            <input
              type="number"
              step="0.05"
              min="0.01"
              value={data.heroOverlay.imageScale ?? 1}
              onChange={(e) =>
                update((d) => {
                  d.heroOverlay.imageScale = parseFloat(e.target.value) || 1;
                })
              }
              className="form-input"
            />
          </Field>
        </div>

        {/* ===== LAYER Z-INDEX CONTROLS (Section 1 — moved from canvas to sidebar) =====
            Per user spec 2026-06-28: "Move all 'Capabilities' controls
            (toggles, inputs, visibility settings) from the canvas slider
            to the Left Sidebar for all mockup pages."
            Default z-order: heroZ=2 (front), triangleZ=1 (behind hero).
            Triangle controls are only meaningful for event-profile
            (which has a triangle SVG); agenda-profile ignores them. */}
        <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 space-y-2">
          <div className="text-[0.65rem] font-bold uppercase tracking-wider text-black/50">
            Layer z-index (Front = on top)
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[0.6rem] text-black/60 mb-1">Hero (z={data.heroZ ?? 2})</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      const tz = d.triangleZ ?? 1;
                      d.heroZ = tz + 1;
                    })
                  }
                  className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                  title="Bring hero to front (above triangle)"
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      const tz = d.triangleZ ?? 1;
                      d.heroZ = tz - 1;
                    })
                  }
                  className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                  title="Send hero to back (below triangle)"
                >
                  Back
                </button>
              </div>
            </div>
            <div>
              <div className="text-[0.6rem] text-black/60 mb-1">Triangle (z={data.triangleZ ?? 1})</div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      const hz = d.heroZ ?? 2;
                      d.triangleZ = hz + 1;
                    })
                  }
                  className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                  title="Bring triangle to front (above hero) — event-profile only"
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      const hz = d.heroZ ?? 2;
                      d.triangleZ = hz - 1;
                    })
                  }
                  className="flex-1 rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                  title="Send triangle to back (below hero) — event-profile only"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
          <p className="text-[0.55rem] text-black/40 leading-tight">
            Default: hero on top, triangle behind. Click Front/Back to override.
            (Triangle controls apply only to event-profile mockups.)
          </p>
        </div>
        <TextStyleRow
          label="Location pin label (all pins) — font size + color + align"
          fontSize={data.textStyles?.locationPinLabel?.fontSize}
          fontColor={data.textStyles?.locationPinLabel?.color}
          align={data.textStyles?.locationPinLabel?.align}
          defaultFontSize={13}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.locationPinLabel = {
                ...(d.textStyles.locationPinLabel ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
      </Section>

      {/* ===== SESSIONS ===== */}
      <Section title={`Sessions (${sessionsSorted.length} · ${sessionsSorted.filter((s) => s.visible !== false).length} visible)`}>
        <p className="text-[0.65rem] text-black/50 leading-relaxed">
          Sessions marked BREAK / NETWORKING / CHECKIN are auto-hidden when
          auto-filled from an event. Toggle visibility per row below.
        </p>
        {sessionsSorted.map((session, idx) => (
          <SubCard
            key={`sess-${idx}`}
            title={`#${session.order} · ${session.title || "Untitled"}`}
            onDelete={() =>
              update((d) => {
                d.sessions = d.sessions.filter((s) => s.order !== session.order);
              })
            }
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="Order">
                <input
                  type="number"
                  min={1}
                  value={session.order}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.sessions.find((s) => s.order === session.order);
                      if (target) target.order = parseInt(e.target.value, 10) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Type">
                <select
                  value={session.type}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.sessions.find((s) => s.order === session.order);
                      if (target) target.type = e.target.value as SessionType;
                    })
                  }
                  className="form-input"
                >
                  {(["WELCOME", "TALK", "PANEL", "FAST_PITCH", "BREAK", "NETWORKING", "CHECKIN", "OTHER"] as SessionType[]).map((t) => (
                    <option key={t} value={t}>
                      {sessionTypeLabel(t)}{isAutoHiddenSessionType(t) ? " (auto-hide)" : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Visible">
                <select
                  value={session.visible === false ? "false" : "true"}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.sessions.find((s) => s.order === session.order);
                      if (target) target.visible = e.target.value === "true";
                    })
                  }
                  className="form-input"
                >
                  <option value="true">Yes</option>
                  <option value="false">No (hidden)</option>
                </select>
              </Field>
            </div>
            <Field label="Title">
              <input
                type="text"
                value={session.title}
                onChange={(e) =>
                  update((d) => {
                    const target = d.sessions.find((s) => s.order === session.order);
                    if (target) target.title = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <Field label="Description">
              <input
                type="text"
                value={session.description ?? ""}
                onChange={(e) =>
                  update((d) => {
                    const target = d.sessions.find((s) => s.order === session.order);
                    if (target) target.description = e.target.value || undefined;
                  })
                }
                className="form-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Start time">
                <input
                  type="text"
                  value={session.startTime ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.sessions.find((s) => s.order === session.order);
                      if (target) target.startTime = e.target.value || undefined;
                    })
                  }
                  className="form-input"
                  placeholder="18:30"
                />
              </Field>
              <Field label="End time">
                <input
                  type="text"
                  value={session.endTime ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.sessions.find((s) => s.order === session.order);
                      if (target) target.endTime = e.target.value || undefined;
                    })
                  }
                  className="form-input"
                  placeholder="19:00"
                />
              </Field>
            </div>
            <Field label="Speaker name">
              <input
                type="text"
                value={session.speakerName ?? ""}
                onChange={(e) =>
                  update((d) => {
                    const target = d.sessions.find((s) => s.order === session.order);
                    if (target) target.speakerName = e.target.value || undefined;
                  })
                }
                className="form-input"
              />
            </Field>
          </SubCard>
        ))}
        <AddButton
          label="Add session"
          onClick={() =>
            update((d) => {
              const nextOrder = Math.max(0, ...d.sessions.map((s) => s.order)) + 1;
              d.sessions.push({
                order: nextOrder,
                type: "TALK",
                title: "New session",
              });
            })
          }
        />
      </Section>

      {/* ===== SPEAKERS ===== */}
      <Section title={`Speakers (${speakersSorted.length} · ${speakersSorted.filter((s) => s.visible !== false).length} visible)`}>
        {speakersSorted.map((sp, idx) => (
          <SubCard
            key={`sp-${idx}`}
            title={`#${sp.order} · ${sp.fullName || "Untitled"}`}
            onDelete={() =>
              update((d) => {
                d.speakers = d.speakers.filter((s) => s.order !== sp.order);
              })
            }
          >
            <div className="grid grid-cols-2 gap-3">
              <Field label="Order">
                <input
                  type="number"
                  min={1}
                  value={sp.order}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.order = parseInt(e.target.value, 10) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Role">
                <select
                  value={sp.role ?? "Speaker"}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.role = e.target.value as "Speaker" | "Moderator" | "Panelist" | "Host";
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
            </div>
            <Field label="Full name">
              <input
                type="text"
                value={sp.fullName}
                onChange={(e) =>
                  update((d) => {
                    const target = d.speakers.find((s) => s.order === sp.order);
                    if (target) target.fullName = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Title">
                <input
                  type="text"
                  value={sp.title}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.title = e.target.value;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Company">
                <input
                  type="text"
                  value={sp.company}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.company = e.target.value;
                    })
                  }
                  className="form-input"
                />
              </Field>
            </div>
            <Field label="Bio">
              <textarea
                value={sp.bio ?? ""}
                onChange={(e) =>
                  update((d) => {
                    const target = d.speakers.find((s) => s.order === sp.order);
                    if (target) target.bio = e.target.value || undefined;
                  })
                }
                className="form-input min-h-[60px] resize-y"
                rows={2}
              />
            </Field>
            <Field label="Photo URL">
              <input
                type="url"
                value={sp.photoUrl}
                onChange={(e) =>
                  update((d) => {
                    const target = d.speakers.find((s) => s.order === sp.order);
                    if (target) target.photoUrl = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Photo size (×)">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={sp.photoSize ?? 1}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.photoSize = parseFloat(e.target.value) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Session time">
                <input
                  type="text"
                  value={sp.sessionTime ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.sessionTime = e.target.value || undefined;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Visible">
                <select
                  value={sp.visible === false ? "false" : "true"}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      if (target) target.visible = e.target.value === "true";
                    })
                  }
                  className="form-input"
                >
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </Field>
            </div>
          </SubCard>
        ))}
        <AddButton
          label="Add speaker"
          onClick={() =>
            update((d) => {
              const nextOrder = Math.max(0, ...d.speakers.map((s) => s.order)) + 1;
              d.speakers.push({
                order: nextOrder,
                fullName: "New Speaker",
                title: "",
                company: "",
                photoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
              });
            })
          }
        />
      </Section>

      {/* ===== SPONSORS ===== */}
      <Section title={`Collaborators (${data.collaborators.length})`}>
        <TextStyleRow
          label="“In collaboration with” label — font size + color + align"
          fontSize={data.textStyles?.collaboratorsLabel?.fontSize}
          fontColor={data.textStyles?.collaboratorsLabel?.color}
          align={data.textStyles?.collaboratorsLabel?.align}
          defaultFontSize={11}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.collaboratorsLabel = {
                ...(d.textStyles.collaboratorsLabel ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        {data.collaborators.map((s, idx) => (
          <SubCard
            key={`coll-${idx}`}
            title={s.name || `#${idx + 1}`}
            onDelete={() => update((d) => { d.collaborators.splice(idx, 1); })}
          >
            <Field label="Name">
              <input
                type="text"
                value={s.name}
                onChange={(e) => update((d) => { d.collaborators[idx].name = e.target.value; })}
                className="form-input"
              />
            </Field>
            <Field label="Logo URL">
              <input
                type="url"
                value={s.logoUrl}
                onChange={(e) => update((d) => { d.collaborators[idx].logoUrl = e.target.value; })}
                className="form-input"
              />
            </Field>
            <Field label="Logo size (×) — 1 = 32px height">
              <input
                type="number"
                step="0.1"
                min="0.25"
                value={s.logoSize ?? 1}
                onChange={(e) =>
                  update((d) => {
                    d.collaborators[idx].logoSize = parseFloat(e.target.value) || 1;
                  })
                }
                className="form-input"
              />
            </Field>
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
        <TextStyleRow
          label="“Sponsored by” label — font size + color + align"
          fontSize={data.textStyles?.sponsorsLabel?.fontSize}
          fontColor={data.textStyles?.sponsorsLabel?.color}
          align={data.textStyles?.sponsorsLabel?.align}
          defaultFontSize={11}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.sponsorsLabel = {
                ...(d.textStyles.sponsorsLabel ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        {data.sponsors.map((s, idx) => (
          <SubCard
            key={`spo-${idx}`}
            title={s.name || `#${idx + 1}`}
            onDelete={() => update((d) => { d.sponsors.splice(idx, 1); })}
          >
            <Field label="Name">
              <input
                type="text"
                value={s.name}
                onChange={(e) => update((d) => { d.sponsors[idx].name = e.target.value; })}
                className="form-input"
              />
            </Field>
            <Field label="Logo URL">
              <input
                type="url"
                value={s.logoUrl}
                onChange={(e) => update((d) => { d.sponsors[idx].logoUrl = e.target.value; })}
                className="form-input"
              />
            </Field>
            <Field label="Logo size (×) — 1 = 32px height">
              <input
                type="number"
                step="0.1"
                min="0.25"
                value={s.logoSize ?? 1}
                onChange={(e) =>
                  update((d) => {
                    d.sponsors[idx].logoSize = parseFloat(e.target.value) || 1;
                  })
                }
                className="form-input"
              />
            </Field>
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

      {/* ===== BRANDING ASSET (bottom-LEFT) =====
          Per user spec 2026-07-02: "On all mockups, the bottom left
          branding asset should be this as default, ...1782505047256-bpy1ln.png
          and replaceable". Renders at the bottom-LEFT corner by default,
          draggable via the "⠿ Move branding" handle on the canvas. */}
      <Section title="Branding asset (bottom-left)">
        <Field label="Image URL">
          <input
            type="url"
            value={data.brandingAsset?.imageUrl ?? ""}
            placeholder="https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png"
            onChange={(e) =>
              update((d) => {
                d.brandingAsset = {
                  ...(d.brandingAsset ?? {}),
                  imageUrl: e.target.value || undefined,
                };
              })
            }
            className="form-input"
          />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height (px)">
            <input
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
              className="form-input"
            />
          </Field>
          <Field label="Reset position">
            <button
              type="button"
              onClick={() =>
                update((d) => {
                  if (d.brandingAsset) d.brandingAsset.pos = undefined;
                })
              }
              disabled={!data.brandingAsset?.pos}
              className="form-input text-left text-xs text-black/60 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Reset to the default bottom-left corner (2.7% left, 94% top)"
            >
              Reset to corner
            </button>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Position X (%)">
            <input
              type="number"
              step="0.1"
              min="-20"
              max="120"
              value={data.brandingAsset?.pos?.x ?? 2.7}
              onChange={(e) =>
                update((d) => {
                  d.brandingAsset = {
                    ...(d.brandingAsset ?? {}),
                    pos: {
                      x: parseFloat(e.target.value) || 0,
                      y: d.brandingAsset?.pos?.y ?? 94,
                    },
                  };
                })
              }
              className="form-input"
            />
          </Field>
          <Field label="Position Y (%)">
            <input
              type="number"
              step="0.1"
              min="-20"
              max="120"
              value={data.brandingAsset?.pos?.y ?? 94}
              onChange={(e) =>
                update((d) => {
                  d.brandingAsset = {
                    ...(d.brandingAsset ?? {}),
                    pos: {
                      x: d.brandingAsset?.pos?.x ?? 2.7,
                      y: parseFloat(e.target.value) || 0,
                    },
                  };
                })
              }
              className="form-input"
            />
          </Field>
        </div>
        <p className="text-[0.65rem] text-black/40">
          Defaults to bottom-left (X=2.7%, Y=94%). Drag the{" "}
          <strong>⠿ Move branding</strong> handle on the canvas in edit mode
          to position it freely.
        </p>
      </Section>
    </div>
  );
}

// ---- Helper sub-components ----

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

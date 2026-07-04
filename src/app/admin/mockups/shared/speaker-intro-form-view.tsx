"use client";

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SpeakerIntroData } from "../speaker-intro/types";
import { GradientColorPicker } from "./gradient-color-picker";
import { TextStyleRow } from "./text-style-row";

/**
 * SpeakerIntroFormView — a structured form view of the SpeakerIntroData.
 *
 * Renders every editable field as a labeled input (text / number / textarea)
 * grouped by section. The user can toggle between this form view and the
 * raw JSON editor — both stay in sync via the same `data` object.
 *
 * Why a form view?
 *   - Non-technical users find a form easier to scan/edit than raw JSON.
 *   - Reduces the risk of typos that break the JSON parser.
 *   - Lets us group related fields visually (event / speakers / hero / etc).
 *
 * The form is fully controlled — every change calls `onChange(next)` with
 * a new SpeakerIntroData object. The parent owns the source of truth.
 */
type Props = {
  data: SpeakerIntroData;
  onChange: (next: SpeakerIntroData) => void;
};

export function SpeakerIntroFormView({ data, onChange }: Props) {
  const update = useCallback(
    (recipe: (draft: SpeakerIntroData) => void) => {
      const next: SpeakerIntroData = JSON.parse(JSON.stringify(data));
      recipe(next);
      onChange(next);
    },
    [data, onChange],
  );

  // Attach the ORIGINAL array index to each speaker so we have a stable
  // identity that survives re-sorting when the user changes the `order`
  // field. Using `order` itself as the identity (via find(s => s.order === sp.order))
  // is unsafe because:
  //   1. order values can collide (e.g. user types 5 when another speaker is
  //      already 5, or prior corruption left duplicates) — `find` returns the
  //      first match, so edits land on the wrong speaker.
  //   2. even without collisions, when the user types a new order value the
  //      speaker moves in the sorted list, so the closure's `sp.order` no
  //      longer matches the speaker the user is editing.
  // The original index is stable across re-sorts (we only ever push to the
  // end of `data.speakers`, never insert in the middle).
  const speakersSorted = data.speakers
    .map((sp, origIdx) => ({ sp, origIdx }))
    .sort((a, b) => a.sp.order - b.sp.order);

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
          defaultFontSize={44}
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
              placeholder="June 18th 2026"
            />
          </Field>
          <Field label="Time">
            <input
              type="text"
              value={data.event.time}
              onChange={(e) => update((d) => { d.event.time = e.target.value; })}
              className="form-input"
              placeholder="18:00"
            />
          </Field>
        </div>
        <TextStyleRow
          label="Event date + time — font size + color + align"
          fontSize={data.textStyles?.eventDate?.fontSize}
          fontColor={data.textStyles?.eventDate?.color}
          align={data.textStyles?.eventDate?.align}
          defaultFontSize={16}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.eventDate = {
                ...(d.textStyles.eventDate ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <Field label="Venue">
          <input
            type="text"
            value={data.event.venue}
            onChange={(e) => update((d) => { d.event.venue = e.target.value; })}
            className="form-input"
          />
        </Field>
        <TextStyleRow
          label="Venue — font size + color + align"
          fontSize={data.textStyles?.eventVenue?.fontSize}
          fontColor={data.textStyles?.eventVenue?.color}
          align={data.textStyles?.eventVenue?.align}
          defaultFontSize={14}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.eventVenue = {
                ...(d.textStyles.eventVenue ?? {}),
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
          defaultFontSize={24}
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
        <div className="grid grid-cols-2 gap-3">
          <Field label="Event name font scale (×)">
            <input
              type="number"
              step="0.1"
              min="0.3"
              max="3"
              value={data.event.nameFontScale ?? 1}
              onChange={(e) =>
                update((d) => {
                  d.event.nameFontScale = parseFloat(e.target.value) || 1;
                })
              }
              className="form-input"
            />
            <span className="text-[0.6rem] text-black/40 mt-0.5">
              Base: 44px · current: {Math.round(44 * (data.event.nameFontScale ?? 1))}px
            </span>
          </Field>
          <Field label="Topic font scale (×)">
            <input
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
              className="form-input"
            />
            <span className="text-[0.6rem] text-black/40 mt-0.5">
              Base: 24px · current: {Math.round(24 * (data.event.topicFontScale ?? 1))}px
            </span>
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
        <TextStyleRow
          label="Register here label — font size + color + align"
          fontSize={data.textStyles?.registerHere?.fontSize}
          fontColor={data.textStyles?.registerHere?.color}
          align={data.textStyles?.registerHere?.align}
          defaultFontSize={10}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.registerHere = {
                ...(d.textStyles.registerHere ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
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

      {/* ===== SPEAKERS ===== */}
      <Section title={`Speakers (${speakersSorted.length})`}>
        {/* Speaker grid layout controls */}
        <div className="rounded-md border border-black/10 bg-black/[0.02] p-3 mb-3">
          <p className="text-xs font-semibold text-black/70 mb-2 uppercase tracking-wider">
            Speaker grid layout
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Columns">
              <select
                value={String(data.speakersLayout?.columns ?? 1)}
                onChange={(e) =>
                  update((d) => {
                    if (!d.speakersLayout) d.speakersLayout = {};
                    d.speakersLayout.columns = parseInt(e.target.value, 10) as 1 | 2 | 3;
                  })
                }
                className="form-input"
              >
                <option value="1">1 column</option>
                <option value="2">2 columns</option>
                <option value="3">3 columns</option>
              </select>
            </Field>
            <Field label="Flow direction">
              <select
                value={data.speakersLayout?.flowDirection ?? "row"}
                onChange={(e) =>
                  update((d) => {
                    if (!d.speakersLayout) d.speakersLayout = {};
                    d.speakersLayout.flowDirection = e.target.value as "row" | "col";
                  })
                }
                className="form-input"
              >
                <option value="row">Row-by-row (left→right, then wrap)</option>
                <option value="col">Col-by-col (top→bottom, then next col)</option>
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3 mt-2">
            <Field label="Last row alignment">
              <select
                value={data.speakersLayout?.lastRowAlign ?? "spread"}
                onChange={(e) =>
                  update((d) => {
                    if (!d.speakersLayout) d.speakersLayout = {};
                    d.speakersLayout.lastRowAlign = e.target.value as "left" | "center" | "spread";
                  })
                }
                className="form-input"
              >
                <option value="spread">Spread evenly</option>
                <option value="center">Center</option>
                <option value="left">Left-align</option>
              </select>
            </Field>
            <Field label="Rows per column (comma-separated)">
              <input
                type="text"
                value={(data.speakersLayout?.rowsPerColumn ?? []).join(",")}
                placeholder="auto (e.g. 2,1,2)"
                onChange={(e) =>
                  update((d) => {
                    if (!d.speakersLayout) d.speakersLayout = {};
                    const txt = e.target.value.trim();
                    if (!txt) {
                      d.speakersLayout.rowsPerColumn = [];
                    } else {
                      d.speakersLayout.rowsPerColumn = txt
                        .split(",")
                        .map((s) => parseInt(s.trim(), 10))
                        .filter((n) => !isNaN(n) && n > 0);
                    }
                  })
                }
                className="form-input"
              />
            </Field>
          </div>
          <p className="text-[0.65rem] text-black/50 mt-2">
            {(() => {
              const cols = data.speakersLayout?.columns ?? 1;
              const n = speakersSorted.length;
              if (n === 0) return "No speakers yet.";
              const rows = Math.ceil(n / cols);
              return `${n} speaker${n === 1 ? "" : "s"} · ${cols} column${cols === 1 ? "" : "s"} · ${rows} row${rows === 1 ? "" : "s"} (ordered by # field)`;
            })()}
          </p>
        </div>
        {/* ===== Per-section TextStyle controls for the speaker cards =====
            These apply uniformly to EVERY speaker card on the canvas
            (not per-speaker overrides) — speaker cards share one visual
            treatment per the rest of the mockup's styling model. */}
        <TextStyleRow
          label="“Speakers” header label — font size + color + align"
          fontSize={data.textStyles?.speakersLabel?.fontSize}
          fontColor={data.textStyles?.speakersLabel?.color}
          align={data.textStyles?.speakersLabel?.align}
          defaultFontSize={12}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.speakersLabel = {
                ...(d.textStyles.speakersLabel ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <TextStyleRow
          label="Speaker name — font size + color + align (all cards)"
          fontSize={data.textStyles?.speakerName?.fontSize}
          fontColor={data.textStyles?.speakerName?.color}
          align={data.textStyles?.speakerName?.align}
          defaultFontSize={16}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.speakerName = {
                ...(d.textStyles.speakerName ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <TextStyleRow
          label="Speaker title · company — font size + color + align (all cards)"
          fontSize={data.textStyles?.speakerTitle?.fontSize}
          fontColor={data.textStyles?.speakerTitle?.color}
          align={data.textStyles?.speakerTitle?.align}
          defaultFontSize={12}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.speakerTitle = {
                ...(d.textStyles.speakerTitle ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <TextStyleRow
          label="Speaker bio — font size + color + align (all cards)"
          fontSize={data.textStyles?.speakerBio?.fontSize}
          fontColor={data.textStyles?.speakerBio?.color}
          align={data.textStyles?.speakerBio?.align}
          defaultFontSize={11}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.speakerBio = {
                ...(d.textStyles.speakerBio ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <TextStyleRow
          label="Speaker session-time pill text — font size + color + align (all cards)"
          fontSize={data.textStyles?.speakerSessionTime?.fontSize}
          fontColor={data.textStyles?.speakerSessionTime?.color}
          align={data.textStyles?.speakerSessionTime?.align}
          defaultFontSize={9}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.speakerSessionTime = {
                ...(d.textStyles.speakerSessionTime ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        <TextStyleRow
          label="Speaker role pill text (Moderator / Panelist) — font size + color + align (all cards)"
          fontSize={data.textStyles?.speakerRole?.fontSize}
          fontColor={data.textStyles?.speakerRole?.color}
          align={data.textStyles?.speakerRole?.align}
          defaultFontSize={9}
          onChange={(fontSize, fontColor, align) =>
            update((d) => {
              if (!d.textStyles) d.textStyles = {};
              d.textStyles.speakerRole = {
                ...(d.textStyles.speakerRole ?? {}),
                ...(fontSize !== undefined ? { fontSize } : {}),
                ...(fontColor !== undefined ? { color: fontColor } : {}),
                ...(align !== undefined ? { align } : {}),
              };
            })
          }
        />
        {speakersSorted.map(({ sp, origIdx }) => (
          <SubCard
            key={`spk-${origIdx}`}
            title={`#${sp.order} · ${sp.fullName || "Untitled"}`}
            onDelete={() =>
              update((d) => {
                d.speakers.splice(origIdx, 1);
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
                      const target = d.speakers[origIdx];
                      if (target) target.order = parseInt(e.target.value, 10) || 1;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Role">
                <select
                  value={sp.role}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers[origIdx];
                      if (target) target.role = e.target.value as SpeakerIntroData["speakers"][number]["role"];
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
                    const target = d.speakers[origIdx];
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
                      const target = d.speakers[origIdx];
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
                      const target = d.speakers[origIdx];
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
                    const target = d.speakers[origIdx];
                    if (target) target.bio = e.target.value || undefined;
                  })
                }
                className="form-input min-h-[60px] resize-y"
                rows={2}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session title">
                <input
                  type="text"
                  value={sp.sessionTitle ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers[origIdx];
                      if (target) target.sessionTitle = e.target.value || undefined;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="Session time (HH:MM)">
                <input
                  type="text"
                  value={sp.sessionTime ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers[origIdx];
                      if (target) target.sessionTime = e.target.value || undefined;
                    })
                  }
                  className="form-input"
                  placeholder="18:30"
                />
              </Field>
            </div>
            <Field label="Photo URL">
              <input
                type="url"
                value={sp.photoUrl}
                onChange={(e) =>
                  update((d) => {
                    const target = d.speakers[origIdx];
                    if (target) target.photoUrl = e.target.value;
                  })
                }
                className="form-input"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Photo size (×)">
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={sp.photoSize ?? 1}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers[origIdx];
                      if (target) target.photoSize = parseFloat(e.target.value) || 1;
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
                      const target = d.speakers[origIdx];
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
          </SubCard>
        ))}
        <AddButton
          label="Add speaker"
          onClick={() =>
            update((d) => {
              const nextOrder = Math.max(0, ...d.speakers.map((s) => s.order)) + 1;
              d.speakers.push({
                order: nextOrder,
                role: "Speaker",
                fullName: "New Speaker",
                title: "",
                company: "",
                photoUrl: "https://aisalon.massapro.com/images/falafel-meerkat.png",
              });
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
        <Field label="Image fit (how the image fills the container)">
          <select
            value={data.heroOverlay.fit ?? "cover"}
            onChange={(e) =>
              update((d) => {
                d.heroOverlay.fit = e.target.value as "cover" | "contain";
              })
            }
            className="form-input"
          >
            <option value="cover">Cover — fill container, crop overflow (default, best for landscape photos)</option>
            <option value="contain">Contain — fit entire image inside container, letterbox if needed (best for brand assets / logos)</option>
          </select>
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
          <Field label="Image scale X (×) — only limit is canvas border">
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
          <Field label="Image scale Y (×) — only limit is canvas border">
            <input
              type="number"
              step="0.05"
              min="0.01"
              value={data.heroOverlay.imageScaleY ?? 1}
              onChange={(e) =>
                update((d) => {
                  d.heroOverlay.imageScaleY = parseFloat(e.target.value) || 1;
                })
              }
              className="form-input"
            />
          </Field>
        </div>
        <Field label="Show triangle overlay?">
          <select
            value={data.heroOverlay.showTriangleOverlay === false ? "false" : "true"}
            onChange={(e) =>
              update((d) => {
                d.heroOverlay.showTriangleOverlay = e.target.value === "true";
              })
            }
            className="form-input"
          >
            <option value="true">Yes (default)</option>
            <option value="false">No (hidden — auto-disabled when hero image changes)</option>
          </select>
        </Field>

        {/* ===== LAYER Z-INDEX CONTROLS (Section 1 — moved from canvas to sidebar) =====
            Per user spec 2026-06-28: "Move all 'Capabilities' controls
            (toggles, inputs, visibility settings) from the canvas slider
            to the Left Sidebar for all mockup pages."
            Default z-order: heroZ=2 (front), triangleZ=1 (behind hero).
            Front/Back buttons override dynamically. */}
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
                  title="Bring triangle to front (above hero)"
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
                  title="Send triangle to back (below hero)"
                >
                  Back
                </button>
              </div>
            </div>
          </div>
          <p className="text-[0.55rem] text-black/40 leading-tight">
            Default: hero on top, triangle behind. Click Front/Back to override.
          </p>
        </div>
      </Section>

      {/* ===== LOCATION PINS ===== */}
      <Section title={`Location pins (${data.locationPins.length})`}>
        <TextStyleRow
          label="Location pin label (all pins) — font size + color + align"
          fontSize={data.textStyles?.locationPinLabel?.fontSize}
          fontColor={data.textStyles?.locationPinLabel?.color}
          align={data.textStyles?.locationPinLabel?.align}
          defaultFontSize={11}
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
        {data.locationPins.map((pin, idx) => (
          <SubCard
            key={`pin-${idx}`}
            title={pin.label || `Pin #${idx + 1}`}
            onDelete={() =>
              update((d) => {
                d.locationPins.splice(idx, 1);
              })
            }
          >
            <div className="grid grid-cols-3 gap-3">
              <Field label="Label">
                <input
                  type="text"
                  value={pin.label}
                  onChange={(e) =>
                    update((d) => {
                      d.locationPins[idx].label = e.target.value;
                    })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="X (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={pin.x}
                  onChange={(e) =>
                    update((d) => {
                      d.locationPins[idx].x = parseFloat(e.target.value) || 0;
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
                  value={pin.y}
                  onChange={(e) =>
                    update((d) => {
                      d.locationPins[idx].y = parseFloat(e.target.value) || 0;
                    })
                  }
                  className="form-input"
                />
              </Field>
            </div>
            {/* Per-pin z-index controls — same pattern as Hero/Triangle
                z-index in the Hero overlay section above.
                Per user spec 2026-06-30: "On the mockups/speaker-intro add
                to the Location pins (4) the same front or back capabilities
                as the images". Default z=50 (in front of hero image +
                triangle, at text-section level). Front/Back buttons cycle
                above/below the hero image (which sits at heroZ, default 2). */}
            <div className="rounded-md border border-black/10 bg-black/[0.02] p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[0.6rem] font-bold uppercase tracking-wider text-black/55">
                  Layer z-index
                </span>
                <span className="text-[0.55rem] font-mono text-black/50">
                  z={pin.z ?? 50}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1">
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      // Bring to front: above all other pins + hero.
                      const peers = d.locationPins.map((p) => p.z ?? 50);
                      const heroZ = d.heroZ ?? 2;
                      const maxPeer = Math.max(...peers, heroZ);
                      d.locationPins[idx].z = maxPeer + 1;
                    })
                  }
                  className="rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                  title="Bring this pin to front (above hero + other pins)"
                >
                  Front
                </button>
                <button
                  type="button"
                  onClick={() =>
                    update((d) => {
                      // Send to back: below hero image (so the pin appears
                      // hidden behind the hero photo). Useful for layering
                      // effects where pins peek out from behind the image.
                      const peers = d.locationPins.map((p) => p.z ?? 50);
                      const heroZ = d.heroZ ?? 2;
                      const minPeer = Math.min(...peers, heroZ);
                      d.locationPins[idx].z = minPeer - 1;
                    })
                  }
                  className="rounded border border-black/15 bg-white px-2 py-1 text-[0.6rem] font-semibold text-black hover:bg-black/5"
                  title="Send this pin to back (behind hero image)"
                >
                  Back
                </button>
              </div>
              <p className="text-[0.55rem] text-black/40 leading-tight">
                Default z=50 (in front of hero). Click Back to hide behind the hero image.
              </p>
            </div>
          </SubCard>
        ))}
        <AddButton
          label="Add pin"
          onClick={() =>
            update((d) => {
              d.locationPins.push({ label: "New", x: 50, y: 50, z: 50 });
            })
          }
        />
      </Section>

      {/* ===== SPONSORS / COLLABORATORS ===== */}
      <Section title={`Collaborators (${data.collaborators.length})`}>
        <TextStyleRow
          label="“In collaboration with” label — font size + color + align"
          fontSize={data.textStyles?.collaboratorsLabel?.fontSize}
          fontColor={data.textStyles?.collaboratorsLabel?.color}
          align={data.textStyles?.collaboratorsLabel?.align}
          defaultFontSize={10}
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
        <TextStyleRow
          label="“Sponsored by” label — font size + color + align"
          fontSize={data.textStyles?.sponsorsLabel?.fontSize}
          fontColor={data.textStyles?.sponsorsLabel?.color}
          align={data.textStyles?.sponsorsLabel?.align}
          defaultFontSize={10}
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

      {/* ===== BRANDING (bottom-right) — REMOVED per user spec 2026-07-02 =====
          The canvas SectionBox for this was deleted; only the bottom-LEFT
          branding asset below remains. The `data.branding` field is kept in
          the type so existing JSON data doesn't break, but it no longer
          renders anywhere. */}

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

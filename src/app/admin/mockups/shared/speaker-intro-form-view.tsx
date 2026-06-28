"use client";

import { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { SpeakerIntroData } from "../speaker-intro/types";

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

  // sort speakers by order for display
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
        <Field label="Venue">
          <input
            type="text"
            value={data.event.venue}
            onChange={(e) => update((d) => { d.event.venue = e.target.value; })}
            className="form-input"
          />
        </Field>
        <Field label="Topic">
          <input
            type="text"
            value={data.event.topic}
            onChange={(e) => update((d) => { d.event.topic = e.target.value; })}
            className="form-input"
          />
        </Field>
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
            Leave "Rows per column" empty to auto-distribute speakers evenly
            across the chosen column count. Use the "Order" field on each
            speaker card below to control the sort order.
          </p>
        </div>

        {speakersSorted.map((sp, idx) => (
          <SubCard
            key={`${sp.order}-${sp.fullName}`}
            title={`#${sp.order} · ${sp.fullName || "Untitled"}`}
            onDelete={() =>
              update((d) => {
                d.speakers = d.speakers.filter((s) => s.order !== sp.order);
              })
            }
            onMoveUp={
              idx > 0
                ? () =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      const prev = d.speakers.find((s) => s.order === speakersSorted[idx - 1].order);
                      if (target && prev) {
                        const tmp = target.order;
                        target.order = prev.order;
                        prev.order = tmp;
                      }
                    })
                : undefined
            }
            onMoveDown={
              idx < speakersSorted.length - 1
                ? () =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
                      const nextSp = d.speakers.find((s) => s.order === speakersSorted[idx + 1].order);
                      if (target && nextSp) {
                        const tmp = target.order;
                        target.order = nextSp.order;
                        nextSp.order = tmp;
                      }
                    })
                : undefined
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
                  value={sp.role}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
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
            <div className="grid grid-cols-2 gap-3">
              <Field label="Session title">
                <input
                  type="text"
                  value={sp.sessionTitle ?? ""}
                  onChange={(e) =>
                    update((d) => {
                      const target = d.speakers.find((s) => s.order === sp.order);
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
                      const target = d.speakers.find((s) => s.order === sp.order);
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
                    const target = d.speakers.find((s) => s.order === sp.order);
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
                  max="10"
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
        <Field label="Gradient colors (comma-separated)">
          <input
            type="text"
            value={data.heroOverlay.gradientColors.join(", ")}
            onChange={(e) =>
              update((d) => {
                d.heroOverlay.gradientColors = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean);
              })
            }
            className="form-input"
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
          <Field label="Image scale (×) — 0.1 = shrink to 10%, 10 = grow 10×">
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
              value={data.heroOverlay.imageScale ?? 1}
              onChange={(e) =>
                update((d) => {
                  d.heroOverlay.imageScale = parseFloat(e.target.value) || 1;
                })
              }
              className="form-input"
            />
          </Field>
          <Field label="Image scale (Y) — 0.1 = shrink to 10%, 10 = grow 10×">
            <input
              type="number"
              step="0.1"
              min="0.1"
              max="10"
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
      </Section>

      {/* ===== LOCATION PINS ===== */}
      <Section title={`Location pins (${data.locationPins.length})`}>
        {data.locationPins.map((pin, idx) => (
          <SubCard
            key={`${pin.label}-${idx}`}
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
          </SubCard>
        ))}
        <AddButton
          label="Add pin"
          onClick={() =>
            update((d) => {
              d.locationPins.push({ label: "New", x: 50, y: 50 });
            })
          }
        />
      </Section>

      {/* ===== SPONSORS / COLLABORATORS ===== */}
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
                  max="4"
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
                  max="4"
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

      {/* ===== BRANDING ===== */}
      <Section title="Branding (bottom-right)">
        <Field label="Image URL">
          <input
            type="url"
            value={data.branding?.imageUrl ?? ""}
            placeholder="https://uojldinyokysycfc.public.blob.vercel-storage.com/brand-assets/1782505047256-bpy1ln.png"
            onChange={(e) =>
              update((d) => {
                d.branding = { ...(d.branding ?? {}), imageUrl: e.target.value || undefined };
              })
            }
            className="form-input"
          />
        </Field>
        <Field label="Height (px)">
          <input
            type="number"
            min="16"
            max="200"
            value={data.branding?.height ?? 48}
            onChange={(e) =>
              update((d) => {
                d.branding = { ...(d.branding ?? {}), height: parseInt(e.target.value, 10) || 48 };
              })
            }
            className="form-input"
          />
        </Field>
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
  onMoveUp,
  onMoveDown,
}: {
  title: string;
  children: React.ReactNode;
  onDelete?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
}) {
  return (
    <div className="rounded-md border border-black/15 bg-white p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-bold text-black">{title}</span>
        <div className="flex items-center gap-1">
          {onMoveUp && (
            <button
              type="button"
              onClick={onMoveUp}
              className="text-black/50 hover:bg-black/5 p-1 rounded"
              title="Move up"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
            </button>
          )}
          {onMoveDown && (
            <button
              type="button"
              onClick={onMoveDown}
              className="text-black/50 hover:bg-black/5 p-1 rounded"
              title="Move down"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
            </button>
          )}
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

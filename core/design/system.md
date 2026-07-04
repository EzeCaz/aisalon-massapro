# Design System

> *The single source of truth for colors, typography, components, and states. Owned by Canvas. Lumen and Forge must reference this file — no off-system styles.*

---

## Colors

### Brand palette

| Name | Hex | Usage |
|---|---|---|
| Magenta | `#FF005A` | Primary accent — CTAs, active states, brand highlights |
| Teal | `#007E72` | Success states, "tagged" indicators |
| Amber | `#FFAC30` | Warning states, "non-member" indicators, scheduled status |
| Blue | `#004F98` | Info states, "sending" status |
| Purple | `#820A7D` | Special highlights, "linked to speaker" indicator |

### Neutrals

| Name | Hex | Usage |
|---|---|---|
| Black | `#000000` | Primary text, active tab background |
| White | `#FFFFFF` | Page background, active tab text |
| Gray-50 | `#F9FAFB` | Hover backgrounds |
| Gray-100 | `#F3F4F6` | Disabled backgrounds |
| Gray-400 | `#9CA3AF` | Placeholder text |
| Gray-600 | `#4B5563` | Secondary text |
| Gray-900 | `#111827` | Headings |

### Semantic

| Name | Hex | Usage |
|---|---|---|
| Success | `#007E72` (teal) | Form success, completed status |
| Warning | `#FFAC30` (amber) | Scheduled status, pending actions |
| Error | `#FF005A` (magenta) | Form errors, failed status |
| Info | `#004F98` (blue) | Informational badges |

---

## Typography

| Role | Font family | Weight | Size (mobile / desktop) |
|---|---|---|---|
| H1 (page title) | Inter, system-ui, sans-serif | 800 (extrabold) | 30px / 36px |
| H2 (section title) | Inter | 700 (bold) | 18px / 20px |
| H3 (subsection) | Inter | 700 (bold) | 16px |
| Body | Inter | 400 (regular) | 14px |
| Small / caption | Inter | 600 (semibold) | 12px |
| Eyebrow (uppercase label) | Inter | 600 (semibold) | 11px, tracking-[0.3em] |
| Code / mono | JetBrains Mono, ui-monospace | 400 | 13px |

For Chinese text (if needed): Noto Sans SC for body, Noto Serif SC for headings.

---

## Spacing Scale

4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 px

Always use multiples of 4. Never use 6, 10, 14, etc.

---

## Border Radius

4 / 6 / 8 / 12 px

- 4px: small badges, tags
- 6px: buttons, inputs
- 8px: cards
- 12px: large containers, modals

---

## Components

### Button

Variants:
- **Primary**: black bg, white text, 6px radius, hover: gray-900 bg
- **Secondary (outline)**: white bg, black border, black text, hover: gray-50 bg
- **Danger**: magenta bg, white text
- **Ghost**: transparent bg, black/60 text, hover: black/5 bg

Sizes:
- sm: 8px/12px padding, 12px font
- default: 12px/16px padding, 14px font

### Card

- White bg
- 1px black/10 border
- 8px radius
- 16px or 24px padding (context-dependent)

### Badge

- 4px radius
- 4px/8px padding
- 11px semibold font
- Color from semantic palette

### Tab (admin)

- 6px radius
- 6px/12px padding (py-1.5 px-3)
- 14px semibold font
- Active: black bg, white text
- Default: transparent bg, black/60 text, hover: black/5 bg
- Highlight (e.g. "Create event"): magenta/10 bg, magenta text

### Form input

- White bg
- 1px black/10 border
- 6px radius
- 8px/12px padding
- Focus: 2px magenta ring (ring-2 ring-[#FF005A])

---

## States (every component must define)

For every interactive component, define:
1. **Default** — the resting state
2. **Hover** — mouse over
3. **Focus** — keyboard focus (must be visible, 2px ring)
4. **Active** — being clicked
5. **Disabled** — gray-100 bg, gray-400 text, cursor-not-allowed
6. **Error** — magenta border, magenta helper text below

For every data-bearing component (list, card, table), define:
1. **Populated** — normal state with data
2. **Empty** — no data, friendly message + CTA
3. **Loading** — spinner or skeleton
4. **Error** — error message + retry button

---

## Changelog

- **v1.0** (2026-06-22) — Initial design system, extracted from existing platform styles.

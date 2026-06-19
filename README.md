# AISalon-MassaPro

> **AI Salon Tel Aviv — community platform**, built by [MassaPro](https://massapro.com).
> Empowering AI connections.

**Live deployment:** <https://aisalon-massapro.vercel.app>

A members-only platform for the AI Salon Tel Aviv chapter: browse events, view speakers & agenda, upload community photos, link them to agenda speakers, and play the shared slideshow.

Built strictly on the [AI Salon Brand Book v1.0](./public/brand-book.md) — AIS BLACK / AIS RED (#FF005A) / AIS CYAN (#00E6FF) palette, AIS GRADIENT, Plus Jakarta Sans typography, low-poly Meerkat motif, and the chapter-polyhedron visual language.

---

## ✨ Features

### Authentication
- **Google OAuth** sign-in (MassaPro.com Google credentials)
- **Dev email fallback** for local testing (any email, no Google needed)
- Single admin: `eze@massapro.com` — everyone else is a community member

### Events
- Event listing with **upcoming / past** split
- Event detail page with 4 tabs:
  - **Overview** — about, takeaways, who it's for, venue, RSVP
  - **Speakers & Agenda** — timeline with talk types (welcome, talk, break, networking, fast pitch)
  - **Photos** — community photo gallery
  - **Slideshow** — auto-playing community slideshow

### Photos
- Drag-and-drop multi-file upload (JPG / PNG / WebP)
- Automatic normalization via `sharp` (max 2200px, JPEG q86)
- Per-image caption
- Per-image **link to speaker(s)** via the photo's tag button
- **Bulk link** — select many photos, link them all to one or more speakers in one action
- Delete (admin or photo owner only)

### Slideshow
- **1.5-second auto-advance** per slide
- **Forward / back arrows** + keyboard `←` / `→`
- `Space` to play/pause
- **Reorder** slides via drag-and-drop (dnd-kit) or ↑ / ↓ arrows — saved to DB
- AIS GRADIENT progress bar showing time-to-next-slide
- Filmstrip thumbnail nav at the bottom

### Admin Panel (`/admin`)
- Only `eze@massapro.com` can access
- Stats dashboard (members, tagged members, events, photos)
- Members table with search
- **Tag assignment** per member — 8 default tags (Speaker, Builder, Investor, Founder, CMO, Product Leader, Growth Marketer, Community Member) using AIS palette colors
- Events list

### Brand Compliance
- Logo: `aisalon` wordmark with mini Meerkat mark, only ever **black or white** (never red/cyan/accent) per brand book p.10
- AIS GRADIENT used as the brand's "signature connector" — appears on every event card, the slideshow progress bar, and the login hero
- Plus Jakarta Sans (Google Font) as primary typeface
- All times displayed in **Asia/Jerusalem** timezone (Tel Aviv chapter)
- Tel Aviv event date combos: `Tel Aviv / [MONTH] [DAY] / ISR`

---

## 🚀 Quick Start

```bash
# Install deps
bun install

# Configure env
cp .env.example .env
# Edit .env — fill in NEXTAUTH_SECRET, Google creds, admin email

# Push DB schema + seed
bun run db:push
bun scripts/seed.ts

# Start dev server
bun run dev
# → open http://localhost:3000
```

The seed script creates:
- Admin user: `eze@massapro.com`
- The **June 18, 2026** event: "The AI CMO Blueprint: Scaling Growth & Agentic Innovation" at Google for Startups Campus TLV
- 4 featured speakers + Ezequiel as host
- 9 agenda items (18:00 → 21:30)

### Sign in
- **As admin (dev):** expand "Dev sign-in", enter `eze@massapro.com`, click "Sign in (dev)"
- **As member (dev):** expand "Dev sign-in", enter any other email
- **Production:** click "Continue with Google" — uses MassaPro Google OAuth creds

---

## 🧱 Tech Stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 (App Router) + TypeScript 5 |
| Styling | Tailwind CSS 4 + shadcn/ui (New York) |
| Database | Prisma ORM + SQLite (dev) — switch to Vercel Postgres or Turso for production |
| Auth | NextAuth.js v4 (Google OAuth + JWT sessions) |
| Image processing | `sharp` (resize, normalize, JPEG re-encode) |
| Drag-and-drop | `@dnd-kit/core` + `@dnd-kit/sortable` |
| Toasts | `sonner` |
| Icons | `lucide-react` |
| Fonts | `Plus Jakarta Sans` (primary) + `Inter` (web-safe fallback) per brand book p.12-13 |

---

## 📁 Project Structure

```
src/
├── app/
│   ├── admin/              # Admin panel (members + events)
│   ├── api/
│   │   ├── auth/[...nextauth]/   # NextAuth handler
│   │   ├── admin/members/        # Member list + tag assignment (admin-only)
│   │   ├── admin/events/         # Event creation (admin-only)
│   │   ├── events/[slug]/        # Event detail + image upload/list
│   │   └── images/[id]           # Image PATCH (link speaker, reorder) / DELETE
│   ├── events/[slug]/      # Event detail with 4 tabs
│   ├── login/              # Branded login (Google + dev fallback)
│   └── layout.tsx          # Root layout with providers
├── components/
│   ├── ais/                # AppHeader, UserMenu, MobileNav
│   └── brand/              # AiSalonLogo, MeerkatMark
├── lib/
│   ├── auth.ts             # NextAuth config (Google + role resolution)
│   ├── db.ts               # Prisma client singleton
│   ├── tags.ts             # Member tag catalog (8 default tags)
│   └── utils.ts            # cn() helper
└── ...

prisma/
└── schema.prisma           # User, MemberTag, Event, Speaker, EventAgendaItem, EventImage

scripts/
└── seed.ts                 # Seeds admin + June 18 event + speakers + agenda
```

---

## 🗄️ Database Schema

```prisma
model User { id, email, name, image, role("ADMIN"|"MEMBER"), tags[], images[], ... }
model MemberTag { id, label, color, userId }     // assigned by admin
model Event { id, slug, title, chapter, venue, startsAt, ..., speakers[], agenda[], images[] }
model Speaker { id, eventId, name, role, company, bio, topic, photoUrl, order, ... }
model EventAgendaItem { id, eventId, startsAt, endsAt, title, type, speakerId, ... }
model EventImage { id, eventId, uploaderId, fileUrl, slideOrder, speakers[], caption, ... }
```

---

## 🔐 Security

- **Auth required** for all routes except `/login` and `/api/auth/*`
- **Admin-only** routes: `/admin`, `/api/admin/*`
- **Image upload/delete** — only the uploader OR an admin
- **Image link/reorder** — any logged-in member (community-curated)
- `.env` is gitignored — never commit secrets

---

## 🌐 Production Deployment (Vercel)

This repo is configured for Vercel. To deploy:

1. **Database**: SQLite doesn't work on Vercel (ephemeral FS). Switch to:
   - [Vercel Postgres](https://vercel.com/docs/storage/vercel-postgres) (recommended), OR
   - [Turso](https://turso.tech/) (hosted libSQL, drop-in for SQLite)
   
   Update `prisma/schema.prisma` `datasource db` provider + `DATABASE_URL` accordingly.

2. **Photo uploads**: `public/uploads/` is also ephemeral on Vercel. Switch to:
   - [Vercel Blob](https://vercel.com/docs/storage/vercel-blob) (recommended), OR
   - S3 / Cloudinary / etc.
   
   Update the upload route (`src/app/api/events/[slug]/images/route.ts`) to upload to Blob instead of local disk.

3. **Environment variables** in Vercel:
   - `DATABASE_URL` — your Postgres/Turso URL
   - `NEXTAUTH_URL` — `https://your-app.vercel.app`
   - `NEXTAUTH_SECRET` — generate fresh
   - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` — MassaPro Google creds
   - `ADMIN_EMAIL` — `eze@massapro.com`

4. **Google OAuth authorized redirect URI**:
   Add `https://your-app.vercel.app/api/auth/callback/google` to the Google Cloud Console OAuth client.

5. Run `bun scripts/seed.ts` against the production DB to seed the admin user + first event.

---

## 📜 Brand Compliance Notes

This platform implements the [AI Salon Brand Book v1.0](./public/brand-book.md):

| Brand rule | Implementation |
|---|---|
| Logo only black or white (p.10) | Logo component accepts `color="black" \| "white"` only |
| Always prioritize HEX colors (p.9) | All colors defined as HEX in `globals.css` |
| Plus Jakarta Sans primary (p.12) | Loaded via `next/font/google` |
| Inter as web-safe fallback (p.13) | Loaded as `--font-inter` fallback |
| AIS GRADIENT as brand connector | Used in event card top strip, slideshow progress bar, login hero orb |
| Lowercase `aisalon` wordmark | All wordmark instances are lowercase |
| Tagline below logo, uppercase | Tagline renders below with `uppercase tracking-[0.18em]` |
| Tel Aviv chapter event combos | Date blocks follow the brand book pattern |

---

## 📝 License

MIT — built by [MassaPro](https://massapro.com) for AI Salon Tel Aviv.

Empowering AI Connections.

# Implementation — QR Salon Mockup

| Field | Value |
|---|---|
| Task | `2026-07-17-qr-salon-mockup` |
| Agent | Z (main) |
| Date | 2026-07-17 |
| Category | SMALL |
| Commit | `04dad9f` |
| Status | Shipped to production via Vercel auto-deploy from `main`. |

---

## Files Created

| File | Purpose |
|---|---|
| `src/app/admin/mockups/qr-salon/page.tsx` | Server component. Auth gate (ADMIN + SUPER_ADMIN or CO_HOST). Renders the editor. |
| `src/app/admin/mockups/qr-salon/qr-salon-editor.tsx` | Client component. Form + JSON editor, canvas preview, PNG export, Share buttons, ImagePickerModal integration, localStorage persistence. |
| `src/app/admin/mockups/qr-salon/qr-salon-canvas.tsx` | Client component. Data-driven canvas renderer (1200×800). Renders QR code, caption, brand mark. Brand mark is draggable + scroll-resizable in edit mode. |
| `src/app/admin/mockups/qr-salon/types.ts` | Type definitions for `QrSalonData`. Includes `DEFAULT_BRANDING_ASSET_URL` constant. |
| `src/app/admin/mockups/qr-salon/sample-data.ts` | Default sample data — QR points to `/events`, caption "Scan to register", brand mark at user-spec defaults. |

## Files Modified

| File | Change |
|---|---|
| `src/app/admin/mockups/mockups-client.tsx` | Appended a 5th card ("5. QR Salon") to the `MOCKUP_TEMPLATES` array. No existing cards changed. |

## API Routes Added

None. The mockup is pure client-side rendering. The QR code is generated in-browser via the `qrcode` library (already a dependency). The brand library picker reuses the existing `/api/admin/brand-images` endpoint.

## Prisma Schema Changes

None.

## Auth / Security

- Page uses the same auth gate as the other 4 mockup templates: `getServerSession(authOptions)` → check `members.view` permission or SUPER_ADMIN email → else redirect to `/events`.
- CO_HOST role (`eventdata.viewCoHosted`) is also allowed, matching the other mockups.
- No new API routes, no new CSRF surface, no PII handling.

## Deploy

- Pushed to `origin/main` at commit `04dad9f`.
- Vercel auto-deployed. Build passed (`✓ Compiled successfully in 35.9s`, route registered as `ƒ /admin/mockups/qr-salon`).
- No DB migration needed.
- No env vars added.

## Self-Review Notes

- The QR wheel-resize handler calls `preventDefault()` on a wheel event, which is a no-op on passive listeners — this means the page will still scroll when the user scrolls on the brand mark. Not a bug, but the resize feedback may feel slightly off on trackpads. Acceptable for SMALL.
- The brand mark hit area is exactly the image size — on very small heights (e.g. 16px) it's hard to grab. Acceptable for SMALL; can be improved in a follow-up if the user reports it.
- The canvas is fixed 1200×800 (3:2). If the user later wants square (1080×1080) or story (1080×1920) formats, that's a follow-up task.

## Signoff

Z (main agent) — self-reviewed. No subagent review per SMALL category.

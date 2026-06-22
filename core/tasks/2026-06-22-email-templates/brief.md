# Task Brief — Email Templates: Create + Save-as-Template

| Field | Value |
|---|---|
| Task ID | `2026-06-22-email-templates` |
| Date | 2026-06-22 |
| Owner | Meridian (coordinating) |
| User request (verbatim) | "On the email tab add the create template and add a button to any existing email to add a new template" |

---

## Restated Goal

Add two capabilities to the Email Campaigns admin tab:

1. **Create Template button** — a top-level button (next to "New campaign") that opens a template editor where the admin can define a reusable email template (name, category, subject, HTML body).
2. **Save as Template button on each campaign row** — on every existing email campaign in the list, add a button that takes that campaign's name + subject + body and saves it as a new template, prefilled, so the admin can quickly reuse a sent campaign's content.

## Acceptance Criteria

- [ ] "Create template" button appears in the email campaigns toolbar next to "New campaign"
- [ ] Clicking it opens a template editor modal/panel with fields: Name, Category, Subject, HTML body (TipTap editor — reuse the one from the campaign composer)
- [ ] Saving a template creates a row in the `EmailTemplate` table and shows a success toast
- [ ] The template list (in the composer's template picker) shows the new template
- [ ] Each campaign row in the list has a "Save as template" button (small, ghost style)
- [ ] Clicking "Save as template" on a campaign creates a new `EmailTemplate` prefilled with that campaign's name (suffixed " (template)"), subject (snapshot), and body (snapshot), then shows a success toast
- [ ] All template CRUD endpoints are admin-only (role === "ADMIN")
- [ ] No existing functionality is broken — the composer still picks templates, campaigns still send

## Scope

**IN**:
- New "Create template" button + template editor UI
- New "Save as template" button on each campaign row
- New API endpoint: `POST /api/admin/email/templates` (create)
- New API endpoint: `POST /api/admin/email/campaigns/[id]/save-as-template` (clone campaign → template)
- Reuse the existing TipTap editor component from the campaign composer

**OUT**:
- Template editing/deletion (create-only for this task; edit/delete can be a follow-up)
- Template categories management (use existing categories as free-text)
- Template variables / merge fields (already exist in the system; not in scope to add more)

## Risks / Unknowns

- The `EmailTemplate` model already exists. Need to verify its fields match what the editor needs.
- The campaign composer already has a template picker — need to make sure new templates appear there.
- The TipTap editor is currently embedded in `campaign-composer.tsx`. May need to extract it into a shared component or duplicate the setup.

## Proposed Owners

- **Atlas** (Gate 2): verify `EmailTemplate` schema — likely no-op since the model exists
- **Canvas** (Gate 3): design the template editor UI + the Save-as-template button placement
- **Aegis** (Gate 4): verify all new routes are admin-only
- **Forge** (Gate 5): implement `POST /api/admin/email/templates` and `POST /api/admin/email/campaigns/[id]/save-as-template`
- **Lumen** (Gate 6): implement the UI (button + editor modal + per-row button)
- **Sentinel** (Gate 7): smoke test — verify templates list still loads, new template appears, save-as-template works
- **Beacon** (Gate 8-9): deploy
- **Codex** (Gate 11): release notes

## Suggested Gate Skips

None. Every gate applies (this is a UI + backend + DB-adjacent task).

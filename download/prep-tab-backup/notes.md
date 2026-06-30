# Prep-Tab Baseline Backup

## Source
- Production deployment: dpl_2a7182Fa1HbiJmm9H7foSkYScx9L
- Git commit: eadfe2d (V5.14: Event prep tab — interactive speaker questions + suggest flow)
- Date: 2026-06-30

## What's in this baseline
- Full V5.14 codebase with Event Prep tab on /events/[slug]
- EventPrepQuestion + EventPrepSuggestion Prisma models
- 40 seeded questions for ai-salon-human event (10 generic + 5 per speaker × 6 speakers)
- Suggest flow: Admin/Co-host propose edits → Super Admin accept/reject

## What's NOT in this baseline (to be added in v5.15)
- SPEAKER user role (Event Prep-only access)
- CO_HOST event-scoped data filtering (5 admin pages)
- Waze URL field + button
- Save to Calendar (iCal/Google/Outlook/Yahoo) on event page + post-registration + email + dashboard

## Database state
- All V5.14 tables exist (EventPrepQuestion, EventPrepSuggestion)
- The v5.14-rbac-utm-preview branch's prisma db push also added:
  - User.referralCode, User.referredById columns
  - PageView, ClickEvent, TrackedLead, MemberShare, ReferralConversion tables
- These extra columns/tables are unused by v5.15 code but harmless (nullable + empty)

## Rollback
- Vercel: `vercel promote dpl_2a7182Fa1HbiJmm9H7foSkYScx9L --scope=ezecazs-projects/aisalon-massapro`
- Git: `git reset --hard eadfe2d`

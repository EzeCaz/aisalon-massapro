# AI Salon Tel Aviv — Source Backups

## v5.16 (current production)
- **File**: `aisalon-massapro-v5.16-source-2026-06-30.tar.gz`
- **Date**: 2026-06-30
- **Git commit**: `6ff2e4b` (pushed to `origin/main`)
- **Vercel deployment**: `dpl_8VKcYA8uzZTT5c` (auto-promoted to production)
- **Contents**:
  - v5.15 baseline (RBAC: SPEAKER role + CO_HOST event-scoped filtering)
  - v5.15 Waze: wazeUrl field + Open in Waze button
  - v5.15 Calendar: Save to Calendar (iCal/Google/Outlook/Yahoo) on 4 surfaces
  - v5.15.2: bulletproof admin tabs (never disappear again)
  - v5.16: Going count pill on /events + event landing pages + Speaker Event Prep access fix
- **Restore**:
  ```bash
  tar -xzf aisalon-massapro-v5.16-source-2026-06-30.tar.gz -C /path/to/aisalon-massapro
  npm install
  # Copy .env.local with DATABASE_URL etc.
  npx prisma generate
  npm run dev   # or: npm run build && npm start
  ```

## v5.14 (prep-tab baseline)
- **Directory**: `prep-tab-backup/`
- **File**: `aisalon-massapro-PREP-TAB-source.tar.gz`
- **Date**: 2026-06-30
- **Git commit**: `eadfe2d` (V5.14: Event prep tab — interactive speaker questions + suggest flow)
- **Vercel deployment**: `dpl_2a7182Fa1HbiJmm9H7foSkYScx9L`
- **Notes**: Baseline before v5.15 RBAC work. See `prep-tab-backup/notes.md`.

## v5.6
- **Directory**: `v5.6-backup/`
- **File**: `aisalon-massapro-V5.6-source.tar.gz`
- **Older baseline** (kept for historical reference)

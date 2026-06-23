/**
 * generate-team-plan.js
 *
 * Generates the unified plan + 9 job descriptions Word document.
 *
 * Output: /home/z/my-project/download/AISalon-Team-Plan-V3.0.docx
 *
 * Structure:
 *   - Section 1 (cover, margin 0): R1-style cover with DS-1 palette
 *   - Section 2 (body, normal margins): TOC + 18 content sections
 *
 * Cover uses a simplified R1 recipe (full-page dark background,
 * left-aligned title, accent paragraph borders) inlined to avoid
 * external dependencies. The cover wrapper is a single 16838-twip
 * table with allNoBorders + exact row height.
 *
 * Body uses Profile A (Formal) fonts:
 *   H1: Times New Roman Bold 16pt
 *   H2: Times New Roman Bold 14pt
 *   Body: Times New Roman 12pt
 *   Line spacing 1.3x (line: 312)
 *
 * Tables use the Horizontal-Only style with DS-1 accent header.
 */

const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  PageBreak,
  PageNumber,
  NumberFormat,
  AlignmentType,
  HeadingLevel,
  WidthType,
  BorderStyle,
  ShadingType,
  PageOrientation,
  TableLayoutType,
  SectionType,
  TableOfContents,
  LevelFormat,
} = require("docx");
const fs = require("fs");
const path = require("path");

// ---------------------------------------------------------------------------
// Palette — DS-1 Deep Sea (dark cover bg + light table accent)
// ---------------------------------------------------------------------------
const P = {
  bg: "0B1C2C",
  primary: "FFFFFF", // cover title
  body: "1A2030", // body text (near-black warm)
  secondary: "506070", // captions
  accent: "529286", // teal accent
  surface: "E8ECEB", // table zebra
  // cover-specific tokens
  titleColor: "FFFFFF",
  subtitleColor: "B0B8C0",
  metaColor: "90989F",
  footerColor: "687078",
  // table tokens (darkened accent for white-page contrast)
  tableHeaderBg: "529286",
  tableHeaderText: "FFFFFF",
  tableAccentLine: "529286",
  tableInnerLine: "BECFCC",
};

const c = (hex) => hex.replace("#", "");
const EN_FONT = "Times New Roman";
const EN_FONT_SANS = "Arial";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = {
  top: NB,
  bottom: NB,
  left: NB,
  right: NB,
  insideHorizontal: NB,
  insideVertical: NB,
};

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 480, after: 240, line: 312 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 32, // 16pt
        color: P.body,
        font: { ascii: EN_FONT, eastAsia: EN_FONT },
      }),
    ],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 160, line: 312 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 28, // 14pt
        color: P.body,
        font: { ascii: EN_FONT, eastAsia: EN_FONT },
      }),
    ],
  });
}

function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 120, line: 312 },
    children: [
      new TextRun({
        text,
        bold: true,
        size: 24, // 12pt
        color: P.body,
        font: { ascii: EN_FONT, eastAsia: EN_FONT },
      }),
    ],
  });
}

function p(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    indent: opts.indent === false ? undefined : { firstLine: 0 },
    children: [
      new TextRun({
        text,
        size: 24, // 12pt
        color: P.body,
        font: { ascii: EN_FONT, eastAsia: EN_FONT },
        ...(opts.bold ? { bold: true } : {}),
        ...(opts.italics ? { italics: true } : {}),
      }),
    ],
  });
}

function bullet(text) {
  return new Paragraph({
    spacing: { line: 312, after: 60 },
    bullet: { level: 0 },
    children: [
      new TextRun({
        text,
        size: 24,
        color: P.body,
        font: { ascii: EN_FONT, eastAsia: EN_FONT },
      }),
    ],
  });
}

function richP(runs, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: runs.map(
      (r) =>
        new TextRun({
          text: r.text,
          size: 24,
          color: r.color || P.body,
          bold: r.bold || false,
          italics: r.italics || false,
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
        })
    ),
    ...(opts.heading ? { heading: opts.heading } : {}),
  });
}

// Build a Horizontal-Only table — DS-1 accent header row + zebra rows.
function dataTable(headers, rows, colWidthsPct) {
  const widths =
    colWidthsPct || headers.map(() => Math.floor(100 / headers.length));

  const headerRow = new TableRow({
    tableHeader: true,
    cantSplit: true,
    children: headers.map(
      (text, i) =>
        new TableCell({
          width: { size: widths[i], type: WidthType.PERCENTAGE },
          shading: { type: ShadingType.CLEAR, fill: P.tableHeaderBg },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [
            new Paragraph({
              spacing: { line: 312 },
              children: [
                new TextRun({
                  text,
                  bold: true,
                  size: 22, // 11pt
                  color: P.tableHeaderText,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                }),
              ],
            }),
          ],
        })
    ),
  });

  const dataRows = rows.map(
    (row, idx) =>
      new TableRow({
        cantSplit: true,
        children: row.map(
          (text, i) =>
            new TableCell({
              width: { size: widths[i], type: WidthType.PERCENTAGE },
              shading:
                idx % 2 === 0
                  ? { type: ShadingType.CLEAR, fill: "FFFFFF" }
                  : { type: ShadingType.CLEAR, fill: P.surface },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [
                new Paragraph({
                  spacing: { line: 312 },
                  children: [
                    new TextRun({
                      text: String(text),
                      size: 20, // 10pt
                      color: P.body,
                      font: { ascii: EN_FONT, eastAsia: EN_FONT },
                    }),
                  ],
                }),
              ],
            })
        ),
      })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: {
      top: { style: BorderStyle.SINGLE, size: 6, color: P.tableAccentLine },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: P.tableAccentLine },
      left: NB,
      right: NB,
      insideHorizontal: {
        style: BorderStyle.SINGLE,
        size: 1,
        color: P.tableInnerLine,
      },
      insideVertical: NB,
    },
    rows: [headerRow, ...dataRows],
  });
}

// ---------------------------------------------------------------------------
// Cover — simplified R1 (Pure Paragraph Left)
// ---------------------------------------------------------------------------
function buildCover() {
  const padL = 1200,
    padR = 800;
  const titleLines = [
    "AI Salon Tel Aviv",
    "Engineering Team Plan V3.0",
  ];
  const titlePt = 36;
  const titleSize = titlePt * 2; // 72 half-pts

  const children = [];

  // Top whitespace
  children.push(new Paragraph({ spacing: { before: 2200 } }));

  // English label with accent bottom border
  children.push(
    new Paragraph({
      indent: { left: padL, right: padR },
      spacing: { after: 500 },
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: P.accent,
          space: 8,
        },
      },
      children: [
        new TextRun({
          text: "T E A M   O P E R A T I N G   P L A N",
          size: 18,
          color: P.accent,
          font: { ascii: EN_FONT_SANS, eastAsia: EN_FONT_SANS },
          characterSpacing: 40,
        }),
      ],
    })
  );

  // Title lines
  for (let i = 0; i < titleLines.length; i++) {
    children.push(
      new Paragraph({
        indent: { left: padL },
        spacing: {
          after: i < titleLines.length - 1 ? 100 : 300,
          line: Math.ceil(titlePt * 23),
          lineRule: "atLeast",
        },
        children: [
          new TextRun({
            text: titleLines[i],
            size: titleSize,
            bold: true,
            color: P.titleColor,
            font: { ascii: EN_FONT_SANS, eastAsia: EN_FONT_SANS },
          }),
        ],
      })
    );
  }

  // Subtitle
  children.push(
    new Paragraph({
      indent: { left: padL },
      spacing: { after: 800 },
      children: [
        new TextRun({
          text: "Unified Plan + Role Job Descriptions for 9 Specialists",
          size: 24,
          color: P.subtitleColor,
          font: { ascii: EN_FONT_SANS, eastAsia: EN_FONT_SANS },
        }),
      ],
    })
  );

  // Meta info lines with left accent border
  const metaLines = [
    "Prepared for: Eze Cazares · MassaPro",
    "Date: 23 June 2026",
    "Version: V3.0",
    "Distribution: Internal — MassaPro Engineering",
    "Codebase: aisalon.massapro.com",
  ];
  for (const line of metaLines) {
    children.push(
      new Paragraph({
        indent: { left: padL + 200 },
        spacing: { after: 80 },
        border: {
          left: {
            style: BorderStyle.SINGLE,
            size: 8,
            color: P.accent,
            space: 12,
          },
        },
        children: [
          new TextRun({
            text: line,
            size: 24,
            color: P.metaColor,
            font: { ascii: EN_FONT_SANS, eastAsia: EN_FONT_SANS },
          }),
        ],
      })
    );
  }

  // Bottom whitespace
  children.push(new Paragraph({ spacing: { before: 2200 } }));

  // Footer with top accent separator
  children.push(
    new Paragraph({
      indent: { left: padL, right: padR },
      border: {
        top: {
          style: BorderStyle.SINGLE,
          size: 2,
          color: P.accent,
          space: 8,
        },
      },
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: "Confidential — MassaPro",
          size: 16,
          color: P.footerColor,
          font: { ascii: EN_FONT_SANS },
        }),
        new TextRun({ text: "                                        " }),
        new TextRun({
          text: "aisalon.massapro.com",
          size: 16,
          color: P.footerColor,
          font: { ascii: EN_FONT_SANS },
        }),
      ],
    })
  );

  // Single 16838 wrapper table
  return [
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      layout: TableLayoutType.FIXED,
      borders: allNoBorders,
      rows: [
        new TableRow({
          height: { value: 16838, rule: "exact" },
          children: [
            new TableCell({
              shading: { type: ShadingType.CLEAR, fill: P.bg },
              borders: noBorders,
              children,
            }),
          ],
        }),
      ],
    }),
  ];
}

// ---------------------------------------------------------------------------
// Body content
// ---------------------------------------------------------------------------
function buildBody() {
  const body = [];

  // ---------- TOC ----------
  body.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 480, after: 360 },
      children: [
        new TextRun({
          text: "Table of Contents",
          bold: true,
          size: 32,
          color: P.body,
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
        }),
      ],
    })
  );
  body.push(
    new TableOfContents("Table of Contents", {
      hyperlink: true,
      headingStyleRange: "1-3",
    })
  );
  body.push(
    new Paragraph({
      spacing: { before: 200 },
      children: [
        new TextRun({
          text: 'Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select "Update Field."',
          italics: true,
          size: 18,
          color: "888888",
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
        }),
      ],
    })
  );
  body.push(new Paragraph({ children: [new PageBreak()] }));

  // ---------- Section 1: Executive Summary ----------
  body.push(h1("1. Executive Summary"));
  body.push(
    p(
      "This document is the operating plan for the AI Salon Tel Aviv engineering team following the V3.0 release. It exists because the V3.0 deploy surfaced a real gap: a finished, tested codebase sat in the local working tree for over an hour with no path to production because no Vercel token, no deploy hook, and no GitHub push access were available in the build environment. The plan in this document exists to make sure that never happens again, and to give the team a clear charter for the next four quarters."
    )
  );
  body.push(
    p(
      "The plan addresses four goals: improving system capability, hardening deploy stability so no version ships with feature loss, backing up all documentation and versions to an external drive, and enabling CSV/XLS bulk uploads to the members and registrants lists. Each goal is broken into concrete initiatives with named owners, acceptance criteria, and a quarter-by-quarter timeline. The first goal (CSV/XLS bulk upload) is already implemented in this session — the API, UI, and downloadable templates are live in the codebase and verified by a clean production build."
    )
  );
  body.push(
    p(
      "The plan also formalizes the team structure as nine specialist roles, each with a standard two-page job description covering mission, capabilities, procedures, methodology, reporting lines, KPIs, tools, escalation rules, and deliverable templates. The roles are: Technical Architect, Frontend Developer, Backend Developer, DevOps & Release Engineer, QA & Test Engineer, Database Engineer, Documentation & Knowledge Manager, Security Engineer, and Product & Project Manager. A cross-team RACI matrix at the end of the document clarifies who is Responsible, Accountable, Consulted, and Informed on every key activity."
    )
  );
  body.push(
    p(
      "This is a living document. The Documentation & Knowledge Manager owns keeping it current; every quarterly retrospective ends with a refresh pass so the plan reflects what the team actually does, not what it intended to do three months ago."
    )
  );

  // ---------- Section 2: Current State Assessment ----------
  body.push(h1("2. Current State Assessment"));
  body.push(
    p(
      "The AI Salon Tel Aviv platform is a Next.js 16 application deployed on Vercel, with Prisma as the ORM layer over a SQLite database in development and a managed PostgreSQL database (Neon) in production. Authentication is handled through NextAuth with Google OAuth and email/password fallback. The codebase currently exposes roughly fifty routes covering the public event pages, member profile, admin dashboards for members, registrants, speakers, and email campaigns, and a comprehensive REST API. The GitHub repository lives at EzeCaz/aff-massapro and the Vercel project ID is prj_aoKtARAel8wlmcIlLRjjSPKshMLA."
    )
  );
  body.push(
    p(
      "The V3.0 release shipped six features: a 600-pixel-wide email editor preview that matches the rendered email, click-to-edit on every member/registrant/speaker name in the admin tables, an explicit Edit button on every row, a combobox company-name field that suggests existing companies or accepts a new one, removal of the four-picture cap on speaker images with a slideshow viewer and drag-to-reorder, and a V3.0 backup tarball. All six were committed and a clean production build was verified locally. The blocker was getting that build to production."
    )
  );
  body.push(
    p(
      "Three structural issues were exposed. First, no Vercel token or deploy hook is available in the agent build environment, so deploys have to be triggered manually by a human with Vercel credentials. Second, the local main branch has diverged from origin/main by fifty-two commits ahead and thirty-nine commits behind — the repo is not a clean mirror of what runs in production. Third, there is no automated regression test suite, so the only verification of a deploy is a manual smoke test. Each of these is addressed in Goal 2 below."
    )
  );
  body.push(h2("2.1 Platform Facts"));
  body.push(
    dataTable(
      ["Attribute", "Value"],
      [
        ["Framework", "Next.js 16 (App Router, React 19, TypeScript 5.x)"],
        ["ORM", "Prisma 6.19"],
        ["Database (dev)", "SQLite at db/custom.db"],
        ["Database (prod)", "Neon managed PostgreSQL"],
        ["Hosting", "Vercel — aisalon.massapro.com"],
        ["Authentication", "NextAuth (Google OAuth + email/password)"],
        ["Source control", "GitHub — EzeCaz/aff-massapro"],
        ["Vercel project ID", "prj_aoKtARAel8wlmcIlLRjjSPKshMLA"],
        ["Team ID", "team_xQgfSmNbNo5JFCAaVyRboPBf"],
        ["Approximate route count", "~50 routes (admin, API, public)"],
        ["Approximate source file count", "~30 src/ files (excl. UI primitives)"],
        ["Current production version", "V2.x (V3.0 deploy pending — see Goal 2)"],
        ["Backup cadence", "Manual tarball on demand (V3.0 saved)"],
      ],
      [40, 60]
    )
  );

  // ---------- Section 3: Goal 1 — Improve System Capability ----------
  body.push(h1("3. Goal 1 — Improve System Capability"));
  body.push(
    p(
      "System capability is the sum of what the platform can do for members, speakers, and admins. V3.0 closed several long-standing gaps (speaker chat, email campaigns, image reorder, slideshow viewer, member profile fields, click-to-edit on every list). The next four quarters should focus on three capability tracks: feature backlog grooming, performance, and accessibility. Each track has a named owner from the nine-role team and a measurable acceptance criterion."
    )
  );
  body.push(h2("3.1 Proposed V3.1 Feature Backlog"));
  body.push(
    p(
      "The following features have been requested by members or surfaced through admin usage patterns. They are prioritized by impact divided by effort. The Product & Project Manager owns sequencing; the Technical Architect owns feasibility spikes; the relevant developer role owns implementation."
    )
  );
  body.push(
    dataTable(
      ["Feature", "Owner", "Effort", "Impact"],
      [
        ["Registrant check-in QR code (per-event)", "Frontend + Backend", "M", "High"],
        ["Member directory search (company, tag, bio)", "Frontend", "S", "High"],
        ["Event analytics dashboard (RSVPs, attendance)", "Backend + Frontend", "L", "High"],
        ["iCal export for events", "Backend", "S", "Medium"],
        ["Hebrew localization (i18n)", "Frontend", "L", "High"],
        ["Speaker message threading", "Backend", "M", "Medium"],
        ["Email campaign A/B testing", "Backend", "L", "Medium"],
        ["Image auto-tagging (face detection)", "Backend", "L", "Low"],
      ],
      [45, 25, 10, 20]
    )
  );
  body.push(h2("3.2 Performance Work"));
  body.push(
    p(
      "Performance is a feature. The current Lighthouse score on the public event page is good but the admin pages are unmeasured. The Frontend Developer owns a quarterly Lighthouse audit on every top-level route, with a budget of 90+ on Performance, Accessibility, Best Practices, and SEO. The Backend Developer owns an API P95 latency budget of 200ms for read endpoints and 800ms for write endpoints, measured via Vercel logs and surfaced in a weekly report."
    )
  );
  body.push(
    bullet("Audit Next.js route segment config — every admin route should be `dynamic = 'force-dynamic'` only when it actually needs to be; static-rendered public pages wherever possible.")
  );
  body.push(
    bullet("Image optimization audit — every `next/image` should declare width/height or use `fill` with sized container; no `unoptimized` exports in production.")
  );
  body.push(
    bullet("Prisma query review — every list endpoint should use `select` (not `include` of full relations) and `take` pagination on heavy relations.")
  );
  body.push(h2("3.3 Accessibility (WCAG 2.1 AA)"));
  body.push(
    p(
      "Accessibility is non-negotiable for a community platform. The QA & Test Engineer owns a quarterly axe-core audit on every route, with zero serious or critical violations as the acceptance criterion. The Frontend Developer owns remediation. Common issues to look for: missing form labels, color contrast below 4.5:1 on the pink brand accent, keyboard navigation traps in dialogs, missing alt text on user-uploaded images."
    )
  );

  // ---------- Section 4: Goal 2 — Deploy Stability ----------
  body.push(h1("4. Goal 2 — Deploy Stability & Version Continuity"));
  body.push(
    p(
      "The V3.0 deploy gap was caused by four converging factors: no Vercel token in the agent environment, a diverged git history between local main and origin/main, no pre-deploy smoke test gate, and no rollback runbook. Each factor maps to a concrete fix below. The DevOps & Release Engineer owns this entire goal; the Architect owns branch reconciliation; QA owns the smoke test gate."
    )
  );
  body.push(h2("4.1 Root Causes and Fixes"));
  body.push(
    dataTable(
      ["Root Cause", "Fix", "Owner", "Target Quarter"],
      [
        ["No VERCEL_TOKEN in agent env", "Set up Vercel GitHub integration — pushes to main auto-deploy, no CLI token needed", "DevOps", "Q1"],
        ["Diverged git branches (52 ahead, 39 behind)", "Reconcile: rebase local main onto origin/main, force-push only after backup tag", "Architect", "Q1"],
        ["No pre-deploy smoke test gate", "GitHub Actions CI runs lint + typecheck + build + smoke on every PR; merge blocked on red", "QA + DevOps", "Q1"],
        ["No rollback runbook", "Document Vercel instant rollback (one click in dashboard); add to ops runbook", "DevOps", "Q1"],
        ["No version tags", "Tag every release: v3.0.0, v3.1.0, etc. with GitHub Release + changelog", "DevOps + Docs", "Q1"],
        ["No post-deploy verification", "Extend scripts/prod-smoke-test.mjs to hit new endpoints after every deploy", "QA", "Q1"],
      ],
      [30, 35, 15, 20]
    )
  );
  body.push(h2("4.2 Pre-Deploy Checklist"));
  body.push(
    p(
      "Every production deploy must pass this checklist. The DevOps & Release Engineer runs it; the QA & Test Engineer signs off. The checklist is encoded in scripts/pre-deploy-check.sh (to be created in Q1) so it cannot be skipped."
    )
  );
  body.push(bullet("Local `bun run build` exits 0 with no new TypeScript errors."));
  body.push(bullet("`git status` is clean — no uncommitted changes."));
  body.push(bullet("`git log origin/main..HEAD` shows only the intended commits."));
  body.push(bullet("All new API routes have at least one smoke-test curl command in scripts/prod-smoke-test.mjs."));
  body.push(bullet("Database migrations (if any) have been run on staging and verified."));
  body.push(bullet("Vercel env vars match .env.example (no drift)."));
  body.push(bullet("A V3.x.x git tag has been created and pushed."));
  body.push(h2("4.3 Rollback Procedure"));
  body.push(
    p(
      "If a deploy misbehaves, the DevOps & Release Engineer executes a Vercel instant rollback from the dashboard (Deployments tab → previous deployment → Promote to Production). This is a one-click operation and takes effect within seconds. After rollback, the engineer files an incident report (template in the Documentation & Knowledge Manager's deliverables) and the team conducts a postmortem within 48 hours. The postmortem is added to docs/postmortems/ in the repo."
    )
  );

  // ---------- Section 5: Goal 3 — External Backup ----------
  body.push(h1("5. Goal 3 — External Backup (GitHub + Vercel)"));
  body.push(
    p(
      "The team treats GitHub (for code, docs, and version tags) and Vercel (for production builds) as the external drive. Both are durable, geographically replicated, and accessible to anyone with the right credentials. This goal is owned by the Documentation & Knowledge Manager with the DevOps & Release Engineer as peer."
    )
  );
  body.push(h2("5.1 Backup Matrix"));
  body.push(
    dataTable(
      ["Asset", "Backup Target", "Cadence", "Retention", "Owner"],
      [
        ["Source code", "GitHub main + release tags", "Every commit", "Indefinite", "DevOps"],
        ["Markdown docs (worklog, brand-book, ADRs, briefs)", "GitHub docs/ folder", "Every commit", "Indefinite", "Docs Manager"],
        ["V3.x version tarballs", "GitHub Release assets", "Every release", "Last 10", "DevOps + Docs"],
        ["Production builds", "Vercel deployments list (immutable)", "Every deploy", "90 days (Pro)", "DevOps"],
        ["Dev SQLite DB", "GitHub Release asset (encrypted)", "Every release", "Last 10", "DevOps"],
        ["Production PostgreSQL", "Vercel-managed daily backups", "Daily", "30 days", "DevOps"],
        ["Email campaign content", "GitHub (in DB via Prisma)", "Every commit", "Indefinite", "Backend"],
        ["User-uploaded images", "Vercel Blob (when configured)", "On upload", "Indefinite", "Backend"],
      ],
      [25, 25, 15, 15, 20]
    )
  );
  body.push(h2("5.2 Backup Procedure"));
  body.push(
    p(
      "Every release follows this backup procedure, encoded in scripts/backup-to-github.sh (to be created in Q1 by the DevOps & Release Engineer). The script is idempotent — safe to re-run."
    )
  );
  body.push(bullet("Verify clean working tree (git status)."));
  body.push(bullet("Create git tag v3.x.0 from current HEAD."));
  body.push(bullet("Build the V3.x tarball via scripts/make-v3-backup.sh."));
  body.push(bullet("Push the tag to origin: `git push origin v3.x.0`."));
  body.push(bullet("Create a GitHub Release from the tag, attaching the tarball as an asset (via gh CLI or API)."));
  body.push(bullet("Prune older releases — keep the last 10."));
  body.push(bullet("Append a worklog entry with the release tag, tarball hash, and key changes."));
  body.push(h2("5.3 Recovery Procedure"));
  body.push(
    p(
      "Recovery is the inverse of backup. To restore the platform from scratch on a new Vercel account:"
    )
  );
  body.push(bullet("Clone the repo: `git clone https://github.com/EzeCaz/aff-massapro.git && cd aff-massapro`."));
  body.push(bullet("Install dependencies: `bun install`."));
  body.push(bullet("Download the latest release tarball from GitHub Releases and extract the dev SQLite DB to db/custom.db (for local dev)."));
  body.push(bullet("Link the Vercel project: `vercel link` (pick the existing project)."));
  body.push(bullet("Set env vars on Vercel (NEXTAUTH_URL, NEXTAUTH_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ADMIN_EMAIL, DATABASE_URL)."));
  body.push(bullet("Deploy: `vercel --prod`."));
  body.push(bullet("Run scripts/prod-smoke-test.mjs to verify."));

  // ---------- Section 6: Goal 4 — CSV/XLS Bulk Upload (IMPLEMENTED) ----------
  body.push(h1("6. Goal 4 — CSV/XLS Bulk Upload to Lists (Implemented)"));
  body.push(
    p(
      "This goal is fully implemented in this session. Admins can now bulk-import members and event registrants from any CSV, XLS, or XLSX file directly from the admin tables. The feature includes a downloadable CSV template, a result summary showing inserted/updated/skipped counts, and a per-row error report for skipped rows."
    )
  );
  body.push(h2("6.1 User Interface"));
  body.push(
    p(
      "An 'Import CSV/XLS' button is now in the toolbar of both the Admin Members table and the Admin Registrants table. Clicking it opens a dialog with a file picker (accepts .csv, .xls, .xlsx), a 'CSV template' download button, and an Import action. After upload, the dialog shows a three-card summary (New / Updated / Skipped) and a list of the first fifty row-level errors so the admin can fix the source file and re-import."
    )
  );
  body.push(
    p(
      "For the registrants import, the dialog also includes a target-event picker so the admin can choose which event the RSVPs belong to. The picker defaults to the currently-selected event filter or the first event if 'All events' is selected."
    )
  );
  body.push(h2("6.2 API"));
  body.push(
    p(
      "Two new POST endpoints accept multipart/form-data with the file (and an eventId for registrants), parse with the xlsx npm package, validate required columns, and upsert rows in a loop so a single bad row does not abort the whole import. Two GET endpoints return a downloadable CSV template with the correct column headers and an example row."
    )
  );
  body.push(
    dataTable(
      ["Endpoint", "Method", "Body", "Returns"],
      [
        ["/api/admin/members/bulk-import", "POST", "multipart: file", "{inserted, updated, skipped, errors[]}"],
        ["/api/admin/members/import-template", "GET", "—", "text/csv attachment"],
        ["/api/admin/registrants/bulk-import", "POST", "multipart: file, eventId", "{inserted, updated, skipped, errors[], eventTitle}"],
        ["/api/admin/registrants/import-template", "GET", "—", "text/csv attachment"],
      ],
      [40, 10, 25, 25]
    )
  );
  body.push(h2("6.3 Supported Columns"));
  body.push(
    p(
      "For members, the supported columns (case-insensitive) are: name, email (required), company, companyUrl, linkedinUrl, portfolioUrl, bio, mobile, interestedIn, profileCategories, appliedFor, invitedToSpeak. For registrants: email (required), name, status (GOING/MAYBE/NOT_GOING, default GOING), source (IMPORT/MANUAL/EVENT_PAGE, default IMPORT)."
    )
  );
  body.push(h2("6.4 Behavior"));
  body.push(
    p(
      "Existing rows are updated, not duplicated. For members, an existing email triggers an upsert with non-empty fields from the spreadsheet overwriting the stored values — this lets admins re-import to refresh data. For registrants, the (eventId, email) pair is the unique key, so importing the same spreadsheet twice is idempotent. Invalid emails are skipped and listed in the response with row number and reason. The whole operation is audit-logged: every import sets importSource to 'bulk-import:filename' on affected member rows so they're identifiable in the admin table."
    )
  );
  body.push(h2("6.5 Sample CSV"));
  body.push(
    p(
      "A sample members CSV looks like this (downloadable from /api/admin/members/import-template):"
    )
  );
  body.push(
    dataTable(
      ["name", "email", "company", "appliedFor"],
      [
        ["Eze Cazares", "eze@massapro.com", "MassaPro", "Fast pitch"],
        ["Jane Doe", "jane@example.com", "Acme", "Presentation/Lecture"],
      ],
      [30, 30, 20, 20]
    )
  );

  // ---------- Section 7: Team Structure ----------
  body.push(h1("7. Team Structure — 9 Specialist Roles"));
  body.push(
    p(
      "The team is structured as nine specialist roles. Each role has a single mission and is the primary owner of one or more of the four goals above. Roles are not headcount — one person may wear multiple hats, and an outside contractor may fill a role. What matters is that every role has a named, accountable owner at any given time."
    )
  );
  body.push(
    dataTable(
      ["#", "Role", "Mission (1 line)", "Primary Goal Owner"],
      [
        ["1", "Technical Architect", "Owns system design and technical strategy", "Goal 1 (Capability)"],
        ["2", "Frontend Developer", "Builds accessible, responsive UI", "Goal 1 (Capability)"],
        ["3", "Backend Developer", "Builds API routes, business logic, integrations", "Goal 1 (Capability)"],
        ["4", "DevOps & Release Engineer", "Owns deploys, CI/CD, infrastructure", "Goal 2 (Deploy Stability)"],
        ["5", "QA & Test Engineer", "Owns test strategy and regression prevention", "Goal 2 (Deploy Stability)"],
        ["6", "Database Engineer", "Owns schema, migrations, query performance", "Goal 1 (Capability)"],
        ["7", "Documentation & Knowledge Manager", "Owns docs, worklog, version tags, runbooks", "Goal 3 (Backup)"],
        ["8", "Security Engineer", "Owns auth, secrets, vulnerability management", "Goal 2 (Deploy Stability)"],
        ["9", "Product & Project Manager", "Owns backlog, priorities, stakeholder comms", "All four goals"],
      ],
      [5, 25, 50, 20]
    )
  );
  body.push(
    p(
      "The nine roles collaborate asynchronously via the worklog at /home/z/my-project/worklog.md. Every task gets a Task ID, an assigned role, and a worklog entry on completion. A weekly 30-minute sync covers cross-team handoffs and blockers. The Product & Project Manager facilitates; the Technical Architect is consulted on any decision with system-wide impact. A more detailed RACI matrix appears in Section 17."
    )
  );

  // ---------- Section 8-16: Job Descriptions ----------
  // We define a helper to render one JD section.
  function jd({
    num,
    title,
    mission,
    capabilities,
    procedures,
    methodology,
    reportingLines,
    kpis,
    tools,
    escalation,
    deliverables,
  }) {
    const out = [h1(`${num}. Job Description — ${title}`)];
    out.push(h2("Role Summary"));
    out.push(p(mission));
    out.push(h2("Core Capabilities"));
    capabilities.forEach((c) => out.push(bullet(c)));
    out.push(h2("Key Procedures"));
    procedures.forEach((c) => out.push(bullet(c)));
    out.push(h2("Working Methodology"));
    out.push(p(methodology));
    out.push(h2("Reporting Lines"));
    out.push(p(reportingLines));
    out.push(h2("KPIs"));
    kpis.forEach((c) => out.push(bullet(c)));
    out.push(h2("Tools & Stack"));
    out.push(p(tools));
    out.push(h2("Escalation Rules"));
    out.push(p(escalation));
    out.push(h2("Deliverable Templates"));
    deliverables.forEach((c) => out.push(bullet(c)));
    return out;
  }

  // JD 1 — Technical Architect
  body.push(
    ...jd({
      num: 8,
      title: "Technical Architect",
      mission:
        "The Technical Architect owns the system design and technical strategy for the AI Salon Tel Aviv platform. They are the single source of truth for how the codebase is structured, why it is structured that way, and what the acceptable trade-offs are when a new feature or refactor is proposed. Their job is to make the team faster by removing ambiguity, not to gate every change. They write Architecture Decision Records (ADRs) for non-obvious decisions and review PRs that touch shared infrastructure.",
      capabilities: [
        "Next.js 16 App Router architecture (route segments, layouts, server vs client components, server actions)",
        "Prisma schema design and migration strategy (PostgreSQL + SQLite dev parity)",
        "REST API design with Next.js Route Handlers (auth, validation, error handling, idempotency)",
        "TypeScript type system and code organization (path aliases, barrel exports, generic patterns)",
        "Performance tuning (Next.js route segment config, image optimization, Prisma query analysis, Vercel Edge vs Node runtime)",
        "Technical risk assessment (third-party dependencies, breaking changes, security posture)",
        "Cross-team technical alignment (frontend ↔ backend ↔ DevOps ↔ DB ↔ Security)",
        "Code review with focus on architectural fit, not style nitpicks",
      ],
      procedures: [
        "Author an ADR for every architectural decision that affects more than one file or that the team will not be able to easily reverse. ADRs live in docs/adr/ in the repo.",
        "Convene an architecture review (30 min, async or sync) for any PR that adds a new top-level route, changes the Prisma schema, or modifies auth.",
        "Run a tech-debt grooming session at the start of every quarter. Output: a prioritized list of tech-debt items with effort estimates.",
        "Run a spike (time-boxed to 1 day) before any feature estimated at L or XL. The spike produces a one-page report with a recommended approach.",
        "Escalate to the Product & Project Manager any time a technical constraint changes the scope of a committed feature.",
      ],
      methodology:
        "Async-first. ADR-driven. Evidence-based decisions — every recommendation cites a measurement (Lighthouse score, query plan, bundle size). Mentor-not-gatekeeper: the architect's job is to make other developers able to ship safely without their involvement on every PR. They write down what they know so the team scales.",
      reportingLines:
        "Reports to the Product & Project Manager. Peers with the DevOps & Release Engineer and the Security Engineer (jointly own infrastructure decisions). Mentor to the Frontend, Backend, and Database Engineers.",
      kpis: [
        "Architectural drift score: number of PRs merged in the last quarter that violate an ADR without an updated ADR. Target: 0.",
        "P95 latency of the slowest API endpoint. Target: under 200ms for reads, 800ms for writes.",
        "Tech-debt burndown: number of tech-debt items closed vs. opened per quarter. Target: net negative.",
        "Code review SLA: median time from PR open to architect review. Target: under 4 working hours.",
      ],
      tools:
        "Next.js 16, Prisma 6, TypeScript 5, Vercel, Neon Postgres, GitHub, GitHub Actions, Mermaid (for diagrams in ADRs), the worklog.md file.",
      escalation:
        "Escalate to the Product & Project Manager when a technical decision changes committed scope or timeline. Escalate to the Security Engineer when a decision touches authentication, session handling, or secrets. Convene an ad-hoc architecture review when a PR introduces a new external dependency or a new database table.",
      deliverables: [
        "ADR template: Context · Decision · Consequences · Alternatives Considered.",
        "Spike report template: Question · Approach · Findings · Recommendation · Time spent.",
        "Quarterly tech-debt register: item, owner, effort, impact, status.",
      ],
    })
  );

  // JD 2 — Frontend Developer
  body.push(
    ...jd({
      num: 9,
      title: "Frontend Developer",
      mission:
        "The Frontend Developer turns design intent and product requirements into accessible, responsive, performant React components. They own the user-facing surface of the platform — every page, every form, every dialog, every keyboard interaction. They are responsible for the platform passing a WCAG 2.1 AA audit and for the Lighthouse Performance score staying above 90 on every top-level route.",
      capabilities: [
        "React 19 + Next.js 16 App Router (server components, client components, server actions, route handlers)",
        "TypeScript with strict mode — no `any` in shipped code without a comment justifying it",
        "Tailwind CSS 4 + shadcn/ui + Radix primitives (the existing stack)",
        "Form handling with react-hook-form + zod (validation schemas shared with the backend where possible)",
        "Client-side state management (URL state, useState, server-state via fetch + SWR pattern)",
        "Image optimization with next/image (width/height, blur placeholders, lazy loading)",
        "Accessibility — semantic HTML, ARIA roles, keyboard navigation, focus trapping in dialogs",
        "i18n readiness — extract user-facing strings, support RTL for Hebrew",
      ],
      procedures: [
        "Component-driven development — every new UI element is built in isolation first, then wired into its page. The existing shadcn/ui pattern supports this.",
        "Prop type review on every new component — props should be minimal, typed, and have sensible defaults.",
        "Accessibility checklist before every PR: keyboard navigable, screen-reader labels present, color contrast passes, focus visible.",
        "Visual regression check on shared components — if a shadcn/ui primitive is touched, manually verify it still renders correctly in the 3-4 places it's used.",
        "Bundle size check on every PR that adds a dependency — run `bun run build` and report the new bundle size in the PR description if it grew by more than 5 KB.",
      ],
      methodology:
        "Mobile-first. Design-system-first (no inline styles, no one-off colors outside the brand palette). Semantic HTML before ARIA. Server components by default; client components only when interactivity requires them. Every form field has a label. Every interactive element has a focus ring. Every image has alt text or `alt=''` if decorative.",
      reportingLines:
        "Reports to the Technical Architect. Peers with the Backend Developer (jointly own API contract design) and the UX/UI Designer (if/when one joins). Works closely with the QA & Test Engineer on accessibility audits.",
      kpis: [
        "Lighthouse Performance score on every top-level route. Target: 90+.",
        "Accessibility audit pass rate (axe-core). Target: 0 serious or critical violations per quarter.",
        "Bundle size of the largest route. Target: under 250 KB gzipped.",
        "Component reuse rate — number of times a new component is reused across the app within one quarter of being built. Target: at least 1.5x reuse.",
      ],
      tools:
        "Next.js 16, Tailwind CSS 4, shadcn/ui, Radix UI, react-hook-form, zod, Chrome DevTools, Lighthouse CI, axe-core (via browser extension or @axe-core/playwright).",
      escalation:
        "Escalate to the Technical Architect when a UI requirement implies a new top-level route, a schema change, or a new external dependency. Escalate to the Backend Developer when an API response shape doesn't match what the UI needs. Escalate to the Product & Project Manager when a design cannot be implemented within the current sprint's scope.",
      deliverables: [
        "Component README — props table, usage example, accessibility notes, screenshot.",
        "PR description template: What changed, screenshots (before/after), bundle size delta, a11y check result.",
        "Accessibility checklist (per WCAG 2.1 AA) — checked off in every PR description.",
      ],
    })
  );

  // JD 3 — Backend Developer
  body.push(
    ...jd({
      num: 10,
      title: "Backend Developer",
      mission:
        "The Backend Developer owns the API surface and the business logic behind it. Every route handler, every Prisma query, every background job, every external integration is their responsibility. They ensure the API is consistent, typed, authenticated, and observable. They work hand-in-hand with the Database Engineer on schema and with the Frontend Developer on the response shapes the UI consumes.",
      capabilities: [
        "Next.js Route Handlers (GET, POST, PATCH, DELETE) with proper status codes and JSON responses",
        "Prisma ORM — schema, migrations, queries, transactions, the N+1 trap",
        "PostgreSQL + SQLite — knows the differences and writes queries that work on both",
        "NextAuth — session management, OAuth providers, email/password fallback, role checks",
        "Email + cron integrations — Vercel Cron, Resend/Postmark, templated HTML emails",
        "File upload pipelines — multipart/form-data parsing, Vercel Blob storage, image processing",
        "Error handling — try/catch at the route boundary, structured error responses, no leaked stack traces in production",
        "Transactional consistency — when a single API call touches multiple tables, it runs in a transaction",
      ],
      procedures: [
        "API design review on every new endpoint — method, path, request body, response body, status codes, auth requirement, error cases. Documented in the route file as a JSDoc comment block (existing pattern).",
        "Schema migration review — every migration is reviewed by the Database Engineer before merging. Destructive migrations require a backup tag first.",
        "Integration test on every new endpoint — at minimum, a curl command in scripts/prod-smoke-test.mjs that hits the endpoint and asserts the response.",
        "Rate-limit + auth check before deploy — every new endpoint gets a `getServerSession` check (or a comment explaining why it's public), and a rate-limit decision documented.",
        "Error log review — every PR that touches error handling includes a check that no `console.error` is left in production paths; errors go to Vercel logs with structured context.",
      ],
      methodology:
        "Schema-first. Typed endpoints (request and response bodies typed in TypeScript). No `any` in route handlers. Every route has a co-located JSDoc block explaining what it does, who calls it, and what its error cases are. Idempotency is the default — duplicate POSTs should not create duplicate rows. Pagination is the default on list endpoints — never return an unbounded result set.",
      reportingLines:
        "Reports to the Technical Architect. Peers with the Database Engineer (jointly own schema) and the Frontend Developer (jointly own API contract). Works closely with the DevOps & Release Engineer on cron jobs and env vars.",
      kpis: [
        "API P95 latency per endpoint. Target: under 200ms for reads, 800ms for writes.",
        "Endpoint uptime — percentage of requests that return a 2xx or expected 4xx (not 5xx). Target: 99.5%.",
        "Schema migration success rate. Target: 100% (no rolled-back migrations in production).",
        "Auth failure rate — percentage of requests that fail with 401 due to a bug (not a legitimate unauthenticated request). Target: under 0.1%.",
      ],
      tools:
        "Prisma Studio, Bruno or Postman, psql, Vercel logs, GitHub Actions, the worklog.md file, the xlsx npm package (for bulk imports), the Resend/Postmark dashboard (for email).",
      escalation:
        "Escalate to the Database Engineer when a query is slow or when a schema change is needed. Escalate to the Technical Architect when an endpoint implies a new external service or a new auth pattern. Escalate to the DevOps & Release Engineer when an endpoint needs a new env var or a new cron schedule.",
      deliverables: [
        "Endpoint spec (JSDoc block at the top of every route.ts file): method, path, body, response, status codes, auth requirement.",
        "Migration runbook: what the migration does, how to verify it on staging, how to roll it back.",
        "Smoke-test curl command for every new endpoint, added to scripts/prod-smoke-test.mjs.",
      ],
    })
  );

  // JD 4 — DevOps & Release Engineer
  body.push(
    ...jd({
      num: 11,
      title: "DevOps & Release Engineer",
      mission:
        "The DevOps & Release Engineer owns the path from a merged PR to a running production deployment, and every operational concern around it. They own CI, deploy, rollback, env vars, secrets, log analysis, and uptime monitoring. They are the on-call role when production misbehaves. Their job is to make deploys boring — a small, well-understood change should reach production in under 30 minutes with zero surprises.",
      capabilities: [
        "Vercel platform — project settings, env vars (per-environment), preview deploys, production deploys, instant rollback, deployment promotion",
        "GitHub Actions — workflow authoring, secrets, matrix builds, caching, required checks for branch protection",
        "GitHub CLI (gh) — scriptable operations for releases, PRs, branch protection",
        "Vercel CLI — `vercel deploy --prod`, `vercel env`, `vercel logs`, `vercel inspect`",
        "Env var management — never check secrets into the repo, rotate on a schedule, document what each var is for",
        "Log analysis — Vercel runtime logs, structured logging, alerting on error spikes",
        "Uptime monitoring — Vercel built-in + external prober (e.g. UptimeRobot) on the production URL",
        "Incident response — lead the response, file the postmortem, drive the action items",
      ],
      procedures: [
        "Pre-deploy checklist (see Section 4.2) — run scripts/pre-deploy-check.sh before every production deploy.",
        "Deploy gate — no production deploy without (a) clean build, (b) green CI, (c) QA sign-off on the smoke test, (d) version tag created.",
        "Post-deploy smoke test — run scripts/prod-smoke-test.mjs against production within 5 minutes of every deploy. Rollback if any check fails.",
        "Rollback runbook — one-click Vercel instant rollback. Documented in docs/runbooks/rollback.md.",
        "Incident postmortem — for every production incident, file a postmortem in docs/postmortems/ within 48 hours. Blameless format: timeline, impact, root cause, action items.",
      ],
      methodology:
        "Infrastructure-as-code — every operational change is reproducible from CLI commands in scripts/. No manual dashboard clicks for production changes (only for emergency rollback). Every deploy is observable: status, duration, error rate. Every secret is in Vercel env vars (encrypted), never in the repo. Every change to infrastructure triggers a worklog entry.",
      reportingLines:
        "Reports to the Technical Architect and the Product & Project Manager (matrix). Peers with the Security Engineer (jointly own secrets + access). Works closely with the QA & Test Engineer on the deploy gate.",
      kpis: [
        "Deploy frequency — number of production deploys per week. Target: 2+ (small batches reduce risk).",
        "Deploy lead time — time from PR merge to production deploy. Target: under 30 minutes for routine changes.",
        "Change failure rate — percentage of deploys that require rollback. Target: under 5%.",
        "MTTR (mean time to restore) — time from incident detection to service restored. Target: under 30 minutes.",
      ],
      tools:
        "Vercel CLI + dashboard, GitHub Actions, gh CLI, Slack webhook (for deploy + incident notifications), scripts/pre-deploy-check.sh, scripts/prod-smoke-test.mjs, scripts/make-v3-backup.sh, scripts/backup-to-github.sh.",
      escalation:
        "Escalate to the Technical Architect when an infrastructure decision touches the codebase (e.g. changing the Node runtime version). Escalate to the Security Engineer when an incident involves auth, secrets, or user data. Escalate to the Product & Project Manager when an incident requires stakeholder communication.",
      deliverables: [
        "Deploy runbook (docs/runbooks/deploy.md): pre-deploy checklist, deploy command, post-deploy verification.",
        "Rollback runbook (docs/runbooks/rollback.md): when to roll back, how, how to verify.",
        "Incident report template (docs/postmortems/YYYY-MM-DD-incident.md): timeline, impact, root cause, action items, owners.",
      ],
    })
  );

  // JD 5 — QA & Test Engineer
  body.push(
    ...jd({
      num: 12,
      title: "QA & Test Engineer",
      mission:
        "The QA & Test Engineer owns test strategy and regression prevention. Their job is to make sure features work as intended before they reach users, and to make sure a fix for one bug doesn't introduce another. They write the tests that catch regressions, run the audits that catch accessibility violations, and sign off on every production deploy. They are the deploy gate.",
      capabilities: [
        "Playwright E2E tests — author, run, debug, integrate into CI",
        "Vitest unit tests — for pure functions, hooks, and component logic",
        "Smoke test design — the existing scripts/prod-smoke-test.mjs pattern, extended to cover new endpoints",
        "Regression suite — every bug fix ships with a regression test that would have caught the bug",
        "Accessibility audit with axe-core (browser extension or @axe-core/playwright)",
        "Cross-browser testing — Chrome, Firefox, Safari, Edge (last two versions of each)",
        "Mobile viewport testing — Chrome DevTools device emulation on iPhone, Pixel, iPad sizes",
        "Performance budget enforcement — fail CI if Lighthouse score drops below threshold on touched routes",
      ],
      procedures: [
        "Test plan per feature — for any feature estimated at M or larger, write a one-page test plan: what to test, how, expected results. Reviewed by the feature developer.",
        "Regression run before every deploy — full Playwright suite + smoke test. No deploy if any test fails.",
        "Bug triage — every reported bug gets a severity (P0 production-down, P1 broken-feature, P2 cosmetic) and an owner. P0 and P1 block the next deploy.",
        "Flaky test quarantine — a test that fails intermittently gets quarantined within 24 hours, investigated within 7 days, either fixed or permanently removed.",
        "Coverage report — every PR reports coverage delta on the files it touched. No enforced threshold, but downward trends are flagged.",
      ],
      methodology:
        "Shift-left — tests are written with the feature, not after. Test-first on critical paths (auth, payments, data import). No merge without green tests on the paths the PR touches. Flaky tests are bugs. The QA engineer is not the only person who writes tests — every developer writes their own unit tests; QA owns E2E, the regression suite, and the audit cadence.",
      reportingLines:
        "Reports to the Technical Architect. Peers with the DevOps & Release Engineer (jointly own the deploy gate) and the Frontend Developer (jointly own accessibility audits).",
      kpis: [
        "Regression escape rate — number of bugs that reach production and could have been caught by a test. Target: under 1 per quarter.",
        "Test coverage on critical paths (auth, RSVP, member import, image upload). Target: 90%+.",
        "Flaky test rate — percentage of CI runs that fail due to flaky tests. Target: under 2%.",
        "Bug turnaround time — median time from P1 bug report to fix deployed. Target: under 48 hours.",
      ],
      tools:
        "Playwright, Vitest, axe-core, Lighthouse CI, Chrome DevTools, BrowserStack (optional, for cross-device), GitHub Actions (for CI integration).",
      escalation:
        "Escalate to the Technical Architect when a test reveals an architectural issue (e.g. a test that requires extensive mocking is a smell). Escalate to the DevOps & Release Engineer when CI is flaky due to infrastructure. Escalate to the Product & Project Manager when a P0 bug requires stakeholder communication.",
      deliverables: [
        "Test plan template (docs/test-plans/feature-name.md): scope, environment, test cases, expected results.",
        "Bug report template: title, severity, steps to reproduce, expected, actual, environment, screenshot/record, suggested fix.",
        "Regression suite entry — every bug fix PR adds a Playwright or Vitest test that reproduces the bug.",
      ],
    })
  );

  // JD 6 — Database Engineer
  body.push(
    ...jd({
      num: 13,
      title: "Database Engineer",
      mission:
        "The Database Engineer owns the Prisma schema, the migrations, the query performance, and the data integrity of the platform. They are the person who can read an EXPLAIN ANALYZE output and tell you why a query is slow. They work hand-in-hand with the Backend Developer on every schema change and with the DevOps & Release Engineer on backup and restore procedures.",
      capabilities: [
        "PostgreSQL — schema design, indexes, constraints, EXPLAIN ANALYZE, vacuum/analyze, connection pooling",
        "SQLite — the dev database; knows the differences (no concurrent writes, no JSONB, etc.)",
        "Prisma schema — model definitions, relations, cascades, enums, the migration workflow",
        "Migration authoring — additive vs destructive, rollback migrations, zero-downtime migrations",
        "Index strategy — when to add, when to remove, composite indexes, partial indexes, when NOT to index",
        "Query analysis — Prisma query logging, EXPLAIN, slow-query triage",
        "Backup/restore — Vercel-managed daily backups, point-in-time recovery, manual backup before destructive migrations",
        "Neon platform — branching, point-in-time restore, autoscaling config",
      ],
      procedures: [
        "Schema review on every Prisma migration — the Database Engineer reviews before merge. Checks: indexes on foreign keys, constraints on enums, cascade rules, naming conventions.",
        "Migration dry-run on staging — every migration runs on a Neon branch first; the dry-run output is posted in the PR.",
        "Rollback migration authoring — every migration has a corresponding `down` migration in the same PR, when reversible.",
        "Periodic vacuum/analyze — scheduled job on production Postgres; reviewed monthly.",
        "Slow-query triage — every week, review the slowest 10 queries from Vercel logs; file issues for any taking >500ms.",
      ],
      methodology:
        "Every schema change ships with a migration AND a rollback when reversible. No destructive migration without a backup tag first (Goal 3 backup procedure). Indexes are justified with EXPLAIN — never add an index blindly. Foreign keys always have indexes. Constraints are enforced at the database level, not just in code. The Prisma schema is the source of truth; TypeScript types are generated from it.",
      reportingLines:
        "Reports to the Technical Architect. Peers with the Backend Developer (jointly own schema). Works closely with the DevOps & Release Engineer on backups and the Security Engineer on data access controls.",
      kpis: [
        "Query P95 latency — slowest 10 queries. Target: under 500ms.",
        "Migration success rate — percentage of migrations that apply cleanly in production. Target: 100%.",
        "DB uptime — Neon-managed. Target: 99.9% (Neon SLA).",
        "Backup restore test — quarterly drill: restore the latest backup to a Neon branch and verify row counts. Target: passes every quarter.",
      ],
      tools:
        "Prisma Studio, psql, EXPLAIN ANALYZE, Neon dashboard, Prisma migrate CLI, the worklog.md file.",
      escalation:
        "Escalate to the Technical Architect when a schema change requires code changes across multiple routes. Escalate to the DevOps & Release Engineer when a migration requires a maintenance window or downtime. Escalate to the Security Engineer when a change affects data access controls or PII storage.",
      deliverables: [
        "Migration runbook (per migration): what it does, how to verify on staging, how to roll back, expected duration.",
        "Schema change ADR — for any non-additive migration, an ADR explaining the why and the alternatives considered.",
        "Quarterly slow-query report — top 10 slowest queries, root cause, fix plan.",
      ],
    })
  );

  // JD 7 — Documentation & Knowledge Manager
  body.push(
    ...jd({
      num: 14,
      title: "Documentation & Knowledge Manager",
      mission:
        "The Documentation & Knowledge Manager owns the institutional memory of the team. They make sure that knowledge lives in the repo, not in someone's head or in a private chat. They own the worklog, the READMEs, the ADRs, the runbooks, the version tags, the changelogs, and the release notes. They are the reason a new team member can onboard in days, not weeks.",
      capabilities: [
        "Technical writing — clear, concise, audience-aware (developer docs vs user docs vs stakeholder updates)",
        "Markdown — the team's documentation format of choice",
        "Mermaid diagrams — for flowcharts, sequence diagrams, ERDs in ADRs and READMEs",
        "Docs-as-code — documentation lives in the repo, is reviewed in PRs, and is versioned with the code",
        "README structure — every top-level folder has a README explaining what's in it and why",
        "ADR authoring — the ADR template, when to write one, how to keep them current",
        "Runbook authoring — operational procedures in docs/runbooks/, step-by-step, copy-pasteable commands",
        "Changelog generation — from git log + worklog entries, summarized per release",
        "Version tagging — git tags (v3.0.0, v3.1.0), GitHub Releases with notes and tarball assets",
      ],
      procedures: [
        "Worklog append after every task — every Task ID gets a worklog entry on completion (existing pattern).",
        "README update on feature ship — every new top-level folder or major feature gets a README.",
        "ADR on architectural change — the architect writes it; the Docs Manager reviews for clarity and files it in docs/adr/.",
        "Runbook on new operational procedure — every time the DevOps engineer does something new operationally, a runbook is filed in docs/runbooks/.",
        "Release notes on every tag — when a v3.x.0 tag is cut, the Docs Manager drafts the release notes from the worklog entries since the last tag.",
      ],
      methodology:
        "Docs live in the repo. Every PR includes doc updates when functionality changes. No orphan knowledge in Slack or DMs — if a decision is made in chat, it gets summarized in the worklog or an ADR within 24 hours. Documentation is reviewed in PRs just like code. Stale docs are bugs — the Docs Manager runs a quarterly audit for docs that reference deleted files or removed features.",
      reportingLines:
        "Reports to the Product & Project Manager. Peers with all eight other roles — every role's deliverables eventually flow through the Docs Manager for filing and indexing.",
      kpis: [
        "Worklog freshness — worklog entries filed within 24 hours of task completion. Target: 100%.",
        "README coverage — percentage of top-level src/ folders with a README. Target: 100% by end of Q1.",
        "ADR count per quarter — number of ADRs filed. Target: at least 2 per quarter (indicates decisions are being recorded, not lost).",
        "Runbook accuracy on drills — quarterly drill: pick a runbook, follow it end-to-end, verify it works. Target: 100% pass rate.",
      ],
      tools:
        "Markdown, Mermaid, git, GitHub Releases, the worklog.md file, the docs/ folder structure (docs/adr/, docs/runbooks/, docs/postmortems/, docs/test-plans/).",
      escalation:
        "Escalate to the Technical Architect when a doc reveals an architectural ambiguity that needs an ADR. Escalate to the Product & Project Manager when a doc requires stakeholder input. Escalate to any role when their deliverable template needs updating.",
      deliverables: [
        "Worklog entry template: Task ID, Agent, Task, Work Log (bullet list), Stage Summary.",
        "ADR template: Context, Decision, Consequences, Alternatives Considered, Date, Status (Proposed/Accepted/Deprecated).",
        "Runbook template: Title, When to use, Prerequisites, Steps (numbered, copy-pasteable commands), Verification, Rollback (if applicable).",
      ],
    })
  );

  // JD 8 — Security Engineer
  body.push(
    ...jd({
      num: 15,
      title: "Security Engineer",
      mission:
        "The Security Engineer owns the security posture of the platform. They make sure authentication works, secrets are protected, dependencies are patched, input is validated, and access is logged. They are the person who reads the CVE on a Monday morning and knows whether the platform is vulnerable. They are also the person who leads the response when something does go wrong.",
      capabilities: [
        "NextAuth — session management, OAuth providers, email/password fallback, JWT vs database sessions, cookie settings",
        "OAuth flows — Google OAuth (the platform's primary provider), token refresh, scope minimization",
        "Session management — cookie attributes (Secure, SameSite, HttpOnly), expiration, revocation",
        "Secrets management — Vercel env vars, no secrets in repo, rotation procedures",
        "Dependency audit — npm audit, Snyk (optional), GitHub Dependabot, patch SLA by severity",
        "Content Security Policy — Vercel headers config, script-src restrictions, report-only mode",
        "CORS — same-origin by default, explicit opt-in for cross-origin endpoints",
        "Rate limiting — Vercel Edge Middleware or Upstash Ratelimit for sensitive endpoints",
        "Input validation — zod schemas on every API route body, no trust of client input",
        "Audit logging — security-relevant events (login, role change, member merge, bulk import) logged with user ID and timestamp",
        "GDPR basics — data minimization, user data export, user data deletion",
      ],
      procedures: [
        "Secrets rotation schedule — every 90 days for NEXTAUTH_SECRET, every 180 days for GOOGLE_CLIENT_SECRET. Owned by the DevOps & Release Engineer, audited by Security.",
        "Dependency audit monthly — `bun audit` run, results triaged by severity, critical CVEs patched within 7 days, high within 30 days.",
        "Auth flow review on every change — any PR that touches NextAuth, the session callback, or role checks gets a Security review.",
        "Incident response — for any suspected security incident, the Security Engineer leads the response. First step: contain (rotate secrets, revoke sessions). Second: investigate. Third: remediate. Fourth: postmortem.",
        "Security patch SLA — critical CVEs patched within 7 days, high within 30 days, medium within 90 days, low as time permits.",
      ],
      methodology:
        "Least privilege — every role, every env var, every API key gets the minimum scope it needs. No secrets in the repo — ever. Every new endpoint gets an auth check by default; the rare public endpoint gets a comment explaining why. Fail closed — when in doubt, deny access. Audit logging on every security-relevant action.",
      reportingLines:
        "Reports to the Technical Architect and the Product & Project Manager (matrix). Peers with the DevOps & Release Engineer (jointly own secrets + access). Works closely with the Backend Developer on input validation and auth.",
      kpis: [
        "Time-to-patch for critical CVEs. Target: under 7 days.",
        "Auth failure rate — percentage of legitimate login attempts that fail due to a bug. Target: under 0.1%.",
        "Secrets rotation compliance — percentage of secrets rotated on schedule. Target: 100%.",
        "Audit log coverage — percentage of security-relevant actions that produce an audit log entry. Target: 100%.",
      ],
      tools:
        "npm audit, GitHub Dependabot, Snyk (optional), Vercel logs (for auth events), the worklog.md file, Vercel env var dashboard.",
      escalation:
        "Escalate to the DevOps & Release Engineer when a secret needs rotation or a CVE patch requires an emergency deploy. Escalate to the Technical Architect when a security constraint requires an architectural change. Escalate to the Product & Project Manager when a security incident requires stakeholder or user communication.",
      deliverables: [
        "Security incident report (docs/postmortems/YYYY-MM-DD-security.md): timeline, impact, root cause, action items, regulatory considerations.",
        "Secrets rotation runbook (docs/runbooks/secrets-rotation.md): what to rotate, how, how to verify, how to notify users if sessions are revoked.",
        "Monthly dependency audit report — list of CVEs, severity, patch status, owner.",
      ],
    })
  );

  // JD 9 — Product & Project Manager
  body.push(
    ...jd({
      num: 16,
      title: "Product & Project Manager",
      mission:
        "The Product & Project Manager owns the backlog, the priorities, and the stakeholder communication. They are the reason the team works on the highest-impact thing this week, not the most interesting thing. They run sprint planning, the weekly sync, the biweekly demo, the monthly roadmap review, and the quarterly retrospective. They are the single point of contact for stakeholders — when a stakeholder wants to know 'when will X ship?', they ask the PM.",
      capabilities: [
        "Backlog grooming — every ticket has a clear problem statement, acceptance criteria, and an estimate",
        "Sprint planning — pick the top N tickets by priority that fit the team's capacity, commit to them for the sprint",
        "Stakeholder management — Eze (the platform owner) is the primary stakeholder; the PM owns the relationship, sets expectations, and communicates trade-offs",
        "Requirement authoring — write clear, testable requirements that the developer can implement without follow-up questions",
        "Roadmap — quarterly outlook, refreshed monthly. Not a Gantt chart; a prioritized list of outcomes.",
        "RACI facilitation — for every cross-team activity, who is Responsible, Accountable, Consulted, Informed. The matrix in Section 17 is the canonical version.",
        "Risk register — top 5 risks to the plan, reviewed weekly. Each risk has a mitigation owner.",
        "Demo cadence — biweekly demo to the stakeholder. Recorded (Loom) for async viewing.",
        "Metrics reporting — sprint commitment met rate, cycle time, escaped defects. Reported in the retrospective.",
      ],
      procedures: [
        "Weekly sprint planning — 30 minutes, async or sync. Pick the tickets for the week. Each ticket has an owner.",
        "Daily async standup — every team member posts a one-line update to the worklog: what they did yesterday, what they're doing today, any blockers.",
        "Biweekly demo to stakeholder — show what shipped. Recorded. Followed by a stakeholder feedback round.",
        "Monthly roadmap review — refresh the quarterly roadmap based on the last month's progress and any new stakeholder input.",
        "Quarterly retrospective — what went well, what didn't, what to change. Output: action items with owners and due dates.",
      ],
      methodology:
        "Outcomes over output — the team is measured by what users can do that they couldn't before, not by lines of code or tickets closed. Single source of truth — the worklog is the canonical record of what's been done; the backlog (GitHub Projects) is the canonical record of what's planned. No scope creep without re-prioritization — when a new request comes in, the PM trades it against existing commitments, doesn't just add it. Transparent priorities — anyone on the team can see the backlog and the roadmap at any time.",
      reportingLines:
        "Reports to Eze / MassaPro leadership. Peers with all eight other roles — the PM is the connector, not the boss.",
      kpis: [
        "Sprint commitment met rate — percentage of committed tickets that ship in the sprint. Target: 80%+.",
        "Cycle time — median time from ticket start to deploy. Target: under 5 working days for M-sized tickets.",
        "Stakeholder NPS — quarterly survey of Eze and any other stakeholders. Target: 8+ out of 10.",
        "Escaped defects per sprint — number of bugs reported by users (not internal QA) per sprint. Target: under 2.",
      ],
      tools:
        "GitHub Projects (backlog), worklog.md (what's been done), Loom (demo recordings), Slack (stakeholder comms), this plan document.",
      escalation:
        "Escalate to Eze / MassaPro leadership when a stakeholder request requires a change to the quarterly commitment. Escalate to the Technical Architect when a feature request has architectural implications. Escalate to any role when their deliverable is blocking the sprint.",
      deliverables: [
        "Sprint plan (in GitHub Projects): committed tickets, owners, acceptance criteria.",
        "Stakeholder update (biweekly, written): what shipped, what's next, any risks to the roadmap.",
        "Retrospective doc (quarterly, in docs/retrospectives/): what went well, what didn't, action items with owners.",
      ],
    })
  );

  // ---------- Section 17: RACI Matrix ----------
  body.push(h1("17. Cross-Team RACI Matrix"));
  body.push(
    p(
      "The matrix below shows, for each key activity, who is Responsible (does the work), Accountable (signs off — only one A per row), Consulted (provides input before the work), and Informed (notified after the work). When in doubt about who owns a decision, look here first."
    )
  );
  body.push(
    dataTable(
      [
        "Activity",
        "Arch",
        "FE",
        "BE",
        "DevOps",
        "QA",
        "DB",
        "Docs",
        "Sec",
        "PM",
      ],
      [
        ["New feature ship", "C", "R", "R", "I", "C", "I", "I", "C", "A"],
        ["Production deploy", "C", "I", "I", "R", "A", "I", "I", "I", "I"],
        ["Incident response", "C", "I", "I", "R", "C", "C", "I", "C", "A"],
        ["Schema migration", "C", "I", "C", "I", "I", "R", "I", "C", "A"],
        ["Secrets rotation", "I", "I", "I", "R", "I", "I", "I", "A", "I"],
        ["ADR approval", "A", "C", "C", "C", "I", "C", "R", "C", "I"],
        ["Release tagging", "I", "I", "I", "R", "I", "I", "A", "I", "C"],
        ["Quarterly planning", "C", "I", "I", "C", "C", "I", "I", "C", "A"],
        ["Bug triage", "I", "C", "C", "I", "R", "I", "I", "I", "A"],
        ["On-call (off-hours)", "I", "I", "I", "R", "C", "C", "I", "C", "I"],
      ],
      [25, 8, 7, 7, 9, 7, 7, 8, 7, 7, 8]
    )
  );
  body.push(
    p(
      "To read the matrix: for 'Production deploy', the DevOps & Release Engineer is Responsible (does the deploy), the QA & Test Engineer is Accountable (signs off via the smoke test), the Architect is Consulted (on any architectural risk), and everyone else is Informed. There is exactly one A per row — if two people are Accountable, no one is."
    )
  );

  // ---------- Section 18: Implementation Status ----------
  body.push(h1("18. Implementation Status & Next Steps"));
  body.push(
    p(
      "This session delivered the unified plan plus the first concrete implementation: CSV/XLS bulk upload for the members and registrants lists. The remaining goals (deploy stability hardening, external backup workflow, capability backlog) are planned for Q1 with named owners. The table below summarizes what is done and what is next."
    )
  );
  body.push(
    dataTable(
      ["Item", "Status", "Owner", "Target"],
      [
        ["CSV/XLS bulk upload — Members (API + UI)", "Done", "Backend + Frontend", "This session"],
        ["CSV/XLS bulk upload — Registrants (API + UI)", "Done", "Backend + Frontend", "This session"],
        ["CSV/XLS upload templates (downloadable)", "Done", "Backend", "This session"],
        ["This plan + 9 job descriptions document", "Done", "Docs Manager + PM", "This session"],
        ["V3.0 backup tarball", "Done (earlier session)", "DevOps", "Done"],
        ["GitHub Actions CI (lint + typecheck + build)", "Planned", "DevOps", "Q1"],
        ["Pre-deploy checklist script (pre-deploy-check.sh)", "Planned", "DevOps", "Q1"],
        ["Extend prod-smoke-test.mjs for new endpoints", "Planned", "QA", "Q1"],
        ["Backup-to-github.sh (tag + release + asset)", "Planned", "DevOps + Docs", "Q1"],
        ["v3.0.0 git tag + GitHub Release", "Planned", "DevOps + Docs", "Q1"],
        ["Branch reconciliation (rebase local on origin)", "Planned", "Architect", "Q1"],
        ["Vercel GitHub integration (auto-deploy on main)", "Planned", "DevOps", "Q1"],
        ["Lighthouse + axe audit on top-level routes", "Planned", "QA + Frontend", "Q1"],
        ["docs/ folder structure (adr, runbooks, postmortems)", "Planned", "Docs Manager", "Q1"],
        ["Quarterly tech-debt register", "Planned", "Architect", "Q1"],
      ],
      [40, 15, 20, 25]
    )
  );
  body.push(
    p(
      "The next session's priority is the deploy stability track (Goal 2): set up GitHub Actions CI, reconcile the divergent branches, configure Vercel GitHub integration so pushes to main auto-deploy, and tag v3.0.0. Once that is in place, the V3.0 code already in the working tree will reach production without manual intervention, and the gap that blocked this session's deploy will not recur."
    )
  );

  return body;
}

// ---------------------------------------------------------------------------
// Build the document
// ---------------------------------------------------------------------------
const doc = new Document({
  creator: "MassaPro Engineering",
  title: "AI Salon Tel Aviv — Engineering Team Plan V3.0",
  description: "Unified plan + 9 job descriptions",
  styles: {
    default: {
      document: {
        run: {
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
          size: 24,
          color: P.body,
        },
        paragraph: {
          spacing: { line: 312 },
        },
      },
      heading1: {
        run: {
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
          size: 32,
          bold: true,
          color: P.body,
        },
        paragraph: {
          spacing: { before: 480, after: 240, line: 312 },
          outlineLevel: 0,
        },
      },
      heading2: {
        run: {
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
          size: 28,
          bold: true,
          color: P.body,
        },
        paragraph: {
          spacing: { before: 320, after: 160, line: 312 },
          outlineLevel: 1,
        },
      },
      heading3: {
        run: {
          font: { ascii: EN_FONT, eastAsia: EN_FONT },
          size: 24,
          bold: true,
          color: P.body,
        },
        paragraph: {
          spacing: { before: 240, after: 120, line: 312 },
          outlineLevel: 2,
        },
      },
    },
  },
  sections: [
    // Section 1: Cover (margin 0, separate section)
    {
      properties: {
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
          margin: { top: 0, bottom: 0, left: 0, right: 0 },
        },
      },
      children: buildCover(),
    },
    // Section 2: Body (normal margins, with header + footer + page numbers)
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: {
          size: { width: 11906, height: 16838, orientation: PageOrientation.PORTRAIT },
          margin: { top: 1440, bottom: 1440, left: 1701, right: 1417 },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              alignment: AlignmentType.RIGHT,
              spacing: { line: 312 },
              children: [
                new TextRun({
                  text: "AI Salon Tel Aviv — Engineering Team Plan V3.0",
                  size: 18,
                  color: P.secondary,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                  italics: true,
                }),
              ],
            }),
          ],
        }),
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              spacing: { line: 312 },
              children: [
                new TextRun({
                  text: "Page ",
                  size: 18,
                  color: P.secondary,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: 18,
                  color: P.secondary,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                }),
                new TextRun({
                  text: " of ",
                  size: 18,
                  color: P.secondary,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                }),
                new TextRun({
                  children: [PageNumber.TOTAL_PAGES],
                  size: 18,
                  color: P.secondary,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                }),
                new TextRun({
                  text: "  ·  Confidential — MassaPro  ·  aisalon.massapro.com",
                  size: 18,
                  color: P.secondary,
                  font: { ascii: EN_FONT, eastAsia: EN_FONT },
                }),
              ],
            }),
          ],
        }),
      },
      children: buildBody(),
    },
  ],
});

const OUT = "/home/z/my-project/download/AISalon-Team-Plan-V3.0.docx";
const OUT_DIR = path.dirname(OUT);
if (!fs.existsSync(OUT_DIR)) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
}

Packer.toBuffer(doc).then((buf) => {
  fs.writeFileSync(OUT, buf);
  console.log(`✓ Wrote ${OUT}`);
  console.log(`  Size: ${(buf.length / 1024).toFixed(1)} KB`);
});

/**
 * Coma Platform — Capabilities & Goals summary document.
 *
 * Structure: Cover (R1 recipe, Coma-branded palette) → TOC (Roman) → Body (Arabic).
 * English business report, Profile A (formal), ~3,000 words.
 */
const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  PageBreak, Header, Footer, PageNumber, NumberFormat,
  AlignmentType, HeadingLevel, WidthType, BorderStyle, ShadingType,
  SectionType, TableLayoutType, TableOfContents,
} = require("docx");
const fs = require("fs");

// ── Palette: Coma brand (navy / amber / red) ─────────────────────────
const P = {
  primary: "0A1F44",   // Coma navy — headings
  body: "182030",      // near-black body
  secondary: "506070", // captions
  accent: "F5A623",    // Coma amber — accents, table headers
  surface: "F5F7FA",   // light surface
  red: "E84855",       // Coma red — secondary accent
};

// Cover palette (R1)
const COVER = {
  bg: "0A1F44",
  titleColor: "FFFFFF",
  subtitleColor: "C8D2E0",
  metaColor: "A8B8CC",
  accent: "F5A623",
  footerColor: "7A8BA0",
};

// ── Border helpers ────────────────────────────────────────────────────
const NB = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const noBorders = { top: NB, bottom: NB, left: NB, right: NB };
const allNoBorders = { top: NB, bottom: NB, left: NB, right: NB, insideHorizontal: NB, insideVertical: NB };

// ── Cover layout helpers (from design-system.md) ─────────────────────
function splitTitleLines(title, charsPerLine) {
  if (title.length <= charsPerLine) return [title];
  const breakAfter = new Set([..."，。、；：！？", ..."的与和及之在于为", ..."-_—–·/", ..." \t"]);
  const lines = [];
  let remaining = title;
  while (remaining.length > charsPerLine) {
    let breakAt = -1;
    for (let i = charsPerLine; i >= Math.floor(charsPerLine * 0.6); i--) {
      if (i < remaining.length && breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
    }
    if (breakAt === -1) {
      const limit = Math.min(remaining.length, Math.ceil(charsPerLine * 1.3));
      for (let i = charsPerLine + 1; i < limit; i++) {
        if (breakAfter.has(remaining[i - 1])) { breakAt = i; break; }
      }
    }
    if (breakAt === -1) {
      breakAt = charsPerLine;
      const prevChar = remaining[breakAt - 1], nextChar = remaining[breakAt];
      if (prevChar && nextChar && !breakAfter.has(prevChar) && !breakAfter.has(nextChar) &&
          /[\u4e00-\u9fff]/.test(prevChar) && /[\u4e00-\u9fff]/.test(nextChar)) {
        breakAt = breakAt - 1;
      }
    }
    lines.push(remaining.slice(0, breakAt).trim());
    remaining = remaining.slice(breakAt).trim();
  }
  if (remaining) lines.push(remaining);
  if (lines.length > 1 && lines[lines.length - 1].length <= 2) {
    const last = lines.pop();
    lines[lines.length - 1] += last;
  }
  return lines;
}

function calcTitleLayout(title, maxWidthTwips, preferredPt = 40, minPt = 24) {
  // English chars are ~half CJK width; use 11 twips/pt per char for Latin-heavy titles
  const isLatin = /^[\x00-\x7F]*$/.test(title);
  const charWidth = (pt) => pt * (isLatin ? 11 : 20);
  const charsPerLine = (pt) => Math.floor(maxWidthTwips / charWidth(pt));
  let titlePt = preferredPt, lines;
  while (titlePt >= minPt) {
    const cpl = charsPerLine(titlePt);
    if (cpl < 2) { titlePt -= 2; continue; }
    lines = splitTitleLines(title, cpl);
    if (lines.length <= 3) break;
    titlePt -= 2;
  }
  if (!lines || lines.length > 3) {
    const cpl = charsPerLine(minPt);
    lines = splitTitleLines(title, cpl);
    titlePt = minPt;
  }
  return { titlePt, titleLines: lines };
}

function calcCoverSpacing(params) {
  const {
    titleLineCount = 1, titlePt = 36, hasSubtitle = false,
    hasEnglishLabel = false, metaLineCount = 0,
    fixedHeight = 800, pageHeight = 16838,
    marginTop = 0, marginBottom = 0,
  } = params;
  const SAFETY = 1200;
  const usableHeight = pageHeight - marginTop - marginBottom - SAFETY;
  const titleHeight = titleLineCount * (titlePt * 23 + 200);
  const subtitleHeight = hasSubtitle ? (12 * 23 + 600) : 0;
  const englishLabelHeight = hasEnglishLabel ? (9 * 23 + 600) : 0;
  const metaHeight = metaLineCount * (10 * 23 + 100);
  const implicitParaHeight = 3 * 300;
  const contentHeight = titleHeight + subtitleHeight + englishLabelHeight + metaHeight + fixedHeight + implicitParaHeight;
  const remainingSpace = usableHeight - contentHeight;
  const safeRemaining = Math.max(remainingSpace, 400);
  const FOOTER_MIN = 800;
  const rawTop = Math.floor(safeRemaining * 0.45);
  const rawBottom = Math.floor(safeRemaining * 0.45);
  const bottomSpacing = Math.max(rawBottom, FOOTER_MIN);
  const topSpacing = Math.max(rawTop - Math.max(0, FOOTER_MIN - rawBottom), 400);
  const midSpacing = Math.max(safeRemaining - topSpacing - bottomSpacing, 0);
  return { topSpacing, midSpacing, bottomSpacing };
}

// ── Cover Recipe R1 (Pure Paragraph Left) ────────────────────────────
function buildCoverR1(config) {
  const C = config.palette;
  const padL = 1200, padR = 800;
  const availableWidth = 11906 - padL - padR - 300;
  const { titlePt, titleLines } = calcTitleLayout(config.title, availableWidth, 40, 24);
  const titleSize = titlePt * 2;
  const spacing = calcCoverSpacing({
    titleLineCount: titleLines.length, titlePt,
    hasSubtitle: !!config.subtitle, hasEnglishLabel: !!config.englishLabel,
    metaLineCount: (config.metaLines || []).length,
    fixedHeight: 400,
  });
  const accentLeft = { style: BorderStyle.SINGLE, size: 8, color: C.accent, space: 12 };
  const children = [];

  children.push(new Paragraph({ spacing: { before: spacing.topSpacing } }));

  if (config.englishLabel) {
    children.push(new Paragraph({
      indent: { left: padL, right: padR }, spacing: { after: 500 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: C.accent, space: 8 } },
      children: [new TextRun({ text: config.englishLabel.split("").join("  "),
        size: 18, color: C.accent, font: { ascii: "Calibri", eastAsia: "SimHei" }, characterSpacing: 40 })],
    }));
  }

  for (let i = 0; i < titleLines.length; i++) {
    children.push(new Paragraph({
      indent: { left: padL },
      spacing: { after: i < titleLines.length - 1 ? 100 : 300, line: Math.ceil(titlePt * 23), lineRule: "atLeast" },
      children: [new TextRun({ text: titleLines[i], size: titleSize, bold: true,
        color: C.titleColor, font: { eastAsia: "SimHei", ascii: "Arial" } })],
    }));
  }

  if (config.subtitle) {
    children.push(new Paragraph({
      indent: { left: padL }, spacing: { after: 800 },
      children: [new TextRun({ text: config.subtitle, size: 24, color: C.subtitleColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }

  for (const line of (config.metaLines || [])) {
    children.push(new Paragraph({
      indent: { left: padL + 200 }, spacing: { after: 80 },
      border: { left: accentLeft },
      children: [new TextRun({ text: line, size: 24, color: C.metaColor,
        font: { eastAsia: "Microsoft YaHei", ascii: "Arial" } })],
    }));
  }

  children.push(new Paragraph({ spacing: { before: spacing.bottomSpacing } }));

  children.push(new Paragraph({
    indent: { left: padL, right: padR },
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: C.accent, space: 8 } },
    spacing: { before: 200 },
    children: [
      new TextRun({ text: config.footerLeft || "", size: 16, color: C.footerColor, font: { ascii: "Arial" } }),
      new TextRun({ text: "                                        " }),
      new TextRun({ text: config.footerRight || "", size: 16, color: C.footerColor, font: { ascii: "Arial" } }),
    ],
  }));

  return [new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    layout: TableLayoutType.FIXED,
    borders: allNoBorders,
    rows: [new TableRow({
      height: { value: 16838, rule: "exact" },
      children: [new TableCell({
        shading: { type: ShadingType.CLEAR, fill: C.bg }, borders: noBorders,
        children,
      })],
    })],
  })];
}

// ── Body component builders (English formal report) ─────────────────
function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: P.primary, font: { ascii: "Arial", eastAsia: "SimHei" } })],
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: P.primary, font: { ascii: "Arial", eastAsia: "SimHei" } })],
  });
}
function body(text, opts = {}) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: [new TextRun({ text, size: 22, color: P.body, font: { ascii: "Calibri", eastAsia: "SimSun" }, ...opts })],
  });
}
function bodyRuns(runs) {
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    spacing: { line: 312, after: 120 },
    children: runs.map(r => new TextRun({ size: 22, color: P.body, font: { ascii: "Calibri", eastAsia: "SimSun" }, ...r })),
  });
}
function bullet(text, boldLead) {
  const runs = [];
  if (boldLead) {
    runs.push(new TextRun({ text: boldLead, bold: true, size: 22, color: P.body, font: { ascii: "Calibri" } }));
    runs.push(new TextRun({ text: " — " + text, size: 22, color: P.body, font: { ascii: "Calibri" } }));
  } else {
    runs.push(new TextRun({ text, size: 22, color: P.body, font: { ascii: "Calibri" } }));
  }
  return new Paragraph({
    alignment: AlignmentType.LEFT,
    spacing: { line: 312, after: 80 },
    indent: { left: 360, hanging: 220 },
    children: [new TextRun({ text: "\u2022  ", size: 22, color: P.accent, bold: true, font: { ascii: "Calibri" } }), ...runs],
  });
}
function caption(text) {
  return new Paragraph({
    keepNext: true,
    spacing: { before: 160, after: 80 },
    children: [new TextRun({ text, bold: true, size: 20, color: P.secondary, font: { ascii: "Calibri" } })],
  });
}
function makeTable(headers, rows, widths) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.SINGLE, size: 4, color: P.primary },
      bottom: { style: BorderStyle.SINGLE, size: 4, color: P.primary },
      left: NB, right: NB,
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: "D0D7E2" },
      insideVertical: NB,
    },
    rows: [
      new TableRow({
        tableHeader: true, cantSplit: true,
        children: headers.map((text, i) => new TableCell({
          shading: { type: ShadingType.CLEAR, fill: P.primary },
          margins: { top: 70, bottom: 70, left: 120, right: 120 },
          width: { size: widths[i], type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: "FFFFFF", font: { ascii: "Calibri" } })] })],
        })),
      }),
      ...rows.map((row, ri) => new TableRow({
        cantSplit: true,
        children: row.map((cell, i) => new TableCell({
          shading: ri % 2 === 1 ? { type: ShadingType.CLEAR, fill: P.surface } : undefined,
          margins: { top: 60, bottom: 60, left: 120, right: 120 },
          width: { size: widths[i], type: WidthType.PERCENTAGE },
          children: [new Paragraph({ children: [new TextRun({ text: cell, size: 20, color: P.body, font: { ascii: "Calibri" } })] })],
        })),
      })),
    ],
  });
}
function pageFooter() {
  return new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ children: [PageNumber.CURRENT], size: 18, color: P.secondary, font: { ascii: "Calibri" } })],
    })],
  });
}
function pageHeader() {
  return new Header({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "C9D2DE", space: 4 } },
      children: [new TextRun({ text: "Coma Platform — Capabilities & Goals", size: 16, color: P.secondary, font: { ascii: "Calibri" } })],
    })],
  });
}

// ══════════════════════════════════════════════════════════════════════
// BODY CONTENT
// ══════════════════════════════════════════════════════════════════════
const bodyChildren = [];

// ── 1. Executive Summary ──────────────────────────────────────────────
bodyChildren.push(h1("1. Executive Summary"));
bodyChildren.push(body("Coma is a white-label community operating system built by MassaPro. Its tagline — \u201cBuilding the Operating System for Communities\u201d — captures the core ambition: any organization, vertical, or city community should be able to launch a fully branded, fully functional community platform in days rather than months, while sharing the infrastructure, codebase, and network effects of a single platform. The platform currently powers two brands: Coma itself, the parent platform hosted at platform.joincoma.com, and AI Salon, the first white-label customer community hosted at aisalon.massapro.com with active chapters in Tel Aviv and Montreal."));
bodyChildren.push(body("The platform covers the full lifecycle of a community: member acquisition through chapter landing pages and referrals, identity and access management, community discovery and multi-community membership, event management with RSVPs and check-in, email automation, knowledge management, and per-brand visual identity across every surface. Every capability is brand-scoped: two communities on the platform never see each other\u2019s members, events, or content unless they choose to."));
bodyChildren.push(body("This document summarizes the platform\u2019s goals, architecture, and current capabilities as of September 2026, and closes with the near-term roadmap. It is intended as a reference for stakeholders, new team members, and prospective community partners evaluating the platform."));

// ── 2. Vision & Goals ─────────────────────────────────────────────────
bodyChildren.push(h1("2. Vision & Goals"));
bodyChildren.push(h2("2.1 The Problem Being Solved"));
bodyChildren.push(body("Running a professional community today means stitching together a dozen disconnected tools: a website builder for the landing page, an events platform for RSVPs, a WhatsApp group for day-to-day conversation, a spreadsheet for the member database, an email tool for newsletters, and a design tool for event materials. Each tool has its own login, its own data silo, and none of them carry the community\u2019s brand consistently. The result is operational overhead for organizers and a fragmented experience for members."));
bodyChildren.push(body("Coma replaces this patchwork with one platform where branding, members, events, emails, and content live together. A community lead configures their brand once — colors, logo, mascot, slogan, brand book — and every surface on the platform inherits it: the login page, chapter landing pages, event pages, transactional emails, and even the event-prep mockups."));
bodyChildren.push(h2("2.2 Product Goals"));
bodyChildren.push(bullet("Make every surface reflect the community\u2019s own brand, not the platform\u2019s.", "White-label fidelity"));
bodyChildren.push(bullet("A new brand can apply, be reviewed, and go live with its own identity in two business days. Skipped configuration inherits sensible Coma defaults.", "Time-to-launch"));
bodyChildren.push(bullet("Members of the parent platform can discover and join any community; members of a white-label brand see only their own brand\u2019s communities by default.", "Controlled openness"));
bodyChildren.push(bullet("Referral links, testimonials, and interested-location personalization turn every member into a growth channel.", "Community-led growth"));
bodyChildren.push(bullet("One codebase, one database, many brands. Adding a brand is a data operation, not a deployment.", "Operational leverage"));
bodyChildren.push(h2("2.3 Success Criteria"));
bodyChildren.push(body("The platform\u2019s success is measured by the number of active brands provisioned, the time from application to first event, member-to-member connection rates inside each community, cross-community join rates for parent-platform members, and organizer-reported time saved per event cycle. The architecture is deliberately optimized for the first two: the brand-onboarding pipeline and the Coma-defaults provisioning model exist so that every additional brand costs near-zero marginal engineering effort."));

// ── 3. Platform Architecture ──────────────────────────────────────────
bodyChildren.push(h1("3. Platform Architecture"));
bodyChildren.push(h2("3.1 Hierarchy Model"));
bodyChildren.push(body("The platform organizes everything in a four-level hierarchy: Brand \u2192 Country \u2192 Chapter \u2192 Event. A Brand is a top-level identity (Coma, AI Salon, or any community that joins the platform). Under each brand, Countries group chapters geographically, and Chapters are the local communities members actually join — for example, AI Salon Tel Aviv or AI Salon Montreal. Events belong to a chapter and carry its branding, timezone, and venue context. The same chapter slug can exist under different brands, so \u201ctel-aviv\u201d can one day exist under both AI Salon and a hypothetical Danone community without collision."));
bodyChildren.push(caption("Table 1 — Hierarchy entities and their roles"));
bodyChildren.push(makeTable(
  ["Entity", "Purpose", "Examples"],
  [
    ["Brand", "Top-level white-label identity with full branding config", "Coma, AI Salon"],
    ["Country", "Geographic grouping; drives nearby-community discovery", "Israel, Canada"],
    ["Chapter", "The local community members join; owns events and member lists", "Tel Aviv, Montreal"],
    ["Event", "Gathering with RSVPs, agenda, speakers, check-in, photos", "Salons, fast-pitch nights"],
  ],
  [16, 52, 32]
));
bodyChildren.push(h2("3.2 Brand Resolution"));
bodyChildren.push(body("Brand identity is resolved per-request through a four-layer chain: first an explicit brand parameter in the URL (?brand=xyz), then the request host (platform.joincoma.com resolves to Coma, aisalon.massapro.com to AI Salon), then the signed-in user\u2019s brand, then an environment default, and finally a hard fallback to Coma. This means every public link carries its brand with it — a Montreal member sharing an event link on WhatsApp shares an AI Salon link, and the recipient sees AI Salon branding even before they sign in."));
bodyChildren.push(h2("3.3 Technology Stack"));
bodyChildren.push(body("The platform is a Next.js 16 application deployed on Vercel, with a Neon serverless PostgreSQL database accessed through Prisma. Emails are sent through SMTP with a per-brand From identity. Images and brand assets are stored in Vercel Blob under per-brand prefixes. Analytics run through Google Analytics 4 and the Meta Pixel, both configurable per brand and loaded only after visitor cookie consent. The stack was chosen for zero-ops scaling: every deploy runs database migrations automatically, and adding capacity is handled by the platform rather than the team."));

// ── 4. Core Capabilities ──────────────────────────────────────────────
bodyChildren.push(h1("4. Core Capabilities"));
bodyChildren.push(h2("4.1 Brand System & White-Labeling"));
bodyChildren.push(body("Every brand on the platform is a full configuration entity covering visual identity (primary, secondary, and accent colors, hero gradient, favicon, square logo mark, hero banner, email logo, and an optional mascot with name, image, and backstory), voice (tagline, login eyebrow, headline and subheading templates, footer credit), email identity (From name, contact address), and domain strategy. The login page, chapter landing pages, event pages, headers, footers, and transactional emails all render from this single configuration, so a brand is defined once and appears consistently everywhere."));
bodyChildren.push(caption("Table 2 — Brand configuration surface"));
bodyChildren.push(makeTable(
  ["Category", "Fields", "Default when skipped"],
  [
    ["Identity", "Display name, slug, wordmark, tagline", "Wordmark from name; Coma tagline"],
    ["Palette", "Primary / secondary / accent hex, gradient", "Coma navy / amber / red"],
    ["Assets", "Hero banner, favicon, logo, email logo URLs", "Text wordmark; Coma assets"],
    ["Character", "Mascot name, image, backstory, brand book URL", "No mascot; admin follows up"],
    ["Login copy", "Eyebrow, headline, subtitle, form heading, footer", "Coma templates with brand name"],
    ["Email", "From name, contact email", "Coma defaults on massapro.com"],
  ],
  [18, 44, 38]
));
bodyChildren.push(h2("4.2 Communities & Membership"));
bodyChildren.push(body("Chapters are the communities. Each member has one primary chapter (implicit membership) and can explicitly join additional communities through the platform. Joining is a one-click confirmation: the member\u2019s profile details are shown partially masked — the same way passwords are displayed — and a single Join button records the membership with the profile data captured server-side. A discovery page (/communities) lets members browse communities in their own country first, then worldwide, with search and country filters; each card shows member and event counts without leaking event details to non-members."));
bodyChildren.push(body("Access rules implement a deliberate openness model. Coma (parent platform) members can see every community\u2019s events, but must join a community before they can register for its events or see its member directory. Members of other brands see only their own brand\u2019s communities and events — an AI Salon member never discovers that a Danone community exists — preserving white-label isolation while keeping the parent platform\u2019s network open."));
bodyChildren.push(h2("4.3 Events & RSVPs"));
bodyChildren.push(body("Events are the heartbeat of each community. Each event has a public page with the brand\u2019s header and footer, agenda, speakers and panelists, venue and map links, photo gallery, and a registration card. Registration creates an RSVP with a unique check-in code; on the day of the event, door staff scan the code through the QR check-in surface. Event times render in the chapter\u2019s local timezone, so a Montreal event shows Eastern time regardless of where the viewer is. Members can upload photos to the shared event gallery, and testimonials with star ratings and photos feed back into the community\u2019s public credibility."));
bodyChildren.push(h2("4.4 Member Experience"));
bodyChildren.push(body("Members sign in with Google or email and password. Chapter landing pages (/c/slug) double as signup funnels: a visitor signing up through a chapter\u2019s page is automatically tagged to that chapter, country, and brand, and is asked for up to five locations they want community updates from — powering personalized discovery later. The member profile carries name, photo, bio, title, company, LinkedIn, and portfolio links, all editable from the profile page alongside the interested-locations picker. A member directory shows fellow members of each joined community with private one-on-one messaging."));
bodyChildren.push(h2("4.5 Email System"));
bodyChildren.push(body("Email runs on two layers. Transactional emails — password delivery, RSVP confirmations, direct-message notifications, onboarding invitations — resolve the recipient\u2019s brand at send time, so every email carries the right logo, colors, and From identity. The orchestration layer lets organizers build automated multi-step flows from reusable audiences, with A/B subject-line testing, per-step entry-event triggers, and campaign reporting broken down by template and subject variant. Five stage templates — awareness, reminder, final prep, day-of, and recap — come pre-seeded and are brand-tagged."));
bodyChildren.push(h2("4.6 Knowledge Base & Event Prep"));
bodyChildren.push(body("Each brand has its own knowledge base organized into sections — branding, marketing, event management, sponsorship, and governance — where Super Admins curate documents with editable titles, URLs, and visibility. AI Salon ships with a seeded library; new brands start empty and inherit nothing, keeping content strictly brand-scoped. For event preparation, the mockups hub generates on-brand speaker introduction cards, agenda cards, event profiles, meet-the-speaker graphics, and QR salon posters from the brand\u2019s asset library."));

// ── 5. Onboarding & Application Flows ────────────────────────────────
bodyChildren.push(h1("5. Onboarding & Application Flows"));
bodyChildren.push(body("Two paths bring a new brand onto the platform, and both end in the same review-and-provision step. In the invite flow, a Super Admin emails a community lead a private link to a structured onboarding form. In the self-serve flow, a lead discovers the platform at /apply, signs in through the dedicated apply login, and completes an application form covering brand basics, color palette, logo and asset URLs, mascot details, brand book link, login copy, email configuration, and a launch plan with target date and first-chapter city."));
bodyChildren.push(body("Applications arrive in the Super Admin\u2019s brands console, where each submission is tagged by source — invited or self-applied — and can be reviewed in full before provisioning. Provisioning creates the Brand row with every submitted field applied and every skipped field inheriting the Coma default, links the new brand to the Coma hierarchy as a child, and activates it immediately. The lead receives a chapter-is-live email with admin access. The one-application-per-user rule prevents duplicates, and submitted applications remain viewable by the applicant as a read-only record."));
bodyChildren.push(caption("Table 3 — Onboarding paths"));
bodyChildren.push(makeTable(
  ["Path", "Entry point", "Review step", "Typical time"],
  [
    ["Admin invite", "Super Admin emails lead from brands console", "Same queue", "2 business days"],
    ["Self-serve apply", "/apply landing \u2192 apply login \u2192 application form", "Same queue, \u201cApply\u201d badge", "2 business days"],
  ],
  [20, 40, 22, 18]
));

// ── 6. Roles, Administration & Analytics ─────────────────────────────
bodyChildren.push(h1("6. Roles, Administration & Analytics"));
bodyChildren.push(body("Administration follows a five-role hierarchy. Super Admins manage the platform globally: brands, onboarding, countries, and brand-scoped settings. Admins manage members and content within their scope. Chapter Organizers and Co-Hosts run their own chapter\u2019s events, speakers, and check-in. Members participate; Speakers have event-scoped preparation surfaces. A view-as switcher lets Super Admins preview the platform exactly as any role or chapter would see it."));
bodyChildren.push(caption("Table 4 — Role hierarchy"));
bodyChildren.push(makeTable(
  ["Role", "Scope", "Key powers"],
  [
    ["Super Admin", "Entire platform", "Brands, onboarding, provisioning, all settings"],
    ["Admin", "Country or chapter scope", "Members, events, emails, reports"],
    ["Chapter Organizer", "Own chapter", "Events, speakers, check-in, event prep"],
    ["Co-Host", "Assigned events", "Event-scoped speakers, registrants, check-in"],
    ["Member / Speaker", "Joined communities", " RSVP, profile, gallery; speaker prep areas"],
  ],
  [22, 26, 52]
));
bodyChildren.push(body("Analytics operate at two levels. Platform analytics include GA4 and Meta Pixel, both brand-scoped and consent-gated, plus built-in dashboards for member activity, event performance, and referral attribution. The referral program gives every member a unique share link; visits, signups, and RSVPs driven by that link are attributed back to the member, making word-of-mouth measurable. Activity reports track visits, new visitors, and conversions per referrer so organizers can identify and reward their most effective ambassadors."));

// ── 7. Current State & Roadmap ────────────────────────────────────────
bodyChildren.push(h1("7. Current State & Roadmap"));
bodyChildren.push(h2("7.1 Live Today"));
bodyChildren.push(body("As of September 2026 the platform runs two brands in production: Coma at platform.joincoma.com and AI Salon at aisalon.massapro.com. AI Salon operates chapters in Tel Aviv and Montreal with the full event lifecycle in active use. The complete capability set described in this document — brand separation across templates, images, knowledge base, and mockups; multi-community membership with gating; the self-serve apply flow; interested-location capture at signup; per-brand analytics configuration — is deployed and verified in production."));
bodyChildren.push(h2("7.2 Near-Term Roadmap"));
bodyChildren.push(caption("Table 5 — Roadmap items"));
bodyChildren.push(makeTable(
  ["Item", "Description", "Status"],
  [
    ["DB-driven brand registry", "Read brand config from the database instead of code, completing the path to fully self-serve brand creation", "Next major phase"],
    ["Mockup canvas brand-awareness", "Mockup editors currently render canvas colors from the AI Salon palette; switch to per-brand palette tokens", "Queued"],
    ["Email flow brand columns", "Add brand scoping to orchestration flows and audiences for non-event campaigns", "Queued"],
    ["Location-based discovery", "Surface communities matching each member\u2019s interested locations at the top of /communities", "Queued"],
    ["Location-based notifications", "Email members about new communities and events in their interested cities", "Queued"],
    ["Legacy cleanup", "Remove the deprecated per-user brand string in favor of brand links; finish admin-copy brand-awareness", "Ongoing"],
  ],
  [26, 56, 18]
));
bodyChildren.push(h2("7.3 Strategic Position"));
bodyChildren.push(body("The platform\u2019s defensibility rests on three compounding assets. First, the brand-configuration depth: every surface — down to email From lines and mockup canvases — is brand-aware, which is genuinely hard to replicate. Second, the network topology: the parent platform\u2019s members can flow into any community while white-label brands stay isolated, giving Coma a unique position as both infrastructure and a discovery network. Third, operational leverage: each new brand is a row, not a deployment, so the marginal cost of the tenth community approaches zero. The immediate roadmap concentrates on completing that promise — making brand creation a fully self-serve, database-driven operation — so that growth in communities translates directly into platform growth."));

// ══════════════════════════════════════════════════════════════════════
// DOCUMENT ASSEMBLY — 3 sections (cover / TOC / body)
// ══════════════════════════════════════════════════════════════════════
const pgSize = { width: 11906, height: 16838 };
const pgMargin = { top: 1440, bottom: 1440, left: 1701, right: 1417 };

const doc = new Document({
  creator: "MassaPro",
  title: "Coma Platform — Capabilities & Goals",
  styles: {
    default: {
      document: {
        run: { font: { ascii: "Calibri", eastAsia: "SimSun" }, size: 22, color: P.body },
        paragraph: { spacing: { line: 312 } },
      },
    },
  },
  sections: [
    // Section 1: Cover — margin 0, no footer
    {
      properties: { page: { size: pgSize, margin: { top: 0, bottom: 0, left: 0, right: 0 } } },
      children: buildCoverR1({
        title: "Coma Platform",
        subtitle: "Capabilities & Goals — Platform Summary Report",
        englishLabel: "PLATFORM OVERVIEW",
        metaLines: [
          "Parent platform: platform.joincoma.com",
          "First white-label community: AI Salon",
          "Prepared by: MassaPro",
          "Date: September 2026",
        ],
        footerLeft: "MassaPro",
        footerRight: "Building the Operating System for Communities",
        palette: COVER,
      }),
    },
    // Section 2: TOC — Roman numerals
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.UPPER_ROMAN } },
      },
      footers: { default: pageFooter() },
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 480, after: 360 },
          children: [new TextRun({ text: "Table of Contents", bold: true, size: 32, color: P.primary, font: { ascii: "Arial", eastAsia: "SimHei" } })],
        }),
        new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-2" }),
        new Paragraph({
          spacing: { before: 200 },
          children: [new TextRun({
            text: "Note: This Table of Contents is generated via field codes. To ensure page number accuracy after editing, please right-click the TOC and select \u201cUpdate Field.\u201d",
            italics: true, size: 18, color: "888888", font: { ascii: "Calibri" },
          })],
        }),
        new Paragraph({ children: [new PageBreak()] }),
      ],
    },
    // Section 3: Body — Arabic from 1
    {
      properties: {
        type: SectionType.NEXT_PAGE,
        page: { size: pgSize, margin: pgMargin, pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL } },
      },
      headers: { default: pageHeader() },
      footers: { default: pageFooter() },
      children: bodyChildren,
    },
  ],
});

Packer.toBuffer(doc).then((buf) => {
  const out = "/home/z/my-project/download/coma-platform-capabilities-and-goals.docx";
  fs.writeFileSync(out, buf);
  console.log("WROTE", out, buf.length, "bytes");
});

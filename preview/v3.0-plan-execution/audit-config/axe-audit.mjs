// axe-core Playwright audit — PREVIEW
// Activation: install deps: bun add -D @axe-core/playwright playwright
//             copy this file to scripts/axe-audit.mjs at repo root
//             add to CI workflow as a step
//
// Implements AISalon-Team-Plan-V3.0 §3.3 Accessibility (WCAG 2.1 AA).
// Runs axe-core against every top-level route. Acceptance criterion:
//   0 serious or critical violations (per plan §3.3).
//
// Usage: node scripts/axe-audit.mjs
//   BASE_URL=http://localhost:3000 node scripts/axe-audit.mjs  # against dev
//   BASE_URL=https://aisalon.massapro.com node scripts/axe-audit.mjs  # prod

import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.BASE_URL || "http://localhost:3000";

const ROUTES = [
  { path: "/", requiresAuth: false, label: "Home" },
  { path: "/events", requiresAuth: false, label: "Events list" },
  { path: "/login", requiresAuth: false, label: "Login" },
  { path: "/admin", requiresAuth: true, label: "Admin dashboard" },
  { path: "/admin/members", requiresAuth: true, label: "Admin members" },
  { path: "/admin/registrants", requiresAuth: true, label: "Admin registrants" },
  { path: "/admin/speakers", requiresAuth: true, label: "Admin speakers" },
  { path: "/admin/email", requiresAuth: true, label: "Admin email campaigns" },
];

let totalViolations = 0;
const results = [];

const browser = await chromium.launch();

for (const route of ROUTES) {
  const page = await browser.newPage();
  try {
    if (route.requiresAuth) {
      // Log in via credentials provider
      await page.goto(`${BASE}/login`);
      await page.fill('input[name="email"]', process.env.SMOKE_TEST_EMAIL || "eze@massapro.com");
      await page.fill('input[name="password"]', process.env.SMOKE_TEST_PASSWORD || "");
      await page.click('button[type="submit"]');
      await page.waitForLoadState("networkidle");
    }

    await page.goto(`${BASE}${route.path}`);
    await page.waitForLoadState("networkidle");

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    const serious = axe.violations.filter(v =>
      ["serious", "critical"].includes(v.impact)
    );
    const moderate = axe.violations.filter(v =>
      ["moderate"].includes(v.impact)
    );
    const minor = axe.violations.filter(v =>
      ["minor"].includes(v.impact)
    );

    const passed = serious.length === 0;
    results.push({
      route: route.path,
      label: route.label,
      passed,
      serious: serious.length,
      moderate: moderate.length,
      minor: minor.length,
      violations: serious,
    });

    if (passed) {
      console.log(`  ✓ ${route.label} (${route.path}) — 0 serious/critical`);
    } else {
      console.log(`  ✗ ${route.label} (${route.path}) — ${serious.length} serious/critical:`);
      for (const v of serious) {
        console.log(`      [${v.impact}] ${v.id}: ${v.description}`);
        console.log(`        help: ${v.help}`);
        console.log(`        ${v.nodes.length} node(s) affected`);
      }
      totalViolations += serious.length;
    }
  } catch (err) {
    console.log(`  ! ${route.label} (${route.path}) — error: ${err.message}`);
    results.push({ route: route.path, label: route.label, passed: false, error: err.message });
  } finally {
    await page.close();
  }
}

await browser.close();

console.log("\n" + "=".repeat(60));
console.log("  Accessibility Audit Summary (WCAG 2.1 AA)");
console.log("=".repeat(60));
console.log(`  Routes audited: ${results.length}`);
console.log(`  Routes passing: ${results.filter(r => r.passed).length}`);
console.log(`  Routes failing: ${results.filter(r => !r.passed).length}`);
console.log(`  Serious/critical violations: ${totalViolations}`);
console.log("=".repeat(60));

if (totalViolations > 0) {
  console.log("\n  RESULT: FAIL — fix serious/critical violations before deploy");
  // Write JSON report for CI artifact
  const fs = await import("node:fs/promises");
  await fs.writeFile("axe-audit-report.json", JSON.stringify(results, null, 2));
  console.log("  Full report: axe-audit-report.json");
  process.exit(1);
} else {
  console.log("\n  RESULT: PASS — acceptance criterion met (0 serious/critical)");
  process.exit(0);
}

# Test Plan: {Feature Name}

> Copy this file to `docs/test-plans/{feature-name}.md` at the repo root.
> Required for any feature estimated at M or larger (per plan §12 QA role).
> Reviewed by the feature developer before testing begins.

## Scope

{What is being tested? Name the feature, the user stories it enables, and the API endpoints or UI flows it touches. 1-2 paragraphs.}

**In scope:**
- {Capability 1}
- {Capability 2}
- {Capability 3}

**Out of scope:**
- {Explicit non-goal 1}
- {Explicit non-goal 2}

## Environment

- **Production URL:** https://aisalon.massapro.com
- **Test accounts:** `eze@massapro.com` (Super Admin), {list other test accounts and their roles}
- **Test data:** {describe any seed data required — e.g., "an event with slug 'test-event' must exist with at least 3 speakers"}
- **Browser/viewport matrix:** Chrome (desktop + mobile emulation), Safari (desktop), Firefox (desktop)
- **Tools:** Playwright (E2E), Vitest (unit), axe-core (accessibility), Chrome DevTools (performance)

## Test Cases

### TC-01: {Test case name}

- **Preconditions:** {what state must the system be in before this test}
- **Steps:**
  1. {step 1}
  2. {step 2}
  3. {step 3}
- **Expected result:** {what should happen — be specific and observable}
- **Actual result:** {filled in during testing}
- **Status:** Pass | Fail | Blocked

### TC-02: {Test case name}

- **Preconditions:** ...
- **Steps:** ...
- **Expected result:** ...
- **Actual result:** ...
- **Status:** ...

(Continue for each test case. Aim for at least one test per user story, plus edge cases and error paths.)

## Acceptance Criteria

The feature is considered done when:
- [ ] All test cases pass
- [ ] No serious or critical axe-core violations on the new UI
- [ ] Lighthouse Performance score ≥ 90 on the new route
- [ ] Smoke test for any new API endpoints is added to `scripts/prod-smoke-test-extended.mjs`
- [ ] No new TypeScript errors
- [ ] No new ESLint errors

## Regression Coverage

{What existing functionality might this feature break? List specific areas to re-test:}
- {Area 1 — e.g., "Existing member import flow — verify CSV upload still works"}
- {Area 2 — e.g., "Auth flow — verify login/logout still works for all roles"}

## Notes

{Any additional context, risks, or open questions.}

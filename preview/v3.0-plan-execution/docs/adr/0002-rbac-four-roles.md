# ADR-0002: Role-Based Access Control with Four Roles

- **Status:** Proposed (draft — review against actual RBAC implementation before promoting to `docs/adr/`)
- **Date:** 2026-06-23
- **Decision Owner:** Technical Architect
- **Consulted:** Security Engineer, Backend Developer, Product & Project Manager
- **Related ADRs:** ADR-0001

## Context

The platform currently has a binary role model: `ADMIN` and `MEMBER`, stored as a String column on the `User` table (default `"MEMBER"`). The V3.0 plan §1 (Executive Summary) and the user's 2026-06-23 request introduce a finer-grained model with four roles:

1. **Super Admin** — hardcoded for `eze@massapro.com` and `ezeszna@gmail.com`. Only Super Admins can delete users or change admin permissions. Has all Admin capabilities.
2. **Admin** — can add events, see all members info, run email campaigns, access all system features. Cannot delete users or change admin permissions.
3. **Co-host** — can add agendas and speakers to events, and co-edit events. Cannot add new events or see all member info.
4. **Member** — standard member. No admin capabilities.

The current binary model conflates "can manage members" with "can manage events" with "can manage the system." This forces the platform owner to grant full Admin to anyone who needs to add a speaker to an event — a clear least-privilege violation per the Security Engineer's Working Methodology (V3.0 plan §15).

## Decision

Extend the existing `role` String column on `User` to accept four values: `SUPER_ADMIN`, `ADMIN`, `CO_HOST`, `MEMBER`. Keep the column as a String (not a Prisma enum) to avoid a destructive migration on the production PostgreSQL database — the column already accepts arbitrary strings, and validation moves to the application layer.

Super Admin status is determined by a hardcoded email allowlist (`SUPER_ADMIN_EMAILS`) in `src/lib/auth-guards.ts`, not by a database column. This means Super Admin status cannot be granted or revoked through the UI — only by changing code. This is intentional: it prevents privilege escalation by a compromised Admin account.

The role hierarchy is enforced by a single helper function `requireRole(session, minimumRole)` in `src/lib/auth-guards.ts`. Every admin API route calls this helper with the minimum role required for that action. The mapping of action → minimum role is documented in `src/lib/permissions.ts` and tested by a unit test suite.

## Consequences

### Positive
- Least-privilege model: Co-hosts can contribute to events without seeing all member data.
- Super Admin is unforgeable — a compromised Admin account cannot escalate to Super Admin.
- Role changes are audit-logged (per Security Engineer's KPI: "audit log coverage: 100%").
- The UI can conditionally render admin actions based on role, improving UX for Co-hosts (they don't see buttons they can't use).

### Negative
- Four roles is more complex than two. Role escalation paths must be carefully reviewed on every PR that touches an admin route.
- The hardcoded Super Admin email list means adding a new Super Admin requires a code deploy. This is acceptable for a small team but would not scale to a large organization.
- Migration: existing `ADMIN` users stay `ADMIN`. There is no automatic path to `SUPER_ADMIN` — only the two hardcoded emails get it. Existing `MEMBER` users who should be `CO_HOST` must be manually promoted by a Super Admin.

### Neutral
- The role column stays a String. Prisma enums would give us compile-time safety but require a migration. The trade-off is: application-layer validation (with unit tests) vs. database-layer validation (with migration risk).

## Alternatives Considered

### Alternative A: Prisma enum for the role column
- **Description:** Change `role String` to `role Role @default(MEMBER)` with `enum Role { SUPER_ADMIN ADMIN CO_HOST MEMBER }`.
- **Why not:** Requires a destructive migration on production Postgres. The String column already works and is more flexible if we add a fifth role later. Application-layer validation with unit tests catches invalid values at runtime.

### Alternative B: Permission-based ACL (no roles)
- **Description:** Replace the role column with a `permissions String[]` column. Each permission is a fine-grained capability (e.g., `event:create`, `member:read:all`, `user:delete`).
- **Why not:** Over-engineered for a community platform with 4 distinct usage patterns. The role abstraction is easier to reason about for the platform owner. If we need fine-grained permissions later, we can add them without removing roles.

### Alternative C: Super Admin stored in database
- **Description:** Add a `isSuperAdmin Boolean` column to User.
- **Why not:** A compromised Admin account could escalate itself by flipping the boolean. Hardcoded email allowlist is more secure — it requires a code change to escalate, which is reviewable and auditable in git history.

## References

- User request, 2026-06-23: "On the Community members table or card when opening the editor, allow me to select between this options, Admin, co-host, member. eze@massapro.com and ezeszna@gmail.com will be always the super Admin..."
- AISalon-Team-Plan-V3.0 §15 (Security Engineer role, "Least privilege" methodology)
- OWASP Access Control Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html
- WIP implementation files (in working tree, not yet committed): `src/lib/auth-guards.ts`, `src/lib/permissions.ts`, `src/lib/auth.ts`

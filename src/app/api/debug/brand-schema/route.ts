import { NextResponse } from "next/server";
import { db } from "@/lib/db";

/**
 * GET /api/debug/brand-schema
 *
 * Diagnostic endpoint — returns the columns on the BrandOnboardingInvite
 * table + the FK action on invitedById + Brand mascot columns + recent
 * _prisma_migrations entries. Used to verify the 20260921000000 migration
 * has applied on prod. No auth (read-only schema introspection).
 */
export async function GET() {
  try {
    const columns = await db.$queryRaw<{ column_name: string; is_nullable: string; data_type: string }[]>`
      SELECT column_name, is_nullable, data_type
      FROM information_schema.columns
      WHERE table_name = 'BrandOnboardingInvite'
      ORDER BY ordinal_position
    `;
    const fks = await db.$queryRaw<{ conname: string; confdeltype: string }[]>`
      SELECT conname, confdeltype
      FROM pg_constraint
      WHERE conrelid = '"BrandOnboardingInvite"'::regclass
        AND contype = 'f'
    `;
    const indexes = await db.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes WHERE tablename = 'BrandOnboardingInvite'
    `;
    const brandCols = await db.$queryRaw<{ column_name: string; is_nullable: string }[]>`
      SELECT column_name, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'Brand'
        AND column_name IN ('mascotName', 'mascotImageUrl', 'mascotBackstory', 'brandBookUrl')
      ORDER BY ordinal_position
    `;
    const appliedMigrations = await db.$queryRaw<{ migration_name: string; finished_at: Date | null; rolled_back_at: Date | null }[]>`
      SELECT migration_name, finished_at, rolled_back_at
      FROM _prisma_migrations
      WHERE migration_name LIKE '%20260921000000%' OR migration_name LIKE '%20260919140000%'
      ORDER BY started_at DESC
      LIMIT 5
    `;
    return NextResponse.json({
      brandOnboardingInvite: {
        columns: columns.map((c) => ({ name: c.column_name, nullable: c.is_nullable === "YES", type: c.data_type })),
        foreignKeys: fks.map((f) => ({
          name: f.conname,
          onDelete:
            f.confdeltype === "a" ? "NO_ACTION"
            : f.confdeltype === "r" ? "RESTRICT"
            : f.confdeltype === "c" ? "CASCADE"
            : f.confdeltype === "n" ? "SET_NULL"
            : f.confdeltype === "d" ? "SET_DEFAULT"
            : `UNKNOWN(${f.confdeltype})`,
        })),
        indexes: indexes.map((i) => i.indexname),
      },
      brandMascotColumns: brandCols.map((c) => ({ name: c.column_name, nullable: c.is_nullable === "YES" })),
      appliedMigrations: appliedMigrations.map((m) => ({
        name: m.migration_name,
        finishedAt: m.finished_at ? new Date(m.finished_at).toISOString() : null,
        rolledBackAt: m.rolled_back_at ? new Date(m.rolled_back_at).toISOString() : null,
      })),
    });
  } catch (err) {
    return NextResponse.json({
      error: err instanceof Error ? err.message : String(err),
    }, { status: 500 });
  }
}

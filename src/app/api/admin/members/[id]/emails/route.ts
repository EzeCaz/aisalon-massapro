import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";

/**
 * POST /api/admin/members/[id]/emails
 *
 * Attach a secondary email to a member. The member's primary email
 * (User.email) is the immutable identity; secondary emails just allow
 * sign-in via a different inbox. The same person, multiple addresses.
 *
 * Body: { email: string, label?: string }
 *
 * Validation:
 *   - Admin only
 *   - User must exist
 *   - Email must be a valid format
 *   - Email must not already be a primary email of any user
 *   - Email must not already be a secondary email of any user
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;

  let body: { email?: string; label?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const label = (body.label || "").trim().slice(0, 40) || null;

  // Verify the user exists
  const target = await db.user.findUnique({ where: { id: userId } });
  if (!target) {
    return NextResponse.json({ error: "Member not found." }, { status: 404 });
  }

  // Don't allow adding the user's own primary email as a secondary
  if (email === target.email.toLowerCase()) {
    return NextResponse.json(
      { error: "This is already the member's primary email." },
      { status: 400 }
    );
  }

  // Check if the email is already in use as a primary email
  const existingPrimary = await db.user.findUnique({ where: { email } });
  if (existingPrimary) {
    return NextResponse.json(
      {
        error: `This email is already the primary email of another member: ${existingPrimary.name || existingPrimary.email}.`,
      },
      { status: 409 }
    );
  }

  // Check if it's already a secondary email
  const existingSecondary = await db.userEmail.findUnique({
    where: { email },
    include: { user: { select: { name: true, email: true } } },
  });
  if (existingSecondary) {
    return NextResponse.json(
      {
        error: `This email is already attached to another member: ${existingSecondary.user.name || existingSecondary.user.email}.`,
      },
      { status: 409 }
    );
  }

  const created = await db.userEmail.create({
    data: { userId, email, label },
  });

  return NextResponse.json({ ok: true, email: created });
}

/**
 * GET /api/admin/members/[id]/emails
 * Returns all secondary emails for the member.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me || !can(me.role, "members.view")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: userId } = await params;
  const emails = await db.userEmail.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  return NextResponse.json({ emails });
}

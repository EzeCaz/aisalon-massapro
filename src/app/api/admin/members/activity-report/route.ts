import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { can, isSuperAdmin } from "@/lib/permissions";

/**
 * GET /api/admin/members/activity-report?email=<email>
 *
 * Aggregates EVERY observable action for a single user, looked up by
 * primary OR secondary email. Returns a structured JSON document with:
 *
 *   - profile              (User row + secondary emails + member tags)
 *   - emails               (EmailQueue rows sent to this user, with
 *                           tracking logs joined in)
 *   - rsvps                (EventRsvp rows: RSVP status, check-in code,
 *                           door check-in, attendance)
 *   - coHostedEvents       (EventCoHost rows for this user)
 *   - speakerSlots         (Speaker rows linked to this user)
 *   - referralsDriven      (ReferralVisit + ReferralAttribution where
 *                           this user is the referrer)
 *   - referralSignup       (ReferralAttribution where this user is the
 *                           referred — i.e. who drove their signup)
 *   - messagesSent         (ConversationMessage rows from this user)
 *   - messagesReceived     (ConversationMessage rows to this user)
 *   - quizSessionsHosted   (QuizSession rows where this user is host)
 *
 * NOTE: This project does NOT have working page-view or button-click
 * tracking — the `PageView` / `ClickEvent` / `TrackedLead` /
 * `ReferralConversion` models are referenced in /api/track/* but were
 * never added to schema.prisma, so those endpoints 500 at runtime.
 * The most granular "page view" signal we have for a user is the
 * middleware-recorded `ReferralVisit` row, which only fires when a
 * visitor lands with `?utm_uid=<hex>` on the URL (i.e. someone clicked
 * a member's share link). Direct authenticated page views are NOT
 * tracked anywhere in the DB.
 *
 * Permission: any admin with `members.view` (SUPER_ADMIN or ADMIN).
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!can(me.role, "members.view") && !isSuperAdmin({ email: me.email, role: me.role })) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") || "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Valid email parameter required" }, { status: 400 });
  }

  // 1) Resolve the user by primary email OR secondary email.
  let user = await db.user.findUnique({
    where: { email },
    include: {
      tags: true,
      secondaryEmails: true,
    },
  });

  let resolvedViaSecondary: { userId: string; label: string | null } | null = null;
  if (!user) {
    const sec = await db.userEmail.findUnique({
      where: { email },
      include: { user: { include: { tags: true, secondaryEmails: true } } },
    });
    if (sec) {
      user = sec.user;
      resolvedViaSecondary = { userId: sec.user.id, label: sec.label };
    }
  }

  if (!user) {
    return NextResponse.json(
      {
        error: "User not found",
        email,
        searchedPrimary: true,
        searchedSecondary: true,
      },
      { status: 404 },
    );
  }

  const userId = user.id;

  // 2) Fan out all the parallel-safe queries. Prisma doesn't support
  //    `Promise.all` on its client in a transactional way, but each of
  //    these is a read-only findMany — safe to run concurrently.
  const [
    emails,
    rsvps,
    coHosted,
    speakerSlots,
    referralVisits,
    referralSignupsDriven,
    mySignupAttribution,
    messagesSent,
    messagesReceived,
    quizHosted,
  ] = await Promise.all([
    // All EmailQueue rows for this user, with tracking logs inlined.
    db.emailQueue.findMany({
      where: { OR: [{ userId }, { email: user.email }] },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true } },
        trackingLogs: { orderBy: { createdAt: "asc" } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // All RSVPs (linked by userId OR by email — pre-signup RSVPs use email).
    db.eventRsvp.findMany({
      where: { OR: [{ userId }, { email: user.email }] },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true, venue: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Events this user co-hosts.
    db.eventCoHost.findMany({
      where: { userId },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true } },
      },
      orderBy: { createdAt: "desc" },
    }),

    // Speaker slots linked to this user.
    db.speaker.findMany({
      where: { userId },
      include: {
        event: { select: { id: true, title: true, slug: true, startsAt: true } },
      },
      orderBy: { createdAt: "asc" },
    }),

    // Referral visits to THIS user's share links.
    db.referralVisit.findMany({
      where: { referrerUserId: userId },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),

    // Signups this user drove (conversions attributed to them).
    db.referralAttribution.findMany({
      where: { referrerUserId: userId },
      include: {
        referredUser: { select: { id: true, email: true, name: true, createdAt: true } },
      },
      orderBy: { convertedAt: "desc" },
    }),

    // If THIS user was referred by someone, who?
    db.referralAttribution.findFirst({
      where: { referredUserId: userId },
      include: {
        referrer: { select: { id: true, email: true, name: true } },
      },
    }),

    // DMs sent.
    db.conversationMessage.findMany({
      where: { senderId: userId },
      include: {
        recipient: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),

    // DMs received.
    db.conversationMessage.findMany({
      where: { recipientId: userId },
      include: {
        sender: { select: { id: true, email: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),

    // Quiz sessions hosted.
    db.quizSession.findMany({
      where: { hostId: userId },
      include: {
        event: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // 3) Build a unified, chronological activity feed.
  type FeedItem = {
    timestamp: string;
    type: string;
    summary: string;
    details?: Record<string, unknown>;
  };
  const feed: FeedItem[] = [];

  // Profile creation
  feed.push({
    timestamp: user.createdAt.toISOString(),
    type: "ACCOUNT_CREATED",
    summary: `Account created${user.onboardedAt ? "" : " (not yet onboarded)"}`,
    details: {
      email: user.email,
      name: user.name,
      role: user.role,
      onboardedAt: user.onboardedAt?.toISOString() ?? null,
      utmUid: user.utmUid,
      importSource: user.importSource,
    },
  });

  if (user.onboardedAt) {
    feed.push({
      timestamp: user.onboardedAt.toISOString(),
      type: "PROFILE_ONBOARDED",
      summary: "Completed onboarding",
    });
  }

  // Referral signup attribution (who drove this user's signup)
  if (mySignupAttribution) {
    feed.push({
      timestamp: mySignupAttribution.convertedAt.toISOString(),
      type: "SIGNUP_ATTRIBUTED",
      summary: `Signup attributed to referrer ${mySignupAttribution.referrer.email}`,
      details: {
        referrerEmail: mySignupAttribution.referrer.email,
        referrerName: mySignupAttribution.referrer.name,
        utmUid: mySignupAttribution.utmUid,
      },
    });
  }

  // RSVPs
  for (const rsvp of rsvps) {
    feed.push({
      timestamp: rsvp.createdAt.toISOString(),
      type: "RSVP_CREATED",
      summary: `RSVP'd "${rsvp.status}" to "${rsvp.event.title}"`,
      details: {
        rsvpId: rsvp.id,
        eventId: rsvp.eventId,
        eventTitle: rsvp.event.title,
        eventSlug: rsvp.event.slug,
        eventStartsAt: rsvp.event.startsAt.toISOString(),
        status: rsvp.status,
        source: rsvp.source,
        checkInCode: rsvp.checkInCode,
      },
    });
    if (rsvp.checkedInAt) {
      feed.push({
        timestamp: rsvp.checkedInAt.toISOString(),
        type: "CHECKIN_CODE_GENERATED",
        summary: `Generated check-in code ${rsvp.checkInCode ?? "(no code)"} for "${rsvp.event.title}"`,
      });
    }
    if (rsvp.doorCheckedAt) {
      feed.push({
        timestamp: rsvp.doorCheckedAt.toISOString(),
        type: "DOOR_CHECKED_IN",
        summary: `Door check-in verified for "${rsvp.event.title}"`,
        details: { doorCheckedBy: rsvp.doorCheckedBy },
      });
    }
    if (rsvp.approvedAt) {
      feed.push({
        timestamp: rsvp.approvedAt.toISOString(),
        type: "RSVP_APPROVED",
        summary: `Co-host approved RSVP for "${rsvp.event.title}"`,
        details: { approvedByCoHostId: rsvp.approvedByCoHostId },
      });
    }
    if (rsvp.attendedAt) {
      feed.push({
        timestamp: rsvp.attendedAt.toISOString(),
        type: "ATTENDANCE_MARKED",
        summary: `Marked as attended "${rsvp.event.title}"`,
        details: { attendedMarkedBy: rsvp.attendedMarkedBy, noShow: rsvp.noShow },
      });
    }
  }

  // Emails + tracking logs
  for (const e of emails) {
    feed.push({
      timestamp: e.createdAt.toISOString(),
      type: "EMAIL_QUEUED",
      summary: `Stage ${e.stage} email queued for "${e.event.title}" (${e.status})`,
      details: {
        queueId: e.id,
        subject: e.subject,
        status: e.status,
        stage: e.stage,
        scheduledFor: e.scheduledFor.toISOString(),
        errorMessage: e.errorMessage,
      },
    });
    if (e.sentAt) {
      feed.push({
        timestamp: e.sentAt.toISOString(),
        type: "EMAIL_SENT",
        summary: `Stage ${e.stage} email sent for "${e.event.title}"`,
      });
    }
    for (const log of e.trackingLogs) {
      if (log.type === "OPEN") {
        feed.push({
          timestamp: log.createdAt.toISOString(),
          type: "EMAIL_OPENED",
          summary: `Opened stage ${e.stage} email for "${e.event.title}"`,
          details: { userAgent: log.userAgent, ip: log.ip },
        });
      } else if (log.type === "CLICK") {
        feed.push({
          timestamp: log.createdAt.toISOString(),
          type: "EMAIL_LINK_CLICKED",
          summary: `Clicked link in stage ${e.stage} email for "${e.event.title}"`,
          details: { targetUrl: log.targetUrl, userAgent: log.userAgent, ip: log.ip },
        });
      }
    }
  }

  // Co-host additions
  for (const ch of coHosted) {
    feed.push({
      timestamp: ch.createdAt.toISOString(),
      type: "COHOST_ADDED",
      summary: `Added as co-host of "${ch.event.title}"`,
      details: { addedBy: ch.addedBy },
    });
  }

  // Speaker slots
  for (const sp of speakerSlots) {
    feed.push({
      timestamp: sp.createdAt?.toISOString?.() ?? new Date(0).toISOString(),
      type: "SPEAKER_SLOT",
      summary: `Listed as speaker for "${sp.event.title}" — topic: ${sp.topic ?? "(none)"}`,
      details: {
        speakerId: sp.id,
        role: sp.role,
        company: sp.company,
        topic: sp.topic,
      },
    });
  }

  // Referral visits (someone clicked this user's share link)
  for (const rv of referralVisits) {
    feed.push({
      timestamp: rv.createdAt.toISOString(),
      type: "REFERRAL_VISIT",
      summary: `Visitor landed on ${rv.landingPath} via this user's share link${rv.isNewVisitor ? " (new visitor)" : ""}`,
      details: {
        landingPath: rv.landingPath,
        utmSource: rv.utmSource,
        utmMedium: rv.utmMedium,
        utmCampaign: rv.utmCampaign,
        utmContent: rv.utmContent,
        isNewVisitor: rv.isNewVisitor,
        visitorHash: rv.visitorHash,
      },
    });
  }

  // Referral conversions (signups driven by this user)
  for (const ra of referralSignupsDriven) {
    feed.push({
      timestamp: ra.convertedAt.toISOString(),
      type: "REFERRAL_CONVERTED",
      summary: `Drove signup of ${ra.referredUser.email}`,
      details: {
        referredEmail: ra.referredUser.email,
        referredName: ra.referredUser.name,
      },
    });
  }

  // DMs sent
  for (const m of messagesSent) {
    feed.push({
      timestamp: m.createdAt.toISOString(),
      type: "DM_SENT",
      summary: `Sent DM to ${m.recipient.email}${m.readAt ? " (read)" : " (unread)"}`,
      details: {
        recipientEmail: m.recipient.email,
        recipientName: m.recipient.name,
        bodyPreview: m.body.slice(0, 200),
        readAt: m.readAt?.toISOString() ?? null,
      },
    });
  }

  // DMs received
  for (const m of messagesReceived) {
    feed.push({
      timestamp: m.createdAt.toISOString(),
      type: "DM_RECEIVED",
      summary: `Received DM from ${m.sender.email}${m.readAt ? " (read)" : " (unread)"}`,
      details: {
        senderEmail: m.sender.email,
        senderName: m.sender.name,
        bodyPreview: m.body.slice(0, 200),
        readAt: m.readAt?.toISOString() ?? null,
      },
    });
  }

  // Quiz sessions hosted
  for (const q of quizHosted) {
    feed.push({
      timestamp: q.createdAt.toISOString(),
      type: "QUIZ_HOSTED",
      summary: `Hosted quiz session "${q.title}" (${q.status})`,
      details: {
        quizId: q.id,
        title: q.title,
        status: q.status,
        eventTitle: q.event?.title ?? null,
      },
    });
  }

  // Sort feed by timestamp desc
  feed.sort((a, b) => (a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0));

  // 4) Compute summary stats
  const summary = {
    accountCreated: user.createdAt.toISOString(),
    onboardedAt: user.onboardedAt?.toISOString() ?? null,
    totalEmailsQueued: emails.length,
    emailsSent: emails.filter((e) => e.status === "SENT" || e.status === "OPENED" || e.status === "CLICKED").length,
    emailsOpened: emails.filter((e) => e.status === "OPENED" || e.status === "CLICKED" || e.trackingLogs.some((l) => l.type === "OPEN")).length,
    emailsClicked: emails.filter((e) => e.status === "CLICKED" || e.trackingLogs.some((l) => l.type === "CLICK")).length,
    emailsSkipped: emails.filter((e) => e.status === "SKIPPED").length,
    emailsFailed: emails.filter((e) => e.status === "FAILED").length,
    totalRSVPs: rsvps.length,
    doorCheckIns: rsvps.filter((r) => r.doorCheckedAt).length,
    attended: rsvps.filter((r) => r.attendedAt).length,
    coHostedEvents: coHosted.length,
    speakerSlots: speakerSlots.length,
    referralVisits: referralVisits.length,
    referralConversions: referralSignupsDriven.length,
    dmsSent: messagesSent.length,
    dmsReceived: messagesReceived.length,
    quizSessionsHosted: quizHosted.length,
  };

  return NextResponse.json({
    query: { email, requestedAt: new Date().toISOString() },
    resolvedVia: resolvedViaSecondary
      ? `secondary email (${resolvedViaSecondary.label ?? "unlabeled"})`
      : "primary email",
    profile: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      company: user.company,
      title: user.title,
      bio: user.bio,
      linkedinUrl: user.linkedinUrl,
      portfolioUrl: user.portfolioUrl,
      photoUrl: user.photoUrl,
      utmUid: user.utmUid,
      createdAt: user.createdAt.toISOString(),
      onboardedAt: user.onboardedAt?.toISOString() ?? null,
      importSource: user.importSource,
      importedAt: user.importedAt?.toISOString() ?? null,
      interestedIn: user.interestedIn,
      profileCategories: user.profileCategories,
      appliedFor: user.appliedFor,
      invitedToSpeak: user.invitedToSpeak,
      mobile: user.mobile,
      tags: user.tags.map((t) => ({ id: t.id, label: t.label, color: t.color })),
      secondaryEmails: user.secondaryEmails.map((e) => ({ email: e.email, label: e.label })),
    },
    summary,
    feed,
    raw: {
      emails: emails.map((e) => ({
        id: e.id,
        stage: e.stage,
        status: e.status,
        subject: e.subject,
        eventTitle: e.event.title,
        scheduledFor: e.scheduledFor.toISOString(),
        sentAt: e.sentAt?.toISOString() ?? null,
        openedAt: e.openedAt?.toISOString() ?? null,
        clickedAt: e.clickedAt?.toISOString() ?? null,
        errorMessage: e.errorMessage,
        trackingLogs: e.trackingLogs.map((l) => ({
          type: l.type,
          targetUrl: l.targetUrl,
          createdAt: l.createdAt.toISOString(),
          userAgent: l.userAgent,
        })),
      })),
      rsvps: rsvps.map((r) => ({
        id: r.id,
        eventTitle: r.event.title,
        eventStartsAt: r.event.startsAt.toISOString(),
        status: r.status,
        source: r.source,
        checkInCode: r.checkInCode,
        checkedInAt: r.checkedInAt?.toISOString() ?? null,
        doorCheckedAt: r.doorCheckedAt?.toISOString() ?? null,
        approvedAt: r.approvedAt?.toISOString() ?? null,
        attendedAt: r.attendedAt?.toISOString() ?? null,
        noShow: r.noShow,
        referredByUserId: r.referredByUserId,
        createdAt: r.createdAt.toISOString(),
      })),
      coHosted: coHosted.map((c) => ({
        eventTitle: c.event.title,
        eventStartsAt: c.event.startsAt.toISOString(),
        addedAt: c.createdAt.toISOString(),
        addedBy: c.addedBy,
      })),
      speakerSlots: speakerSlots.map((s) => ({
        eventTitle: s.event.title,
        eventStartsAt: s.event.startsAt.toISOString(),
        topic: s.topic,
        role: s.role,
        company: s.company,
      })),
      referralVisits: referralVisits.map((v) => ({
        at: v.createdAt.toISOString(),
        landingPath: v.landingPath,
        utmSource: v.utmSource,
        utmMedium: v.utmMedium,
        utmCampaign: v.utmCampaign,
        isNewVisitor: v.isNewVisitor,
      })),
      referralConversions: referralSignupsDriven.map((r) => ({
        at: r.convertedAt.toISOString(),
        referredEmail: r.referredUser.email,
        referredName: r.referredUser.name,
      })),
      mySignupAttribution: mySignupAttribution
        ? {
            referrerEmail: mySignupAttribution.referrer.email,
            referrerName: mySignupAttribution.referrer.name,
            convertedAt: mySignupAttribution.convertedAt.toISOString(),
          }
        : null,
      messagesSent: messagesSent.map((m) => ({
        at: m.createdAt.toISOString(),
        to: m.recipient.email,
        bodyPreview: m.body.slice(0, 200),
        readAt: m.readAt?.toISOString() ?? null,
      })),
      messagesReceived: messagesReceived.map((m) => ({
        at: m.createdAt.toISOString(),
        from: m.sender.email,
        bodyPreview: m.body.slice(0, 200),
        readAt: m.readAt?.toISOString() ?? null,
      })),
      quizHosted: quizHosted.map((q) => ({
        id: q.id,
        title: q.title,
        status: q.status,
        eventTitle: q.event?.title ?? null,
        createdAt: q.createdAt.toISOString(),
      })),
    },
  });
}

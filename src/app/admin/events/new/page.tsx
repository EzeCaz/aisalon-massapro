import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { AppHeader } from "@/components/ais/app-header";
import { AdminTabs } from "@/components/ais/admin-tabs";
import { NewEventForm } from "./new-event-form";

export const metadata = { title: "New event — Admin — AI Salon Tel Aviv" };

export default async function AdminNewEventPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) redirect("/login?callbackUrl=/admin/events/new");

  const me = await db.user.findUnique({ where: { email: session.user.email } });
  if (!me) redirect("/login");
  if (me.role !== "ADMIN") redirect("/events");

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <AppHeader />
      <main className="flex-1 mx-auto max-w-7xl w-full px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        <AdminTabs />

        <div className="mb-6">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.3em] text-[#FF005A] mb-2">
            Admin Panel · New event
          </p>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-black">
            Create a new event
          </h1>
          <p className="mt-2 text-sm text-black/60 max-w-2xl">
            Fill in the basics and you'll be taken to the new event's page
            where you can add speakers, agenda, and images. Title, start time,
            and end time are required — everything else is optional and
            editable later.
          </p>
        </div>

        <NewEventForm />
      </main>
    </div>
  );
}

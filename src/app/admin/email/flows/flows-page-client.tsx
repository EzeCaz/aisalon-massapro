"use client";

/**
 * FlowsPageClient — top-level client for /admin/email/flows.
 *
 * Three tabs:
 *   - Flows: the flow builder (existing)
 *   - Audiences: audience management (new)
 *   - Templates: stage template editing + duplicate + metrics (new)
 *
 * All three tabs share the same data sources (templates, audiences, events)
 * fetched on the server and passed in as props.
 */

import * as React from "react";
import { Workflow, Users, FileText } from "lucide-react";
import { FlowBuilderClient } from "./flow-builder-client";
import { AudiencesClient } from "./audiences-client";
import { TemplatesClient } from "./templates-client";
import type { FlowTemplate, FlowAudience } from "@/components/ais/flow-builder/flow-builder-canvas";

type Props = {
  templates: FlowTemplate[];
  events: { id: string; title: string; slug: string; startsAt: string }[];
  initialAudiences: FlowAudience[];
};

type Tab = "flows" | "audiences" | "templates";

export function FlowsPageClient({
  templates,
  events,
  initialAudiences,
}: Props) {
  const [tab, setTab] = React.useState<Tab>("flows");
  // Lifted audience + template state so changes in one tab reflect in another.
  const [audiences, setAudiences] = React.useState<FlowAudience[]>(initialAudiences);
  const [templatesState, setTemplatesState] = React.useState<FlowTemplate[]>(templates);

  // Listen for "navigate to audiences tab" events dispatched from the flow
  // step editor's "New" audience button.
  React.useEffect(() => {
    const handler = () => setTab("audiences");
    window.addEventListener("navigate-to-audiences-tab", handler);
    return () => window.removeEventListener("navigate-to-audiences-tab", handler);
  }, []);

  return (
    <div>
      {/* Tab switcher */}
      <div className="mb-4 flex gap-1 border-b border-neutral-200">
        <TabButton active={tab === "flows"} onClick={() => setTab("flows")} icon={<Workflow className="h-3.5 w-3.5" />} label="Flows" />
        <TabButton active={tab === "audiences"} onClick={() => setTab("audiences")} icon={<Users className="h-3.5 w-3.5" />} label="Audiences" />
        <TabButton active={tab === "templates"} onClick={() => setTab("templates")} icon={<FileText className="h-3.5 w-3.5" />} label="Templates" />
      </div>

      {tab === "flows" && (
        <FlowBuilderClient
          templates={templatesState}
          events={events}
          initialAudiences={audiences}
        />
      )}
      {tab === "audiences" && (
        <AudiencesClient
          initialAudiences={audiences as never /* AudiencesClient uses its own Audience type */}
          onAudiencesChange={(next) => {
            // Map back to FlowAudience shape (id, name, isTest, emails).
            // For DYNAMIC audiences, emails may be empty here — that's fine,
            // the flow step editor will call /api/email-audiences/[id]/emails
            // to resolve them when needed.
            setAudiences(
              next.map((a: { id: string; name: string; isTest: boolean; emails: string[]; kind: string }) => ({
                id: a.id,
                name: a.name,
                isTest: a.isTest,
                emails: a.emails,
              })),
            );
          }}
        />
      )}
      {tab === "templates" && (
        <TemplatesClient
          templates={[]}
          onTemplatesChange={(next) => {
            // Update FlowBuilderClient's templates prop (minimal shape).
            setTemplatesState(next.map((t) => ({
              id: t.id,
              name: t.name,
              subject: t.subject,
              stage: t.stage,
              isDefault: t.isDefault,
              isActive: t.isActive,
            })));
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold transition-colors ${
        active
          ? "border-b-2 border-[#FF005A] text-[#FF005A]"
          : "border-b-2 border-transparent text-neutral-500 hover:text-neutral-800"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

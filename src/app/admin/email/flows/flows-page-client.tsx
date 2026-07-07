"use client";

/**
 * FlowsPageClient — top-level client for /admin/email/flows.
 *
 * Three sub-views (driven by the parent EmailAdminNav submenu):
 *   - Flows: the flow builder
 *   - Audiences: audience management
 *   - Templates: stage template editing + duplicate + metrics
 *
 * The submenu is rendered by <EmailAdminNav> (in the server page). This
 * component just listens for the active sub-tab via window events so the
 * nav and the body stay in sync. The nav dispatches:
 *   window.dispatchEvent(new CustomEvent("flow-subtab-change", { detail: "flows" | "audiences" | "templates" }))
 */

import * as React from "react";
import { FlowBuilderClient } from "./flow-builder-client";
import { AudiencesClient } from "./audiences-client";
import { TemplatesClient } from "./templates-client";
import type { FlowTemplate, FlowAudience } from "@/components/ais/flow-builder/flow-builder-canvas";
import type { FlowSubtab } from "@/components/ais/email-admin-nav";

type Props = {
  templates: FlowTemplate[];
  events: { id: string; title: string; slug: string; startsAt: string }[];
  initialAudiences: FlowAudience[];
};

export function FlowsPageClient({
  templates,
  events,
  initialAudiences,
}: Props) {
  const [tab, setTab] = React.useState<FlowSubtab>("flows");
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

  // Listen for sub-tab changes dispatched by EmailAdminNav (parent).
  React.useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<FlowSubtab>).detail;
      if (detail) setTab(detail);
    };
    window.addEventListener("flow-subtab-change", handler);
    return () => window.removeEventListener("flow-subtab-change", handler);
  }, []);

  return (
    <div>
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
          events={events}
          onAudiencesChange={(next) => {
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

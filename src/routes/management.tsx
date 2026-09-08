import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { managementQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { MetricGrid } from "@/components/shared/MetricCard";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { SeverityTag, Tag } from "@/components/shared/Badges";
import { ValueTrendChart } from "@/components/charts/TrendChart";
import { fmtMoney, fmtPct, fmtQty } from "@/lib/format";
import type { Project } from "@/types";

export const Route = createFileRoute("/management")({
  head: () => ({
    meta: [
      { title: "Management Overview — SCIIP" },
      {
        name: "description",
        content:
          "Executive view of invoiced revenue, open backlog, program performance, risks and opportunities.",
      },
      { property: "og:title", content: "Management Overview — SCIIP" },
      { property: "og:description", content: "Programs, backlog, risks and opportunities at a glance." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(managementQuery);
  },
  component: ManagementPage,
});

function ManagementPage() {
  const { data } = useSuspenseQuery(managementQuery);

  const cols: Column<Project>[] = [
    { key: "name", header: "Program", cell: (p) => <span className="font-medium">{p.name}</span> },
    { key: "code", header: "Code", cell: (p) => <span className="font-mono text-xs">{p.code}</span> },
    { key: "customerCount", header: "Customers", align: "right", cell: (p) => fmtQty(p.customerCount) },
    { key: "partCount", header: "Parts", align: "right", cell: (p) => fmtQty(p.partCount) },
    { key: "totalDemandValue", header: "Demand", align: "right", cell: (p) => fmtMoney(p.totalDemandValue, { compact: true }) },
    { key: "openDemandValue", header: "Backlog", align: "right", cell: (p) => fmtMoney(p.openDemandValue, { compact: true }) },
    { key: "fulfillmentRate", header: "Fulfilled", align: "right", cell: (p) => fmtPct(p.fulfillmentRate, 0) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Intelligence layer"
        title="Management Overview"
        description="A single page for the leadership review: revenue, backlog, program health, and what is at risk."
      />

      <MetricGrid metrics={data.kpis} />

      <Panel title="Revenue and demand trend" subtitle="Monthly ordered value">
        <ValueTrendChart data={data.revenueTrend} />
      </Panel>

      <Panel title="Program performance" bodyClassName="p-0">
        <DataTable columns={cols} rows={data.projects} rowKey={(p) => p.code} />
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Critical risks" subtitle="Escalated by the Intelligence Engine">
          {data.risks.length === 0 ? (
            <EmptyState message="No critical risks open." />
          ) : (
            <ul className="space-y-2">
              {data.risks.map((r) => (
                <li key={r.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{r.title}</p>
                    <SeverityTag severity={r.severity} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{r.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel title="Top opportunities" subtitle="Largest commercial upside">
          {data.opportunities.length === 0 ? (
            <EmptyState message="No opportunities surfaced." />
          ) : (
            <ul className="space-y-2">
              {data.opportunities.map((o) => (
                <li key={o.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{o.headline}</p>
                    <Tag variant="success">{o.signalStrength}</Tag>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{o.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <BackendNote>
        `getManagementSummary()` is the single call behind this page, so board reporting can move to
        the Python service in one change.
      </BackendNote>
    </>
  );
}

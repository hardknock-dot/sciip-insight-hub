import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useState } from "react";
import { dashboardQuery } from "@/services/queries";
import { MetricGrid } from "@/components/shared/MetricCard";
import { Panel, PageHeader, EmptyState } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PatternBadge, RiskBadge, SeverityTag, Tag, TrendPill } from "@/components/shared/Badges";
import { BreakdownBars, DemandTrendChart } from "@/components/charts/TrendChart";
import { fmtMoney, fmtPct, fmtQty, titleCase } from "@/lib/format";
import type { AttentionItem, Customer, FulfillmentDistribution, Part } from "@/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SCIIP Command Center — Supply Chain Intelligence" },
      {
        name: "description",
        content:
          "Live view of demand value, fulfillment state, top customers and parts, and items needing attention, reconstructed from SAP sales register events.",
      },
      { property: "og:title", content: "SCIIP Command Center" },
      {
        property: "og:description",
        content: "Demand, fulfillment and attention signals reconstructed from SAP data.",
      },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(dashboardQuery);
  },
  component: CommandCenter,
});

const stateTone = {
  FULFILLED: "success",
  PARTIALLY_FULFILLED: "warning",
  OPEN: "info",
  NEEDS_REVIEW: "critical",
} as const;

function FulfillmentBar({ rows }: { rows: FulfillmentDistribution[] }) {
  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full border border-border">
        {rows.map((r) => (
          <div
            key={r.state}
            style={{ width: `${r.pct}%` }}
            className={
              r.state === "FULFILLED"
                ? "bg-success"
                : r.state === "PARTIALLY_FULFILLED"
                  ? "bg-warning"
                  : r.state === "OPEN"
                    ? "bg-info"
                    : "bg-critical"
            }
          />
        ))}
      </div>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.state} className="flex items-center justify-between gap-2 text-sm">
            <Tag variant={stateTone[r.state]}>{titleCase(r.state)}</Tag>
            <span className="font-mono text-xs text-muted-foreground">
              {fmtQty(r.lines)} lines · {fmtQty(r.qty)} units · {fmtPct(r.pct)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function AttentionCard({ item }: { item: AttentionItem }) {
  const [open, setOpen] = useState(false);
  const href =
    item.drilldown.kind === "demandLine"
      ? `/transactions/${item.drilldown.id}`
      : item.drilldown.kind === "part"
        ? `/parts/${item.drilldown.id}`
        : `/customers/${item.drilldown.id}`;

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">{item.title}</p>
        <SeverityTag severity={item.severity} />
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{item.entityLabel}</p>
      {open && <p className="mt-2 text-xs leading-relaxed text-foreground/85">{item.detail}</p>}
      <div className="mt-3 flex items-center gap-3 text-xs">
        <button
          onClick={() => setOpen((v) => !v)}
          className="font-medium text-info hover:underline"
        >
          {open ? "Hide reasoning" : "Why?"}
        </button>
        <Link to={href as "/"} className="text-muted-foreground hover:text-foreground">
          View details →
        </Link>
        <span className="label-caps ml-auto">{titleCase(item.category)}</span>
      </div>
    </div>
  );
}

function CommandCenter() {
  const { data } = useSuspenseQuery(dashboardQuery);
  const navigate = useNavigate();

  const customerCols: Column<Customer>[] = [
    { key: "name", header: "Customer", cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "region", header: "Region", cell: (c) => c.region },
    { key: "demandValue", header: "Demand", align: "right", cell: (c) => fmtMoney(c.demandValue, { compact: true }) },
    { key: "openDemandValue", header: "Open", align: "right", cell: (c) => fmtMoney(c.openDemandValue, { compact: true }) },
    { key: "fulfillmentRate", header: "Fulfilled", align: "right", cell: (c) => fmtPct(c.fulfillmentRate, 0) },
    { key: "trend", header: "Trend", align: "right", cell: (c) => <TrendPill trend={c.trend} /> },
    { key: "risk", header: "Risk", cell: (c) => <RiskBadge risk={c.risk} /> },
  ];

  const partCols: Column<Part>[] = [
    { key: "partCode", header: "Part", cell: (p) => <span className="font-mono text-xs font-medium">{p.partCode}</span> },
    { key: "description", header: "Description", cell: (p) => <span className="text-muted-foreground">{p.description}</span> },
    { key: "demandQty", header: "Demand qty", align: "right", cell: (p) => fmtQty(p.demandQty) },
    { key: "openDemandQty", header: "Open qty", align: "right", cell: (p) => fmtQty(p.openDemandQty) },
    { key: "pattern", header: "Pattern", cell: (p) => <PatternBadge pattern={p.demandPattern} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Knowledge layer"
        title="SCIIP Command Center"
        description="Every figure below is reconstructed from SAP sales-register events by the Transaction State Engine — sales orders, demand lines, deliveries and invoices."
      />

      <MetricGrid metrics={data.metrics} />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel
          className="xl:col-span-2"
          title="Demand vs. delivery trend"
          subtitle="Monthly ordered quantity against delivered quantity"
        >
          <DemandTrendChart data={data.demandTrend} />
        </Panel>
        <Panel title="Fulfillment status" subtitle="Distribution of reconstructed demand lines">
          <FulfillmentBar rows={data.fulfillment} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Open demand by project" subtitle="Units awaiting delivery">
          <BreakdownBars data={data.openDemandByProject} />
        </Panel>
        <Panel title="Open demand by customer" subtitle="Units awaiting delivery">
          <BreakdownBars data={data.openDemandByCustomer} />
        </Panel>
        <Panel title="Open demand by part" subtitle="Units awaiting delivery">
          <BreakdownBars data={data.openDemandByPart} />
        </Panel>
      </div>

      <Panel
        title="Attention required"
        subtitle="Signals raised by the Intelligence Engine — expand any card for the underlying reasoning"
      >
        {data.attention.length === 0 ? (
          <EmptyState message="No signals raised for the current dataset." />
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {data.attention.map((item) => (
              <AttentionCard key={item.id} item={item} />
            ))}
          </div>
        )}
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Top customers" subtitle="By total demand value" bodyClassName="p-0">
          <DataTable
            columns={customerCols}
            rows={data.topCustomers}
            rowKey={(c) => c.id}
            onRowClick={(c) => void navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}
          />
        </Panel>
        <Panel title="Top parts" subtitle="By total demand value" bodyClassName="p-0">
          <DataTable
            columns={partCols}
            rows={data.topParts}
            rowKey={(p) => p.id}
            onRowClick={(p) => void navigate({ to: "/parts/$partId", params: { partId: p.id } })}
          />
        </Panel>
      </div>
    </>
  );
}

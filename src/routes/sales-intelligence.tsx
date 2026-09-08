import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { salesIntelligenceQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PatternBadge, Tag, TrendPill } from "@/components/shared/Badges";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import type { Customer, SalesSignal } from "@/types";

export const Route = createFileRoute("/sales-intelligence")({
  head: () => ({
    meta: [
      { title: "Sales Intelligence — SCIIP" },
      {
        name: "description",
        content:
          "Opportunities, expected reorders, growing and dormant customers derived from demand history.",
      },
      { property: "og:title", content: "Sales Intelligence — SCIIP" },
      { property: "og:description", content: "Signals for the sales team, built from demand history." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(salesIntelligenceQuery);
  },
  component: SalesIntelligencePage,
});

const strengthTone = { HIGH: "success", MEDIUM: "warning", LOW: "neutral" } as const;

function SignalList({ signals }: { signals: SalesSignal[] }) {
  if (signals.length === 0) return <EmptyState message="No signals in this category." />;
  return (
    <ul className="space-y-2">
      {signals.map((s) => (
        <li key={s.id} className="rounded-md border border-border px-3 py-2">
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-medium">{s.headline}</p>
            <Tag variant={strengthTone[s.signalStrength]}>{s.signalStrength}</Tag>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{s.detail}</p>
          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
            <Link
              to="/customers/$customerId"
              params={{ customerId: s.customerId }}
              className="text-info hover:underline"
            >
              {s.customer}
            </Link>
            <span className="label-caps">{s.source}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

function SalesIntelligencePage() {
  const { data } = useSuspenseQuery(salesIntelligenceQuery);

  const custCols: Column<Customer>[] = [
    { key: "name", header: "Customer", cell: (c) => (
      <Link to="/customers/$customerId" params={{ customerId: c.id }} className="font-medium text-info hover:underline">
        {c.name}
      </Link>
    ) },
    { key: "demandValue", header: "Demand", align: "right", cell: (c) => fmtMoney(c.demandValue, { compact: true }) },
    { key: "openDemandQty", header: "Open qty", align: "right", cell: (c) => fmtQty(c.openDemandQty) },
    { key: "lastOrderDate", header: "Last order", align: "right", cell: (c) => fmtDate(c.lastOrderDate) },
    { key: "pattern", header: "Pattern", cell: (c) => <PatternBadge pattern={c.demandPattern} /> },
    { key: "trend", header: "Trend", align: "right", cell: (c) => <TrendPill trend={c.trend} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Intelligence layer"
        title="Sales Intelligence"
        description="Where to spend selling time next, inferred from reconstructed order history rather than opinion."
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Opportunities" subtitle="Cross-sell and volume signals">
          <SignalList signals={data.opportunities} />
        </Panel>
        <Panel title="Expected reorders" subtitle="Cadence suggests an order is due">
          <SignalList signals={data.expectedReorders} />
        </Panel>
        <Panel title="Follow-ups" subtitle="Open positions worth a call">
          <SignalList signals={data.followUps} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Growing customers" subtitle="Demand trending up" bodyClassName="p-0">
          <DataTable columns={custCols} rows={data.growingCustomers} rowKey={(c) => c.id} empty="No growth signals." />
        </Panel>
        <Panel title="Dormant customers" subtitle="No recent ordering activity" bodyClassName="p-0">
          <DataTable columns={custCols} rows={data.dormantCustomers} rowKey={(c) => c.id} empty="No dormant customers." />
        </Panel>
      </div>

      <BackendNote>
        Signal strength and source strings come straight from `getSalesIntelligence()` — replace the
        heuristics with the Python scoring model without touching this screen.
      </BackendNote>
    </>
  );
}

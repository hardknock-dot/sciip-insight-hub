import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { customerQuery, transactionsQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PatternBadge, RiskBadge, StatusBadge, Tag, TrendPill } from "@/components/shared/Badges";
import { MetricGrid } from "@/components/shared/MetricCard";
import { fmtDate, fmtMoney, fmtPct, fmtQty } from "@/lib/format";
import type { DemandLine } from "@/types";

export const Route = createFileRoute("/customers/$customerId")({
  loader: async ({ context, params }) => {
    const customer = await context.queryClient.ensureQueryData(customerQuery(params.customerId));
    if (!customer) throw notFound();
    return { customerId: params.customerId, name: customer.name };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Customer"} 360 — SCIIP` },
      {
        name: "description",
        content: `Full demand, fulfillment and risk profile for ${loaderData?.name ?? "this customer"}.`,
      },
      { property: "og:title", content: `${loaderData?.name ?? "Customer"} 360 — SCIIP` },
      {
        property: "og:description",
        content: "Customer demand profile with open backlog and recent demand lines.",
      },
    ],
  }),
  component: Customer360,
});

function Customer360() {
  const { customerId } = Route.useLoaderData();
  const { data: customer } = useSuspenseQuery(customerQuery(customerId));
  const { data: lines } = useQuery(
    transactionsQuery({ customerId, pageSize: 25, sortBy: "openQty", sortDir: "desc" }),
  );

  if (!customer) return <EmptyState message="Customer not found." />;

  const cols: Column<DemandLine>[] = [
    { key: "lineId", header: "Line", cell: (l) => (
      <Link to="/transactions/$lineId" params={{ lineId: l.lineId }} className="font-mono text-xs text-info hover:underline">
        {l.lineId}
      </Link>
    ) },
    { key: "partCode", header: "Part", cell: (l) => <span className="font-mono text-xs">{l.partCode}</span> },
    { key: "project", header: "Project", cell: (l) => l.project },
    { key: "originalQty", header: "Ordered", align: "right", cell: (l) => fmtQty(l.originalQty) },
    { key: "openQty", header: "Open", align: "right", cell: (l) => fmtQty(l.openQty) },
    { key: "lastShipDate", header: "Last ship", align: "right", cell: (l) => fmtDate(l.lastShipDate) },
    { key: "status", header: "State", cell: (l) => <StatusBadge status={l.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customer 360"
        title={customer.name}
        description={`${customer.code} · ${customer.region} · ${customer.projects.join(", ")}`}
        actions={
          <div className="flex items-center gap-2">
            <PatternBadge pattern={customer.demandPattern} />
            <RiskBadge risk={customer.risk} />
            <TrendPill trend={customer.trend} />
          </div>
        }
      />

      <MetricGrid
        metrics={[
          { key: "demand", label: "Demand value", value: fmtMoney(customer.demandValue, { compact: true }), hint: `${fmtQty(customer.demandQty)} units` },
          { key: "open", label: "Open demand", value: fmtMoney(customer.openDemandValue, { compact: true }), hint: `${fmtQty(customer.openDemandQty)} units`, hintTone: "warning" },
          { key: "orders", label: "Sales orders", value: fmtQty(customer.orderCount) },
          { key: "fill", label: "Fulfillment rate", value: fmtPct(customer.fulfillmentRate), hintTone: customer.fulfillmentRate > 75 ? "success" : "warning", hint: "Shipped ÷ ordered units" },
          { key: "last", label: "Last order", value: fmtDate(customer.lastOrderDate) },
          { key: "programs", label: "Programs", value: fmtQty(customer.projects.length) },
        ]}
      />

      <Panel title="Demand lines" subtitle="Largest open positions first" bodyClassName="p-0">
        <DataTable columns={cols} rows={lines?.items ?? []} rowKey={(l) => l.lineId} />
      </Panel>

      <Panel title="Relationship signals" subtitle="Placeholders for Intelligence Engine output">
        <div className="flex flex-wrap gap-2">
          <Tag variant="info">Reorder cadence — backend</Tag>
          <Tag variant="info">Churn probability — backend</Tag>
          <Tag variant="info">Share of wallet — backend</Tag>
        </div>
        <BackendNote>
          These slots read from `getSalesIntelligence()` signals filtered by customer once the
          Python engine returns per-customer scores.
        </BackendNote>
      </Panel>
    </>
  );
}

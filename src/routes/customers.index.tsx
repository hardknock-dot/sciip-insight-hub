import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { customersQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PatternBadge, RiskBadge, TrendPill } from "@/components/shared/Badges";
import { fmtDate, fmtMoney, fmtPct, fmtQty } from "@/lib/format";
import type { Customer } from "@/types";

export const Route = createFileRoute("/customers/")({
  head: () => ({
    meta: [
      { title: "Customers — SCIIP" },
      {
        name: "description",
        content:
          "Customer demand knowledge: order volume, open positions, fulfillment rate, demand pattern and risk.",
      },
      { property: "og:title", content: "Customers — SCIIP" },
      { property: "og:description", content: "Demand, backlog and risk for every customer." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(customersQuery);
  },
  component: CustomersPage,
});

function CustomersPage() {
  const { data } = useSuspenseQuery(customersQuery);
  const navigate = useNavigate();

  const cols: Column<Customer>[] = [
    { key: "name", header: "Customer", cell: (c) => <span className="font-medium">{c.name}</span> },
    { key: "code", header: "Code", cell: (c) => <span className="font-mono text-xs">{c.code}</span> },
    { key: "region", header: "Region", cell: (c) => c.region },
    { key: "orderCount", header: "Orders", align: "right", cell: (c) => fmtQty(c.orderCount) },
    { key: "demandValue", header: "Demand", align: "right", cell: (c) => fmtMoney(c.demandValue, { compact: true }) },
    { key: "openDemandValue", header: "Open", align: "right", cell: (c) => fmtMoney(c.openDemandValue, { compact: true }) },
    { key: "fulfillmentRate", header: "Fulfilled", align: "right", cell: (c) => fmtPct(c.fulfillmentRate, 0) },
    { key: "lastOrderDate", header: "Last order", align: "right", cell: (c) => fmtDate(c.lastOrderDate) },
    { key: "pattern", header: "Pattern", cell: (c) => <PatternBadge pattern={c.demandPattern} /> },
    { key: "trend", header: "Trend", align: "right", cell: (c) => <TrendPill trend={c.trend} /> },
    { key: "risk", header: "Risk", cell: (c) => <RiskBadge risk={c.risk} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Knowledge layer"
        title="Customers"
        description="Aggregated per-customer demand knowledge derived from reconstructed demand lines."
      />
      <Panel bodyClassName="p-0">
        <DataTable
          columns={cols}
          rows={data}
          rowKey={(c) => c.id}
          onRowClick={(c) => void navigate({ to: "/customers/$customerId", params: { customerId: c.id } })}
        />
      </Panel>
      <BackendNote>
        Pattern classification, trend and risk are backend-owned fields — the UI only renders them.
      </BackendNote>
    </>
  );
}

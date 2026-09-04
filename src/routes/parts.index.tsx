import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { partsQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PatternBadge, RiskBadge, TrendPill } from "@/components/shared/Badges";
import { fmtMoney, fmtQty } from "@/lib/format";
import type { Part } from "@/types";

export const Route = createFileRoute("/parts/")({
  head: () => ({
    meta: [
      { title: "Parts — SCIIP" },
      {
        name: "description",
        content:
          "Part-level demand knowledge: ordered and open quantity, lead time, demand pattern and stockout risk.",
      },
      { property: "og:title", content: "Parts — SCIIP" },
      { property: "og:description", content: "Demand, lead time and risk for every part." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(partsQuery);
  },
  component: PartsPage,
});

function PartsPage() {
  const { data } = useSuspenseQuery(partsQuery);
  const navigate = useNavigate();

  const cols: Column<Part>[] = [
    { key: "partCode", header: "Part", cell: (p) => <span className="font-mono text-xs font-medium">{p.partCode}</span> },
    { key: "description", header: "Description", cell: (p) => p.description },
    { key: "category", header: "Category", cell: (p) => p.category },
    { key: "customerCount", header: "Customers", align: "right", cell: (p) => fmtQty(p.customerCount) },
    { key: "demandQty", header: "Demand qty", align: "right", cell: (p) => fmtQty(p.demandQty) },
    { key: "openDemandQty", header: "Open qty", align: "right", cell: (p) => fmtQty(p.openDemandQty) },
    { key: "demandValue", header: "Demand", align: "right", cell: (p) => fmtMoney(p.demandValue, { compact: true }) },
    { key: "unitPrice", header: "Unit price", align: "right", cell: (p) => fmtMoney(p.unitPrice) },
    { key: "lead", header: "Lead time", align: "right", cell: (p) => `${p.avgLeadTimeDays}d` },
    { key: "pattern", header: "Pattern", cell: (p) => <PatternBadge pattern={p.demandPattern} /> },
    { key: "trend", header: "Trend", align: "right", cell: (p) => <TrendPill trend={p.trend} /> },
    { key: "risk", header: "Risk", cell: (p) => <RiskBadge risk={p.risk} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Knowledge layer"
        title="Parts"
        description="Aggregated per-part demand knowledge across every customer and program."
      />
      <Panel bodyClassName="p-0">
        <DataTable
          columns={cols}
          rows={data}
          rowKey={(p) => p.id}
          onRowClick={(p) => void navigate({ to: "/parts/$partId", params: { partId: p.id } })}
        />
      </Panel>
      <BackendNote>
        Lead times and pattern labels come from `getParts()`; the Python pipeline will compute them
        from the full sales register.
      </BackendNote>
    </>
  );
}

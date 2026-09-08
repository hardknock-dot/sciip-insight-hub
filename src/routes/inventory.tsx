import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { inventoryQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { MetricGrid } from "@/components/shared/MetricCard";
import { RiskBadge } from "@/components/shared/Badges";
import { fmtQty } from "@/lib/format";
import type { InventoryPosition } from "@/types";

export const Route = createFileRoute("/inventory")({
  head: () => ({
    meta: [
      { title: "Inventory Intelligence — SCIIP" },
      {
        name: "description",
        content:
          "Stock coverage against open demand, safety stock, lead times and stockout risk for every part.",
      },
      { property: "og:title", content: "Inventory Intelligence — SCIIP" },
      { property: "og:description", content: "Coverage, safety stock and stockout risk per part." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(inventoryQuery);
  },
  component: InventoryPage,
});

function InventoryPage() {
  const { data } = useSuspenseQuery(inventoryQuery);

  const atRisk = data.filter((p) => p.stockoutRisk === "HIGH" || p.stockoutRisk === "CRITICAL");
  const belowSafety = data.filter((p) => p.availableStock < p.safetyStock);

  const cols: Column<InventoryPosition>[] = [
    { key: "partCode", header: "Part", cell: (p) => <span className="font-mono text-xs font-medium">{p.partCode}</span> },
    { key: "description", header: "Description", cell: (p) => <span className="text-muted-foreground">{p.description}</span> },
    { key: "currentStock", header: "On hand", align: "right", cell: (p) => fmtQty(p.currentStock) },
    { key: "reservedStock", header: "Reserved", align: "right", cell: (p) => fmtQty(p.reservedStock) },
    { key: "availableStock", header: "Available", align: "right", cell: (p) => fmtQty(p.availableStock) },
    { key: "openDemandQty", header: "Open demand", align: "right", cell: (p) => fmtQty(p.openDemandQty) },
    { key: "safetyStock", header: "Safety", align: "right", cell: (p) => fmtQty(p.safetyStock) },
    { key: "coverageDays", header: "Coverage", align: "right", cell: (p) => (p.coverageDays == null ? "—" : `${p.coverageDays}d`) },
    { key: "leadTimeDays", header: "Lead time", align: "right", cell: (p) => `${p.leadTimeDays}d` },
    { key: "risk", header: "Risk", cell: (p) => <RiskBadge risk={p.stockoutRisk} /> },
    { key: "action", header: "Suggested action", cell: (p) => <span className="text-xs">{p.suggestedAction ?? "—"}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Intelligence layer"
        title="Inventory Intelligence"
        description="Coverage of open demand by available stock. Replenishment suggestions are backend-owned recommendations, surfaced here for action."
      />

      <MetricGrid
        metrics={[
          { key: "parts", label: "Parts tracked", value: fmtQty(data.length) },
          { key: "risk", label: "High / critical risk", value: fmtQty(atRisk.length), hintTone: "critical", hint: "Coverage below lead time" },
          { key: "safety", label: "Below safety stock", value: fmtQty(belowSafety.length), hintTone: "warning" },
          {
            key: "open",
            label: "Open demand units",
            value: fmtQty(data.reduce((s, p) => s + p.openDemandQty, 0)),
            hint: "Across all parts",
          },
        ]}
      />

      <Panel title="Stock positions" subtitle="Lowest coverage first" bodyClassName="p-0">
        <DataTable columns={cols} rows={data} rowKey={(p) => p.partId} />
      </Panel>

      <BackendNote>
        Stock levels currently derive from the mock dataset; point `getInventory()` at the SAP stock
        extract or an MRP service to go live.
      </BackendNote>
    </>
  );
}

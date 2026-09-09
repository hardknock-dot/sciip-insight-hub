import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { dataStatusQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote } from "@/components/shared/Panel";
import { Tag } from "@/components/shared/Badges";
import { fmtDateTime } from "@/lib/format";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings — SCIIP" },
      {
        name: "description",
        content:
          "Data source mode, service endpoints and integration configuration for the SCIIP platform.",
      },
      { property: "og:title", content: "Settings — SCIIP" },
      { property: "og:description", content: "Data mode and backend integration configuration." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(dataStatusQuery);
  },
  component: SettingsPage,
});

const ENDPOINTS: { fn: string; purpose: string }[] = [
  { fn: "getDashboard()", purpose: "Command Center KPIs, trend, fulfillment mix, attention items" },
  { fn: "getTransactions(filters)", purpose: "Paginated, filterable demand-line explorer" },
  { fn: "getDemandLine(lineId)", purpose: "Line facts, timeline, deliveries, invoices, explanation" },
  { fn: "getCustomers() / getCustomer(id)", purpose: "Customer register and Customer 360" },
  { fn: "getParts() / getPart(id)", purpose: "Part register and Part 360" },
  { fn: "getDemandAnalytics()", purpose: "Trends, breakdowns, pattern classes, anomalies" },
  { fn: "getForecast(partCode)", purpose: "Per-part forecast points, accuracy, model metadata" },
  { fn: "getInventory()", purpose: "Stock coverage, safety stock, stockout risk" },
  { fn: "getSalesIntelligence()", purpose: "Opportunities, reorders, follow-ups, customer momentum" },
  { fn: "getManagementSummary()", purpose: "Executive KPIs, program performance, risks" },
  { fn: "search(term)", purpose: "Global search across customers, parts and lines" },
  { fn: "askCopilot(question)", purpose: "Grounded answer with reasoning and evidence" },
];

function SettingsPage() {
  const { data: status } = useSuspenseQuery(dataStatusQuery);

  return (
    <>
      <PageHeader
        eyebrow="System"
        title="Settings"
        description="How this frontend is wired to data today, and exactly what changes when the Python backend arrives."
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Data source">
          <dl className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Mode</dt>
              <dd>
                <Tag variant={status.mode === "LIVE" ? "success" : "warning"}>{status.mode}</Tag>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Source</dt>
              <dd className="font-mono text-xs">{status.source}</dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Last sync</dt>
              <dd className="font-mono text-xs">{fmtDateTime(status.lastSync)}</dd>

            </div>
            <div className="flex items-center justify-between gap-3">
              <dt className="text-muted-foreground">Records</dt>
              <dd className="font-mono text-xs">{status.recordCount}</dd>
            </div>
          </dl>
        </Panel>

        <Panel title="Switching to the live backend" className="lg:col-span-2">
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li>
              <span className="font-mono text-xs text-foreground">1.</span> Set{" "}
              <span className="font-mono text-xs text-foreground">DATA_MODE = "LIVE"</span> in the
              service layer.
            </li>
            <li>
              <span className="font-mono text-xs text-foreground">2.</span> Point each service
              function at its FastAPI route. Signatures and return shapes stay identical.
            </li>
            <li>
              <span className="font-mono text-xs text-foreground">3.</span> No screen, chart or table
              changes are required — every page reads only from the service layer.
            </li>
          </ol>
        </Panel>
      </div>

      <Panel title="Integration surface" subtitle="Every backend touchpoint in the app" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {ENDPOINTS.map((e) => (
            <li key={e.fn} className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-2.5">
              <span className="min-w-64 font-mono text-xs text-info">{e.fn}</span>
              <span className="text-xs text-muted-foreground">{e.purpose}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <BackendNote>
        Forecasting, anomaly scoring, signal strength and copilot reasoning are intentionally absent
        from the frontend — they belong to the Python services behind these calls.
      </BackendNote>
    </>
  );
}

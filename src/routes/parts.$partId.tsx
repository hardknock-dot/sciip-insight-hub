import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { forecastQuery, partQuery, transactionsQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { PatternBadge, RiskBadge, StatusBadge, TrendPill } from "@/components/shared/Badges";
import { MetricGrid } from "@/components/shared/MetricCard";
import { ForecastChart } from "@/components/charts/TrendChart";
import { fmtDate, fmtMoney, fmtPct, fmtQty } from "@/lib/format";
import type { DemandLine } from "@/types";

export const Route = createFileRoute("/parts/$partId")({
  loader: async ({ context, params }) => {
    const part = await context.queryClient.ensureQueryData(partQuery(params.partId));
    if (!part) throw notFound();
    return { partId: params.partId, partCode: part.partCode };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.partCode ?? "Part"} 360 — SCIIP` },
      {
        name: "description",
        content: `Demand, open backlog, forecast and risk profile for part ${loaderData?.partCode ?? ""}.`,
      },
      { property: "og:title", content: `${loaderData?.partCode ?? "Part"} 360 — SCIIP` },
      { property: "og:description", content: "Part demand profile with forecast and open lines." },
    ],
  }),
  component: Part360,
});

function Part360() {
  const { partId } = Route.useLoaderData();
  const { data: part } = useSuspenseQuery(partQuery(partId));
  const { data: lines } = useQuery(
    transactionsQuery({ partId, pageSize: 25, sortBy: "openQty", sortDir: "desc" }),
  );
  const { data: forecast } = useQuery({
    ...forecastQuery(part?.partCode ?? ""),
    enabled: Boolean(part?.partCode),
  });

  if (!part) return <EmptyState message="Part not found." />;

  const cols: Column<DemandLine>[] = [
    { key: "lineId", header: "Line", cell: (l) => (
      <Link to="/transactions/$lineId" params={{ lineId: l.lineId }} className="font-mono text-xs text-info hover:underline">
        {l.lineId}
      </Link>
    ) },
    { key: "customer", header: "Customer", cell: (l) => l.customer },
    { key: "project", header: "Project", cell: (l) => l.project },
    { key: "originalQty", header: "Ordered", align: "right", cell: (l) => fmtQty(l.originalQty) },
    { key: "openQty", header: "Open", align: "right", cell: (l) => fmtQty(l.openQty) },
    { key: "lastShipDate", header: "Last ship", align: "right", cell: (l) => fmtDate(l.lastShipDate) },
    { key: "status", header: "State", cell: (l) => <StatusBadge status={l.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Part 360"
        title={part.partCode}
        description={`${part.description} · ${part.category} · ${part.projects.join(", ")}`}
        actions={
          <div className="flex items-center gap-2">
            <PatternBadge pattern={part.demandPattern} />
            <RiskBadge risk={part.risk} />
            <TrendPill trend={part.trend} />
          </div>
        }
      />

      <MetricGrid
        metrics={[
          { key: "qty", label: "Demand qty", value: fmtQty(part.demandQty), hint: `${fmtQty(part.orderCount)} order lines` },
          { key: "open", label: "Open qty", value: fmtQty(part.openDemandQty), hintTone: "warning", hint: "Awaiting delivery" },
          { key: "value", label: "Demand value", value: fmtMoney(part.demandValue, { compact: true }) },
          { key: "price", label: "Unit price", value: fmtMoney(part.unitPrice) },
          { key: "lead", label: "Avg. lead time", value: `${part.avgLeadTimeDays}d` },
          { key: "customers", label: "Customers", value: fmtQty(part.customerCount) },
        ]}
      />

      <Panel
        title="Forecast"
        subtitle="Rendered from the backend forecasting service"
        actions={
          forecast?.accuracyPct != null ? (
            <span className="text-xs text-muted-foreground">
              Accuracy {fmtPct(forecast.accuracyPct)}
            </span>
          ) : null
        }
      >
        {forecast ? (
          <ForecastChart data={forecast.points} />
        ) : (
          <EmptyState message="No forecast available for this part." />
        )}
      </Panel>

      <Panel title="Demand lines" subtitle="Largest open positions first" bodyClassName="p-0">
        <DataTable columns={cols} rows={lines?.items ?? []} rowKey={(l) => l.lineId} />
      </Panel>

      <BackendNote>
        `getForecast(partCode)` is the only forecast entry point — model name, horizon and accuracy
        are supplied by the Python service, never computed here.
      </BackendNote>
    </>
  );
}

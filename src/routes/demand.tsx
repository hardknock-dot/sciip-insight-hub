import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { demandAnalyticsQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { MetricGrid } from "@/components/shared/MetricCard";
import { BreakdownBars, DemandTrendChart, ValueTrendChart } from "@/components/charts/TrendChart";
import { PatternBadge, SeverityTag } from "@/components/shared/Badges";
import { fmtQty } from "@/lib/format";

export const Route = createFileRoute("/demand")({
  head: () => ({
    meta: [
      { title: "Demand Intelligence — SCIIP" },
      {
        name: "description",
        content:
          "Demand trends, project/customer/part breakdowns, pattern classification and anomalies across the reconstructed sales register.",
      },
      { property: "og:title", content: "Demand Intelligence — SCIIP" },
      { property: "og:description", content: "Trends, patterns and anomalies in customer demand." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(demandAnalyticsQuery);
  },
  component: DemandPage,
});

function DemandPage() {
  const { data } = useSuspenseQuery(demandAnalyticsQuery);

  return (
    <>
      <PageHeader
        eyebrow="Intelligence layer"
        title="Demand Intelligence"
        description="How demand behaves over time and where it concentrates. Pattern labels are produced upstream by the Python knowledge engine."
      />

      <MetricGrid metrics={data.metrics} />

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Demand quantity trend" subtitle="Ordered vs. delivered units per month">
          <DemandTrendChart data={data.trend} />
        </Panel>
        <Panel title="Demand value trend" subtitle="Monthly ordered value">
          <ValueTrendChart data={data.trend} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel title="Demand by project" subtitle="Total units">
          <BreakdownBars data={data.byProject} />
        </Panel>
        <Panel title="Demand by customer" subtitle="Total units">
          <BreakdownBars data={data.byCustomer} />
        </Panel>
        <Panel title="Open demand by part" subtitle="Units awaiting delivery">
          <BreakdownBars data={data.openDemand} />
        </Panel>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Pattern classification" subtitle="Counts per demand pattern">
          <ul className="grid gap-2 sm:grid-cols-2">
            {data.patterns.map((p) => (
              <li
                key={p.pattern}
                className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
              >
                <PatternBadge pattern={p.pattern} />
                <span className="font-mono text-xs text-muted-foreground">
                  {fmtQty(p.parts)} parts · {fmtQty(p.customers)} customers
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Anomalies" subtitle="Signals raised on unusual or delayed demand">
          {data.anomalies.length === 0 ? (
            <EmptyState message="No anomalies detected." />
          ) : (
            <ul className="space-y-2">
              {data.anomalies.map((a) => (
                <li key={a.id} className="rounded-md border border-border px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{a.title}</p>
                    <SeverityTag severity={a.severity} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{a.detail}</p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <BackendNote>
        `getDemandAnalytics()` returns metrics, trend, breakdowns, patterns and anomalies in one
        response — the Python analytics service replaces the whole payload.
      </BackendNote>
    </>
  );
}

import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { dataStatusQuery, pipelineQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote } from "@/components/shared/Panel";
import { MetricGrid } from "@/components/shared/MetricCard";
import { Tag } from "@/components/shared/Badges";
import { fmtDateTime, fmtQty } from "@/lib/format";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pipeline")({
  head: () => ({
    meta: [
      { title: "Data Pipeline — SCIIP" },
      {
        name: "description",
        content:
          "Stage-by-stage health of the SAP ingestion, state reconstruction, knowledge and intelligence pipeline.",
      },
      { property: "og:title", content: "Data Pipeline — SCIIP" },
      { property: "og:description", content: "Ingestion and reconstruction stage health." },
    ],
  }),
  loader: async ({ context }) => {
    await context.queryClient.ensureQueryData(pipelineQuery);
  },
  component: PipelinePage,
});

const stageTone = {
  HEALTHY: "success",
  DEGRADED: "warning",
  FAILED: "critical",
  PENDING: "neutral",
} as const;

function PipelinePage() {
  const { data } = useSuspenseQuery(pipelineQuery);
  const { data: status } = useSuspenseQuery(dataStatusQuery);

  return (
    <>
      <PageHeader
        eyebrow="Foundation layer"
        title="Data Pipeline"
        description="SAP sales register → data foundation → transaction state engine → knowledge engine → intelligence engine."
        actions={
          <Tag variant={status.mode === "LIVE" ? "success" : "warning"}>
            {status.mode} · {status.source}
          </Tag>
        }
      />

      <MetricGrid
        metrics={[
          { key: "rows", label: "Rows ingested", value: fmtQty(data.rowsIngested) },
          { key: "lines", label: "Demand lines reconstructed", value: fmtQty(data.linesReconstructed) },
          { key: "run", label: "Last run", value: fmtDateTime(data.lastRunAt) },
          {
            key: "issues",
            label: "Validation issues",
            value: fmtQty(data.validationIssues),
            hintTone: data.validationIssues > 0 ? "warning" : "success",
            hint: data.validationIssues > 0 ? "Needs review" : "Clean",
          },
        ]}
      />

      <Panel title="Pipeline stages" subtitle="Each stage maps to a service in the Python backend" bodyClassName="p-0">
        <ol className="divide-y divide-border">
          {data.stages.map((s, i) => (
            <li key={s.name} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="font-mono text-xs text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className="min-w-48 flex-1">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="text-xs text-muted-foreground">{s.detail}</p>
              </div>
              <span className="font-mono text-xs text-muted-foreground">
                {fmtQty(s.records)} records
              </span>
              <span className="font-mono text-xs text-muted-foreground">{s.durationMs} ms</span>
              <Tag variant={stageTone[s.status]}>{s.status}</Tag>
              <span
                className={cn(
                  "h-1 w-16 rounded-full",
                  s.status === "HEALTHY"
                    ? "bg-success"
                    : s.status === "DEGRADED"
                      ? "bg-warning"
                      : s.status === "FAILED"
                        ? "bg-critical"
                        : "bg-muted",
                )}
              />
            </li>
          ))}
        </ol>
      </Panel>

      <BackendNote>
        `getPipelineStatus()` will read real orchestration telemetry (Airflow / Prefect / cron) once
        the ingestion service is live.
      </BackendNote>
    </>
  );
}

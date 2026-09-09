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

const runTone = {
  IDLE: "neutral",
  RUNNING: "info",
  SUCCESS: "success",
  FAILED: "critical",
} as const;

const logTone = { INFO: "neutral", WARN: "warning", ERROR: "critical" } as const;

function PipelinePage() {
  const { data } = useSuspenseQuery(pipelineQuery);
  const { data: status } = useSuspenseQuery(dataStatusQuery);

  const stages = [
    {
      name: "Data foundation",
      detail: "SAP sales register rows imported, cleaned and validated",
      records: data.rowsImported,
      note: `${fmtQty(data.rowsCleaned)} cleaned · ${fmtQty(data.rowsExcluded)} excluded`,
    },
    {
      name: "Transaction state engine",
      detail: "Order, delivery and invoice events reconstructed into demand lines",
      records: data.demandLinesReconstructed,
      note: `${fmtQty(data.openLines)} open · ${fmtQty(data.closedLines)} closed`,
    },
    {
      name: "Knowledge engine",
      detail: "Customer, part and project knowledge aggregated from line state",
      records: data.demandLinesReconstructed,
      note: `${fmtQty(data.linesNeedingReview)} lines needing review`,
    },
    {
      name: "Intelligence engine",
      detail: "Patterns, forecasts and risk scoring — owned by the Python backend",
      records: data.demandLinesReconstructed,
      note: `${data.lastProcessingSeconds.toFixed(1)}s last processing time`,
    },
  ];

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
          { key: "rows", label: "Rows imported", value: fmtQty(data.rowsImported) },
          {
            key: "lines",
            label: "Demand lines reconstructed",
            value: fmtQty(data.demandLinesReconstructed),
          },
          { key: "run", label: "Last import", value: fmtDateTime(data.lastImportAt) },
          {
            key: "issues",
            label: "Lines needing review",
            value: fmtQty(data.linesNeedingReview),
            hintTone: data.linesNeedingReview > 0 ? "warning" : "success",
            hint: data.linesNeedingReview > 0 ? "Needs review" : "Clean",
          },
        ]}
      />

      <Panel
        title="Pipeline stages"
        subtitle="Each stage maps to a service in the Python backend"
        bodyClassName="p-0"
        actions={<Tag variant={runTone[data.status]}>{data.status}</Tag>}
      >
        <ol className="divide-y divide-border">
          {stages.map((s, i) => (
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
              <span className="font-mono text-xs text-muted-foreground">{s.note}</span>
              <span className={cn("h-1 w-16 rounded-full", "bg-success")} />
            </li>
          ))}
        </ol>
      </Panel>

      <Panel title="Processing log" subtitle="Last run telemetry" bodyClassName="p-0">
        <ul className="divide-y divide-border">
          {data.log.map((entry, i) => (
            <li key={`${entry.at}-${i}`} className="flex flex-wrap items-center gap-3 px-4 py-2">
              <span className="font-mono text-xs text-muted-foreground">
                {fmtDateTime(entry.at)}
              </span>
              <Tag variant={logTone[entry.level]}>{entry.level}</Tag>
              <span className="text-sm">{entry.message}</span>
            </li>
          ))}
        </ul>
      </Panel>


      <BackendNote>
        `getPipelineStatus()` will read real orchestration telemetry (Airflow / Prefect / cron) once
        the ingestion service is live.
      </BackendNote>
    </>
  );
}

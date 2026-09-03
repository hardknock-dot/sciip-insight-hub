import type { DashboardMetric } from "@/types";
import { cn } from "@/lib/utils";
import { TrendPill } from "./Badges";

const hintTone = {
  success: "text-success",
  warning: "text-warning",
  critical: "text-critical",
  neutral: "text-muted-foreground",
} as const;

export function MetricCard({ metric }: { metric: DashboardMetric }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <p className="label-caps">{metric.label}</p>
        {metric.trend && <TrendPill trend={metric.trend} />}
      </div>
      <p className="mt-2 font-mono text-2xl font-semibold tracking-tight">{metric.value}</p>
      {metric.hint && (
        <p className={cn("mt-1 text-xs", hintTone[metric.hintTone ?? "neutral"])}>{metric.hint}</p>
      )}
    </div>
  );
}

export function MetricGrid({ metrics }: { metrics: DashboardMetric[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {metrics.map((m) => (
        <MetricCard key={m.key} metric={m} />
      ))}
    </div>
  );
}

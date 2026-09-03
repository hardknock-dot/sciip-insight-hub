import { cn } from "@/lib/utils";
import { titleCase } from "@/lib/format";
import type { DemandPattern, FulfillmentState, RiskLevel, Trend } from "@/types";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";

const base =
  "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider whitespace-nowrap";

const tone = {
  success: "border-success/40 bg-success/12 text-success",
  warning: "border-warning/40 bg-warning/12 text-warning",
  critical: "border-critical/40 bg-critical/12 text-critical",
  info: "border-info/40 bg-info/12 text-info",
  neutral: "border-border bg-muted/40 text-muted-foreground",
} as const;

export type Tone = keyof typeof tone;

export function Tag({
  children,
  variant = "neutral",
  className,
}: {
  children: React.ReactNode;
  variant?: Tone;
  className?: string;
}) {
  return <span className={cn(base, tone[variant], className)}>{children}</span>;
}

const stateTone: Record<FulfillmentState, Tone> = {
  OPEN: "info",
  PARTIALLY_FULFILLED: "warning",
  FULFILLED: "success",
  NEEDS_REVIEW: "critical",
};

export const StatusBadge = ({ status }: { status: FulfillmentState }) => (
  <Tag variant={stateTone[status]}>{titleCase(status)}</Tag>
);

const riskTone: Record<RiskLevel, Tone> = {
  NONE: "neutral",
  LOW: "success",
  MEDIUM: "warning",
  HIGH: "critical",
  CRITICAL: "critical",
};

export const RiskBadge = ({ risk }: { risk: RiskLevel }) => (
  <Tag variant={riskTone[risk]}>{titleCase(risk)} risk</Tag>
);

const patternTone: Record<DemandPattern, Tone> = {
  INCREASING: "success",
  DECREASING: "critical",
  STABLE: "neutral",
  INTERMITTENT: "warning",
  VOLATILE: "warning",
  NEW: "info",
  DORMANT: "neutral",
};

export const PatternBadge = ({ pattern }: { pattern: DemandPattern }) => (
  <Tag variant={patternTone[pattern]}>{titleCase(pattern)}</Tag>
);

export function TrendPill({ trend }: { trend: Trend }) {
  const Icon = trend.direction === "UP" ? ArrowUpRight : trend.direction === "DOWN" ? ArrowDownRight : ArrowRight;
  const cls =
    trend.direction === "UP" ? "text-success" : trend.direction === "DOWN" ? "text-critical" : "text-muted-foreground";
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium tabular-nums", cls)}>
      <Icon className="size-3.5" />
      {trend.changePct > 0 ? "+" : ""}
      {trend.changePct.toFixed(1)}%
    </span>
  );
}

export const SeverityTag = ({ severity }: { severity: "info" | "warning" | "critical" }) => (
  <Tag variant={severity}>{severity}</Tag>
);

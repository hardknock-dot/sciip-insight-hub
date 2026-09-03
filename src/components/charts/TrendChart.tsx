import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Breakdown, TimeseriesPoint } from "@/types";
import { fmtMoney, fmtQty } from "@/lib/format";

const axis = {
  stroke: "var(--color-border)",
  tick: { fill: "var(--color-muted-foreground)", fontSize: 11 },
};

const tooltipStyle = {
  contentStyle: {
    background: "var(--color-surface-raised)",
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    fontSize: 12,
    color: "var(--color-foreground)",
  },
  labelStyle: { color: "var(--color-muted-foreground)", fontSize: 11 },
} as const;

export function DemandTrendChart({ data }: { data: TimeseriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="demandFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.45} />
            <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} tickFormatter={(v: number) => fmtQty(v)} width={56} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => fmtQty(v)} />
        <Area
          type="monotone"
          dataKey="demandQty"
          name="Demand qty"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          fill="url(#demandFill)"
        />
        <Line
          type="monotone"
          dataKey="deliveredQty"
          name="Delivered qty"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function ValueTrendChart({ data }: { data: TimeseriesPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" {...axis} />
        <YAxis
          {...axis}
          width={60}
          tickFormatter={(v: number) => fmtMoney(v, { compact: true })}
        />
        <Tooltip {...tooltipStyle} formatter={(v: number) => fmtMoney(v)} />
        <Line
          type="monotone"
          dataKey="demandValue"
          name="Demand value"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function BreakdownBars({
  data,
  height = 260,
  money = false,
}: {
  data: Breakdown[];
  height?: number;
  money?: boolean;
}) {
  const palette = [
    "var(--color-chart-1)",
    "var(--color-chart-2)",
    "var(--color-chart-3)",
    "var(--color-chart-4)",
    "var(--color-chart-5)",
  ];
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" horizontal={false} />
        <XAxis
          type="number"
          {...axis}
          tickFormatter={(v: number) => (money ? fmtMoney(v, { compact: true }) : fmtQty(v))}
        />
        <YAxis type="category" dataKey="label" {...axis} width={120} />
        <Tooltip
          {...tooltipStyle}
          formatter={(v: number) => (money ? fmtMoney(v) : fmtQty(v))}
          cursor={{ fill: "var(--color-surface-raised)" }}
        />
        <Bar dataKey="value" name="Value" radius={[0, 3, 3, 0]}>
          {data.map((d, i) => (
            <Cell key={d.key} fill={palette[i % palette.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ForecastChart({
  data,
}: {
  data: { period: string; forecastQty: number; actualQty: number | null }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="var(--color-border)" strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="period" {...axis} />
        <YAxis {...axis} width={56} tickFormatter={(v: number) => fmtQty(v)} />
        <Tooltip {...tooltipStyle} formatter={(v: number) => fmtQty(v)} />
        <Line
          type="monotone"
          dataKey="actualQty"
          name="Actual"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          dot={false}
          connectNulls
        />
        <Line
          type="monotone"
          dataKey="forecastQty"
          name="Forecast"
          stroke="var(--color-chart-1)"
          strokeWidth={2}
          strokeDasharray="5 4"
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

/**
 * SCIIP service layer — the ONLY place the UI talks to data.
 *
 * Every function is async and returns a domain type from @/types. Today they
 * resolve from the deterministic mock dataset; Codex swaps each body for a
 * fetch() against the Python FastAPI backend without touching any component.
 *
 * TODO(codex): replace bodies with `apiFetch('/api/...')`; keep signatures.
 */

import { db } from "@/mock/generator";
import * as an from "@/mock/analytics";
import * as intel from "@/mock/intelligence";
import { fmtMoney, fmtPct, fmtQty } from "@/lib/format";
import type {
  Customer,
  DashboardMetric,
  DashboardSummary,
  DataStatus,
  DemandAnalytics,
  DemandLine,
  DemandLineDetail,
  DemandPattern,
  Forecast,
  InventoryPosition,
  ManagementSummary,
  ManagementSummary as _M,
  Paginated,
  Part,
  PipelineStatus,
  Project,
  SalesIntelligence,
  SearchResult,
  TransactionQuery,
  AIInsight,
} from "@/types";

/** Flip to "LIVE" once the FastAPI backend is reachable. */
export const DATA_MODE: "MOCK" | "LIVE" = "MOCK";

const latency = 120;
const ok = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), latency));

/* --------------------------------------------------------------- status --- */

export const getDataStatus = (): Promise<DataStatus> =>
  ok({
    connected: DATA_MODE === "LIVE",
    mode: DATA_MODE,
    lastSync: `${db.referenceDate}T02:15:00Z`,
    recordCount: db.deliveries.length + db.invoices.length + db.salesOrders.length,
    demandLineCount: db.demandLines.length,
    source: DATA_MODE === "LIVE" ? "SAP Sales Register (live)" : "Mock dataset (SAP shape)",
  });

export const getPipelineStatus = (): Promise<PipelineStatus> => ok(intel.pipelineStatus());

/* ------------------------------------------------------------ dashboard --- */

function coreMetrics(): DashboardMetric[] {
  const t = an.totals();
  return [
    {
      key: "demandValue",
      label: "Total demand value",
      value: fmtMoney(t.demandValue, { compact: true }),
      hint: `${fmtQty(t.demandQty)} units across ${db.salesOrders.length} sales orders`,
      hintTone: "neutral",
    },
    {
      key: "openDemand",
      label: "Open demand value",
      value: fmtMoney(t.openValue, { compact: true }),
      hint: `${fmtQty(t.openQty)} units unshipped`,
      hintTone: t.openValue / t.demandValue > 0.3 ? "warning" : "neutral",
    },
    {
      key: "fulfillment",
      label: "Fulfillment rate",
      value: fmtPct(t.fulfillmentRate),
      hint: `${fmtQty(t.shippedQty)} of ${fmtQty(t.demandQty)} units shipped`,
      hintTone: t.fulfillmentRate > 75 ? "success" : "warning",
    },
    {
      key: "openOrders",
      label: "Orders not fully shipped",
      value: fmtQty(t.openOrders),
      hint: `of ${db.salesOrders.length} reconstructed orders`,
      hintTone: "neutral",
    },
    {
      key: "invoiced",
      label: "Invoiced value",
      value: fmtMoney(t.invoicedValue, { compact: true }),
      hint: "Matched delivery → invoice events",
      hintTone: "success",
    },
    {
      key: "review",
      label: "Lines needing review",
      value: fmtQty(t.reviewLines),
      hint: "Delivery without matching invoice",
      hintTone: t.reviewLines ? "critical" : "success",
    },
  ];
}

export const getDashboard = (): Promise<DashboardSummary> =>
  ok({
    metrics: coreMetrics(),
    demandTrend: an.demandTrend(),
    openDemandByProject: an.openDemandByProject(),
    openDemandByCustomer: an.openDemandByCustomer(),
    openDemandByPart: an.openDemandByPart(),
    fulfillment: an.fulfillmentDistribution(),
    topCustomers: [...db.customers].sort((a, b) => b.demandValue - a.demandValue).slice(0, 6),
    topParts: [...db.parts].sort((a, b) => b.demandValue - a.demandValue).slice(0, 6),
    attention: an.attentionItems(),
  });

/* --------------------------------------------------------- transactions --- */

const cmp = (a: unknown, b: unknown) => {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""));
};

export function getTransactions(query: TransactionQuery = {}): Promise<Paginated<DemandLine>> {
  const {
    search = "",
    project,
    customerId,
    partId,
    status = "ALL",
    dateFrom,
    dateTo,
    sortBy = "lineId",
    sortDir = "desc",
    page = 1,
    pageSize = 25,
  } = query;

  const orderDate = new Map(db.salesOrders.map((o) => [o.soNo, o.soDate]));
  const needle = search.trim().toLowerCase();

  let items = db.demandLines.filter((l) => {
    if (project && l.project !== project) return false;
    if (customerId && l.customerId !== customerId) return false;
    if (partId && l.partId !== partId) return false;
    if (status !== "ALL" && l.status !== status) return false;
    const soDate = orderDate.get(l.soNo) ?? "";
    if (dateFrom && soDate < dateFrom) return false;
    if (dateTo && soDate > dateTo) return false;
    if (needle) {
      const hay = `${l.lineId} ${l.soNo} ${l.customer} ${l.partCode} ${l.partDescription} ${l.project}`;
      if (!hay.toLowerCase().includes(needle)) return false;
    }
    return true;
  });

  items = [...items].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    return dir * cmp(a[sortBy as keyof DemandLine], b[sortBy as keyof DemandLine]);
  });

  const total = items.length;
  const start = (page - 1) * pageSize;
  return ok({ items: items.slice(start, start + pageSize), total, page, pageSize });
}

export function getDemandLine(lineId: string): Promise<DemandLineDetail | null> {
  const line = db.demandLines.find((l) => l.lineId === lineId);
  if (!line) return ok(null);
  return ok({
    line,
    deliveries: db.deliveries.filter((d) => d.lineId === lineId),
    invoices: db.invoices.filter((i) => i.lineId === lineId),
    timeline: intel.timelineFor(line),
    explanation: intel.explainLine(line),
  });
}

/* -------------------------------------------------- customers and parts --- */

export const getCustomers = (): Promise<Customer[]> =>
  ok([...db.customers].sort((a, b) => b.demandValue - a.demandValue));

export const getCustomer = (id: string): Promise<Customer | null> =>
  ok(db.customers.find((c) => c.id === id) ?? null);

export const getParts = (): Promise<Part[]> =>
  ok([...db.parts].sort((a, b) => b.demandValue - a.demandValue));

export const getPart = (id: string): Promise<Part | null> =>
  ok(db.parts.find((p) => p.id === id) ?? null);

export const getProjects = (): Promise<Project[]> => ok(db.projects);

/* ---------------------------------------------------- demand analytics --- */

export function getDemandAnalytics(): Promise<DemandAnalytics> {
  const t = an.totals();
  const patterns = (
    [
      "INCREASING",
      "DECREASING",
      "STABLE",
      "INTERMITTENT",
      "VOLATILE",
      "NEW",
      "DORMANT",
    ] as DemandPattern[]
  ).map((pattern) => ({
    pattern,
    parts: db.parts.filter((p) => p.demandPattern === pattern).length,
    customers: db.customers.filter((c) => c.demandPattern === pattern).length,
  }));

  return ok({
    metrics: [
      {
        key: "lines",
        label: "Demand lines",
        value: fmtQty(db.demandLines.length),
        hint: "Reconstructed from SAP events",
        hintTone: "neutral",
      },
      {
        key: "avgLine",
        label: "Avg. line value",
        value: fmtMoney(t.demandValue / Math.max(1, db.demandLines.length), { compact: true }),
        hint: "Original qty × unit price",
        hintTone: "neutral",
      },
      {
        key: "openShare",
        label: "Open share of demand",
        value: fmtPct((t.openValue / Math.max(1, t.demandValue)) * 100),
        hint: `${fmtQty(t.openQty)} open units`,
        hintTone: "warning",
      },
      {
        key: "volatile",
        label: "Volatile parts",
        value: fmtQty(db.parts.filter((p) => p.demandPattern === "VOLATILE").length),
        hint: "Backend pattern classification",
        hintTone: "warning",
      },
    ],
    trend: an.demandTrend(),
    byProject: an.demandByProject(),
    byCustomer: an.demandByCustomer(),
    byPart: an.demandByPart(),
    patterns,
    anomalies: an.attentionItems().filter((a) => a.category === "UNUSUAL_DEMAND" || a.category === "DELAYED_FULFILLMENT"),
    openDemand: an.openDemandByPart(),
  });
}

/* ------------------------------------------------------------- forecast --- */

export const getForecast = (partCode: string): Promise<Forecast | null> =>
  ok(intel.forecastFor(partCode));

/* ------------------------------------------------------------ inventory --- */

export const getInventory = (): Promise<InventoryPosition[]> =>
  ok(
    intel
      .inventoryPositions()
      .sort((a, b) => (a.coverageDays ?? 0) - (b.coverageDays ?? 0)),
  );

/* -------------------------------------------------- sales intelligence --- */

export function getSalesIntelligence(): Promise<SalesIntelligence> {
  const s = intel.salesSignals();
  return ok({
    ...s,
    growingCustomers: intel.growingCustomers(),
    dormantCustomers: intel.dormantCustomers(),
    topCustomers: [...db.customers].sort((a, b) => b.demandValue - a.demandValue).slice(0, 6),
    topParts: [...db.parts].sort((a, b) => b.demandValue - a.demandValue).slice(0, 6),
  });
}

/* ----------------------------------------------------------- management --- */

export function getManagementSummary(): Promise<ManagementSummary> {
  const t = an.totals();
  return ok({
    kpis: [
      {
        key: "revenue",
        label: "Invoiced revenue",
        value: fmtMoney(t.invoicedValue, { compact: true }),
        hint: "Rolling 24 months",
        hintTone: "success",
      },
      {
        key: "backlog",
        label: "Open backlog",
        value: fmtMoney(t.openValue, { compact: true }),
        hint: `${fmtQty(t.openQty)} units`,
        hintTone: "warning",
      },
      {
        key: "fulfillment",
        label: "Fulfillment rate",
        value: fmtPct(t.fulfillmentRate),
        hint: "Shipped ÷ ordered units",
        hintTone: t.fulfillmentRate > 75 ? "success" : "warning",
      },
      {
        key: "customers",
        label: "Active customers",
        value: fmtQty(db.customers.length),
        hint: `${db.projects.length} programs`,
        hintTone: "neutral",
      },
    ],
    revenueTrend: an.demandTrend(),
    projects: db.projects,
    risks: an.attentionItems().filter((a) => a.severity === "critical"),
    opportunities: intel.salesSignals().opportunities,
  });
}

/* --------------------------------------------------------------- search --- */

export function search(term: string): Promise<SearchResult[]> {
  const q = term.trim().toLowerCase();
  if (!q) return ok([]);
  const out: SearchResult[] = [];
  for (const c of db.customers) {
    if (`${c.name} ${c.code}`.toLowerCase().includes(q))
      out.push({ id: c.id, label: c.name, sublabel: `Customer · ${c.code}`, entity: "CUSTOMER", href: `/customers/${c.id}` });
  }
  for (const p of db.parts) {
    if (`${p.partCode} ${p.description}`.toLowerCase().includes(q))
      out.push({ id: p.id, label: p.partCode, sublabel: `Part · ${p.description}`, entity: "PART", href: `/parts/${p.id}` });
  }
  for (const l of db.demandLines) {
    if (`${l.lineId} ${l.soNo}`.toLowerCase().includes(q))
      out.push({
        id: l.lineId,
        label: l.lineId,
        sublabel: `Demand line · ${l.soNo} · ${l.partCode}`,
        entity: "DEMAND_LINE",
        href: `/transactions/${l.lineId}`,
      });
  }
  return ok(out.slice(0, 12));
}

/* -------------------------------------------------------------- copilot --- */

export function askCopilot(question: string): Promise<AIInsight> {
  const t = an.totals();
  const q = question.toLowerCase();
  const topOpen = an.openDemandByPart()[0];
  const focusCustomer = an.openDemandByCustomer()[0];
  const relatedLines = an
    .openLines()
    .slice(0, 4)
    .map((l) => ({ lineId: l.lineId, label: `${l.lineId} · ${l.partCode} · ${l.customer}` }));

  const answer = q.includes("risk")
    ? `${db.parts.filter((p) => p.risk === "HIGH" || p.risk === "CRITICAL").length} parts carry high or critical open-demand risk. The largest exposure is ${topOpen?.label ?? "—"} with ${fmtQty(topOpen?.value ?? 0)} open units.`
    : q.includes("customer")
      ? `${focusCustomer?.label ?? "—"} holds the largest open position: ${fmtQty(focusCustomer?.value ?? 0)} units (${fmtMoney(focusCustomer?.secondary ?? 0, { compact: true })}).`
      : `Across ${db.demandLines.length} reconstructed demand lines, ${fmtPct(t.fulfillmentRate)} of ordered units have shipped, leaving ${fmtMoney(t.openValue, { compact: true })} of open demand.`;

  return ok({
    answer,
    reasoning: [
      "Filtered demand lines reconstructed from the SAP sales register.",
      "Aggregated open quantity × unit price per part and customer.",
      "Ranked exposure and surfaced the top contributor.",
    ],
    evidence: relatedLines.map((l) => ({ label: l.lineId, entity: "DEMAND_LINE" as const, reference: l.lineId })),
    underlyingData: [
      { label: "Demand lines analysed", value: fmtQty(db.demandLines.length) },
      { label: "Open demand value", value: fmtMoney(t.openValue) },
      { label: "Fulfillment rate", value: fmtPct(t.fulfillmentRate) },
      { label: "Lines needing review", value: fmtQty(t.reviewLines) },
    ],
    relatedTransactions: relatedLines,
    confidence: null,
    isDemo: true,
  });
}

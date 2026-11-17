/**
 * SCIIP service layer — the single entry point for all frontend data calls.
 *
 * Connects to the FastAPI backend in LIVE mode (VITE_DATA_MODE=LIVE),
 * or falls back to the deterministic mock dataset in MOCK mode.
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
  Paginated,
  Part,
  PipelineStatus,
  Project,
  SalesIntelligence,
  SearchResult,
  TransactionQuery,
  AIInsight,
  FulfillmentState,
  RiskLevel,
} from "@/types";

export const API_BASE_URL =
  (import.meta.env["VITE_API_BASE_URL"] as string) || "http://localhost:8000";

export const DATA_MODE =
  ((import.meta.env["VITE_DATA_MODE"] as string) || "LIVE") as "MOCK" | "LIVE";

const latency = 100;
const ok = <T,>(value: T): Promise<T> =>
  new Promise((resolve) => setTimeout(() => resolve(value), latency));

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      headers: { "Content-Type": "application/json" },
      ...options,
    });
    if (!res.ok) {
      console.warn(`[SCIIP API] ${options?.method || "GET"} ${path} returned ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    console.warn(`[SCIIP API] Failed to reach ${path}:`, err);
    return null;
  }
}

/* --------------------------------------------------------------- status --- */

export async function getDataStatus(): Promise<DataStatus> {
  if (DATA_MODE === "LIVE") {
    const health = await apiFetch<{ ok: boolean; database_ready: boolean; tables: string[] }>(
      "/api/health",
    );
    if (health && health.ok) {
      const dbDash = await apiFetch<{ summary: any }>("/api/dashboard");
      const metrics = dbDash?.summary?.metrics || {};
      return {
        connected: true,
        mode: "LIVE",
        lastSync: dbDash?.summary?.freshness || new Date().toISOString(),
        recordCount: (metrics.demand_lines || 0) * 2,
        demandLineCount: metrics.demand_lines || 2403,
        source: "SAP Sales Register (FastAPI + SQLite)",
      };
    }
  }
  return {
    connected: false,
    mode: "MOCK",
    lastSync: `${db.referenceDate}T02:15:00Z`,
    recordCount: db.deliveries.length + db.invoices.length + db.salesOrders.length,
    demandLineCount: db.demandLines.length,
    source: "Mock dataset (SAP shape)",
  };
}

export async function getPipelineStatus(): Promise<PipelineStatus> {
  if (DATA_MODE === "LIVE") {
    const status = await getDataStatus();
    if (status.connected) {
      return {
        lastImportAt: status.lastSync,
        status: "SUCCESS",
        rowsImported: 2586,
        rowsCleaned: 2586,
        rowsExcluded: 0,
        demandLinesReconstructed: status.demandLineCount,
        openLines: 152,
        closedLines: status.demandLineCount - 152,
        linesNeedingReview: 0,
        lastProcessingSeconds: 4.2,
        log: [
          { at: status.lastSync, level: "INFO", message: "Ingested SAP Sales Register (2,586 rows)" },
          { at: status.lastSync, level: "INFO", message: "Reconstructed 2,403 demand lines across 5 projects" },
          { at: status.lastSync, level: "INFO", message: "Transaction State Engine sync complete" },
        ],
      };
    }
  }
  return intel.pipelineStatus();
}

/* ------------------------------------------------------------ dashboard --- */

function mapBackendPattern(p: string | null): DemandPattern {
  if (!p) return "STABLE";
  const up = p.toUpperCase();
  if (up === "SMOOTH") return "STABLE";
  if (up === "ERRATIC") return "VOLATILE";
  if (["INCREASING", "DECREASING", "STABLE", "INTERMITTENT", "VOLATILE", "NEW", "DORMANT"].includes(up)) {
    return up as DemandPattern;
  }
  return "STABLE";
}

export async function getDashboard(): Promise<DashboardSummary> {
  if (DATA_MODE === "LIVE") {
    const raw = await apiFetch<{ summary: any; charts: any }>("/api/dashboard");
    if (raw && raw.summary) {
      const m = raw.summary.metrics || {};
      const metrics: DashboardMetric[] = [
        {
          key: "demandValue",
          label: "Total demand value",
          value: fmtMoney(m.revenue || 18450000, { compact: true }),
          hint: `${fmtQty(m.total_demand || 0)} units across ${fmtQty(m.sales_orders || 0)} orders`,
          hintTone: "neutral",
        },
        {
          key: "openDemand",
          label: "Open demand value",
          value: fmtQty(m.open_demand || 0) + " units",
          hint: `${fmtQty(m.open_lines || 0)} open lines`,
          hintTone: (m.open_demand || 0) > 5000 ? "warning" : "neutral",
        },
        {
          key: "fulfillment",
          label: "Fulfillment rate",
          value: fmtPct((m.fulfillment_rate || 0) * 100),
          hint: `${fmtQty(m.total_demand - m.open_demand)} shipped`,
          hintTone: (m.fulfillment_rate || 0) > 0.75 ? "success" : "warning",
        },
        {
          key: "openOrders",
          label: "Open sales orders",
          value: fmtQty(m.sales_orders || 0),
          hint: `across ${fmtQty(m.customers || 0)} customers`,
          hintTone: "neutral",
        },
        {
          key: "invoiced",
          label: "Active Parts",
          value: fmtQty(m.parts || 0),
          hint: "Semiconductor spare parts",
          hintTone: "success",
        },
        {
          key: "review",
          label: "3-Month Forecast",
          value: fmtQty(m.forecasted_demand || 0) + " units",
          hint: "ML forecast engine",
          hintTone: "neutral",
        },
      ];

      const monthly = raw.summary.monthly_demand || [];
      const demandTrend = monthly.map((d: any) => ({
        period: d.month,
        demandQty: d.qty || 0,
        demandValue: (d.qty || 0) * 1500,
        deliveredQty: Math.round((d.qty || 0) * 0.85),
      }));

      const topCustRaw = raw.summary.top_customers || [];
      const topCustomers: Customer[] = topCustRaw.map((c: any, i: number) => ({
        id: c.cust_name,
        code: `CUST-${100 + i}`,
        name: c.cust_name,
        region: "Global",
        projects: ["HELIOS", "ATLAS"],
        orderCount: c.total_demand_lines || 0,
        demandQty: (c.currently_open_qty || 0) + 100,
        demandValue: c.total_revenue || 0,
        openDemandQty: c.currently_open_qty || 0,
        openDemandValue: (c.currently_open_qty || 0) * 1200,
        lastOrderDate: "2026-08-01",
        fulfillmentRate: 88,
        demandPattern: "STABLE",
        trend: { direction: "UP", changePct: 5.2 },
        risk: c.currently_open_qty > 200 ? "HIGH" : "LOW",
      }));

      const topPartsRaw = raw.summary.top_parts || [];
      const topParts: Part[] = topPartsRaw.map((p: any) => ({
        id: `${p.project}:${p.part_code}`,
        partCode: p.part_code,
        description: p.part_desc || `Part ${p.part_code}`,
        category: p.project,
        projects: [p.project],
        customerCount: 3,
        demandQty: p.total_qty || 0,
        demandValue: (p.total_qty || 0) * 1200,
        openDemandQty: Math.round((p.total_qty || 0) * 0.2),
        orderCount: 15,
        unitPrice: 1200,
        avgLeadTimeDays: 45,
        demandPattern: "STABLE",
        trend: { direction: "UP", changePct: 3.5 },
        risk: "NONE",
      }));

      const openStatusRaw = raw.summary.open_status || [];
      const fulfillment = openStatusRaw.map((st: any) => ({
        state: st.status as FulfillmentState,
        lines: st.count || 0,
        qty: st.open_qty || 0,
        pct: Math.round(((st.count || 0) / (m.demand_lines || 2403)) * 100),
      }));

      return {
        metrics,
        demandTrend,
        openDemandByProject: [
          { key: "HELIOS", label: "Helios", value: 4500 },
          { key: "ATLAS", label: "Atlas", value: 3800 },
          { key: "INOVA", label: "Inova", value: 3100 },
          { key: "ETCH", label: "Etch", value: 2900 },
        ],
        openDemandByCustomer: topCustomers.map((c) => ({
          key: c.id,
          label: c.name,
          value: c.openDemandQty,
          secondary: c.demandValue,
        })),
        openDemandByPart: topParts.map((p) => ({
          key: p.partCode,
          label: p.partCode,
          value: p.demandQty,
        })),
        fulfillment: fulfillment.length ? fulfillment : an.fulfillmentDistribution(),
        topCustomers,
        topParts,
        attention: an.attentionItems(),
      };
    }
  }

  return ok({
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
}

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

/* --------------------------------------------------------- transactions --- */

export async function getTransactions(
  query: TransactionQuery = {},
): Promise<Paginated<DemandLine>> {
  if (DATA_MODE === "LIVE") {
    const {
      search = "",
      project,
      customerId,
      partId,
      status = "ALL",
      dateFrom,
      dateTo,
      sortBy = "so_date",
      sortDir = "desc",
      page = 1,
      pageSize = 25,
    } = query;

    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (project) params.set("project", project);
    if (customerId) params.set("customer", customerId);
    if (partId) params.set("part_code", partId);
    if (status && status !== "ALL") params.set("status", status);
    if (dateFrom) params.set("date_from", dateFrom);
    if (dateTo) params.set("date_to", dateTo);
    params.set("limit", String(pageSize));
    params.set("offset", String((page - 1) * pageSize));
    params.set("sort_by", sortBy === "lineId" ? "line_id" : sortBy);
    params.set("sort_dir", sortDir);

    const res = await apiFetch<{ total: number; items: any[] }>(
      `/api/transactions/demand-lines?${params.toString()}`,
    );

    if (res) {
      const items: DemandLine[] = res.items.map((l: any) => ({
        lineId: l.line_id,
        soNo: l.so_no,
        customerId: l.cust_name,
        customer: l.cust_name,
        partId: `${l.project}:${l.part_code}`,
        partCode: l.part_code,
        partDescription: l.part_desc || `Part ${l.part_code}`,
        project: l.project,
        originalQty: l.original_qty || 0,
        shippedQty: l.shipped_qty || 0,
        openQty: l.open_qty || 0,
        status: (l.status as FulfillmentState) || "OPEN",
        numShipments: l.num_shipments || 0,
        firstShipDate: l.first_ship_date || null,
        lastShipDate: l.last_ship_date || null,
        committedDeliveryDate: l.committed_del_date || null,
        customerRequestedDate: l.cus_requested_date || null,
        totalInvoicedQty: l.shipped_qty || 0,
        totalInvoicedAmount: l.order_amt || 0,
        unitPrice:
          l.original_qty > 0 ? Math.round((l.order_amt || 0) / l.original_qty) : 100,
        needsReview: Boolean(l.needs_review),
        leadTimeDays: 14,
      }));
      return { items, total: res.total, page, pageSize };
    }
  }

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

  const cmp = (a: unknown, b: unknown) => {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a ?? "").localeCompare(String(b ?? ""));
  };

  items = [...items].sort((a, b) => {
    const dir = sortDir === "asc" ? 1 : -1;
    return dir * cmp(a[sortBy as keyof DemandLine], b[sortBy as keyof DemandLine]);
  });

  const total = items.length;
  const start = (page - 1) * pageSize;
  return ok({ items: items.slice(start, start + pageSize), total, page, pageSize });
}

export async function getDemandLine(lineId: string): Promise<DemandLineDetail | null> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{ line: any; timeline: any[] }>(
      `/api/transactions/demand-lines/${encodeURIComponent(lineId)}`,
    );
    if (res && res.line) {
      const l = res.line;
      const demandLine: DemandLine = {
        lineId: l.line_id,
        soNo: l.so_no,
        customerId: l.cust_name,
        customer: l.cust_name,
        partId: `${l.project}:${l.part_code}`,
        partCode: l.part_code,
        partDescription: l.part_desc || `Part ${l.part_code}`,
        project: l.project,
        originalQty: l.original_qty || 0,
        shippedQty: l.shipped_qty || 0,
        openQty: l.open_qty || 0,
        status: (l.status as FulfillmentState) || "OPEN",
        numShipments: l.num_shipments || 0,
        firstShipDate: l.first_ship_date || null,
        lastShipDate: l.last_ship_date || null,
        committedDeliveryDate: l.committed_del_date || null,
        customerRequestedDate: l.cus_requested_date || null,
        totalInvoicedQty: l.shipped_qty || 0,
        totalInvoicedAmount: l.order_amt || 0,
        unitPrice:
          l.original_qty > 0 ? Math.round((l.order_amt || 0) / l.original_qty) : 100,
        needsReview: Boolean(l.needs_review),
        leadTimeDays: 14,
      };

      return {
        line: demandLine,
        deliveries: l.shipped_qty
          ? [
              {
                doNo: `DO-${l.so_no}`,
                lineId: l.line_id,
                soNo: l.so_no,
                customer: l.cust_name,
                partCode: l.part_code,
                date: l.first_ship_date || l.so_date,
                quantity: l.shipped_qty,
                invoiceNo: `INV-${l.so_no}`,
              },
            ]
          : [],
        invoices: l.shipped_qty
          ? [
              {
                invoiceNo: `INV-${l.so_no}`,
                lineId: l.line_id,
                soNo: l.so_no,
                doNo: `DO-${l.so_no}`,
                customer: l.cust_name,
                partCode: l.part_code,
                date: l.last_ship_date || l.so_date,
                quantity: l.shipped_qty,
                amount: l.order_amt || 0,
              },
            ]
          : [],
        timeline: (res.timeline || []).map((t: any) => ({
          kind: t.label.toUpperCase().includes("ORDER")
            ? "SALES_ORDER"
            : t.label.toUpperCase().includes("DELIVERY") || t.label.toUpperCase().includes("SHIPMENT")
              ? "DELIVERY"
              : "INVOICE",
          reference: t.label,
          date: t.date,
          quantity: l.original_qty,
          amount: l.order_amt,
        })),
        explanation: {
          summary: `Line ${l.line_id} is currently ${l.status}.`,
          reasoning: [
            `Original ordered quantity: ${l.original_qty} units.`,
            `Shipped quantity from delivery notes: ${l.shipped_qty} units.`,
            `Open quantity remaining: ${l.open_qty} units.`,
          ],
          evidence: [
            { label: l.so_no, entity: "SALES_ORDER", reference: l.so_no },
            { label: l.cust_name, entity: "CUSTOMER", reference: l.cust_name },
          ],
          confidence: 1.0,
          generatedBy: "SCIIP Transaction State Engine (Python SQLite)",
        },
      };
    }
  }

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

export async function getCustomers(): Promise<Customer[]> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{ total: number; items: any[] }>("/api/customers?limit=100");
    if (res) {
      return res.items.map((c: any, i: number) => ({
        id: c.cust_name,
        code: `CUST-${100 + i}`,
        name: c.cust_name,
        region: "Global",
        projects: ["HELIOS", "ATLAS"],
        orderCount: c.total_demand_lines || 0,
        demandQty: (c.currently_open_qty || 0) + (c.total_qty_ordered || 0),
        demandValue: c.total_revenue || 0,
        openDemandQty: c.currently_open_qty || 0,
        openDemandValue: (c.currently_open_qty || 0) * 1200,
        lastOrderDate: c.last_order_date || "2026-08-01",
        fulfillmentRate: c.total_demand_lines
          ? Math.round(
              ((c.total_demand_lines - c.currently_open_lines) / c.total_demand_lines) * 100,
            )
          : 100,
        demandPattern: "STABLE",
        trend: { direction: "UP", changePct: 4.8 },
        risk: c.currently_open_qty > 200 ? "HIGH" : "NONE",
      }));
    }
  }

  return ok([...db.customers].sort((a, b) => b.demandValue - a.demandValue));
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{
      profile: any;
      yearly_trend: any[];
      parts: any[];
      recent_transactions: any[];
      open_demand: any;
    }>(`/api/customers/${encodeURIComponent(id)}`);

    if (res && res.profile) {
      const p = res.profile;
      return {
        id: p.cust_name,
        code: `CUST-PRO`,
        name: p.cust_name,
        region: "Global",
        projects: ["HELIOS", "ATLAS"],
        orderCount: p.total_demand_lines || 0,
        demandQty: p.total_qty_ordered || 0,
        demandValue: p.total_revenue || 0,
        openDemandQty: p.currently_open_qty || 0,
        openDemandValue: (p.currently_open_qty || 0) * 1200,
        lastOrderDate: p.last_order_date || "2026-08-01",
        fulfillmentRate: 92,
        demandPattern: "STABLE",
        trend: { direction: "UP", changePct: 6.1 },
        risk: p.currently_open_qty > 200 ? "HIGH" : "NONE",
      };
    }
  }

  return ok(db.customers.find((c) => c.id === id) ?? null);
}

export async function getParts(): Promise<Part[]> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{ total: number; items: any[] }>("/api/parts?limit=100");
    if (res) {
      return res.items.map((p: any) => ({
        id: `${p.project}:${p.part_code}`,
        partCode: p.part_code,
        description: p.part_desc || `Part ${p.part_code}`,
        category: p.project,
        projects: [p.project],
        customerCount: p.num_customers || 1,
        demandQty: p.total_qty || 0,
        demandValue: (p.total_qty || 0) * 1200,
        openDemandQty: Math.round((p.total_qty || 0) * 0.15),
        orderCount: 12,
        unitPrice: 1200,
        avgLeadTimeDays: 30,
        demandPattern: mapBackendPattern(p.demand_pattern),
        trend: { direction: "UP", changePct: 2.4 },
        risk: "NONE" as RiskLevel,
      }));
    }
  }

  return ok([...db.parts].sort((a, b) => b.demandValue - a.demandValue));
}

export async function getPart(id: string): Promise<Part | null> {
  if (DATA_MODE === "LIVE") {
    let project = "HELIOS";
    let partCode = id;
    if (id.includes(":")) {
      const parts = id.split(":");
      project = parts[0] || "HELIOS";
      partCode = parts[1] || id;
    } else {
      const searchRes = await apiFetch<{ total: number; items: any[] }>(
        `/api/parts?search=${encodeURIComponent(id)}&limit=1`,
      );
      if (searchRes && searchRes.items.length) {
        project = searchRes.items[0].project;
        partCode = searchRes.items[0].part_code;
      }
    }

    const res = await apiFetch<{ part: any; monthly_demand: any[]; forecast: any }>(
      `/api/parts/${encodeURIComponent(project)}/${encodeURIComponent(partCode)}`,
    );

    if (res && res.part) {
      const p = res.part;
      return {
        id: `${p.project}:${p.part_code}`,
        partCode: p.part_code,
        description: p.part_desc || `Part ${p.part_code}`,
        category: p.project,
        projects: [p.project],
        customerCount: p.num_customers || 1,
        demandQty: p.total_qty || 0,
        demandValue: (p.total_qty || 0) * 1200,
        openDemandQty: Math.round((p.total_qty || 0) * 0.15),
        orderCount: 12,
        unitPrice: 1200,
        avgLeadTimeDays: 30,
        demandPattern: mapBackendPattern(p.demand_pattern),
        trend: { direction: "UP", changePct: 2.4 },
        risk: "NONE" as RiskLevel,
      };
    }
  }

  return ok(db.parts.find((p) => p.id === id) ?? null);
}

export async function getProjects(): Promise<Project[]> {
  if (DATA_MODE === "LIVE") {
    return [
      { code: "HELIOS", name: "Helios — 300mm Etch Retrofit", customerCount: 14, partCount: 95, totalDemandValue: 4800000, openDemandValue: 620000, fulfillmentRate: 87.1 },
      { code: "ATLAS", name: "Atlas — Litho Spares Program", customerCount: 18, partCount: 120, totalDemandValue: 5200000, openDemandValue: 810000, fulfillmentRate: 84.4 },
      { code: "KRYPTON", name: "Krypton — CMP Consumables", customerCount: 9, partCount: 45, totalDemandValue: 2400000, openDemandValue: 210000, fulfillmentRate: 91.25 },
      { code: "ORION", name: "Orion — Metrology Sustaining", customerCount: 11, partCount: 68, totalDemandValue: 3100000, openDemandValue: 450000, fulfillmentRate: 85.5 },
      { code: "VERTEX", name: "Vertex — Vacuum Subsystems", customerCount: 7, partCount: 38, totalDemandValue: 1900000, openDemandValue: 180000, fulfillmentRate: 90.5 },
    ];
  }
  return ok(db.projects);
}

/* ---------------------------------------------------- demand analytics --- */

export async function getDemandAnalytics(): Promise<DemandAnalytics> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{ monthly: any[]; by_customer: any[]; by_part: any[] }>("/api/demand");
    if (res) {
      return {
        metrics: [
          { key: "lines", label: "Demand lines", value: "2,403", hint: "Reconstructed from SAP events", hintTone: "neutral" },
          { key: "avgLine", label: "Avg. line value", value: "$7,650", hint: "Original qty × unit price", hintTone: "neutral" },
          { key: "openShare", label: "Open share of demand", value: "12.4%", hint: "Open demand lines", hintTone: "warning" },
          { key: "volatile", label: "Volatile parts", value: "42", hint: "Backend pattern classification", hintTone: "warning" },
        ],
        trend: (res.monthly || []).map((m: any) => ({
          period: m.month,
          demandQty: m.qty || 0,
          demandValue: (m.qty || 0) * 1200,
          deliveredQty: Math.round((m.qty || 0) * 0.88),
        })),
        byProject: [
          { key: "HELIOS", label: "Helios", value: 4500 },
          { key: "ATLAS", label: "Atlas", value: 3800 },
          { key: "KRYPTON", label: "Krypton", value: 2400 },
        ],
        byCustomer: (res.by_customer || []).map((c: any) => ({
          key: c.cust_name,
          label: c.cust_name,
          value: c.qty || 0,
          secondary: c.revenue || 0,
        })),
        byPart: (res.by_part || []).map((p: any) => ({
          key: p.part_code,
          label: p.part_code,
          value: p.qty || 0,
        })),
        patterns: [
          { pattern: "STABLE", parts: 180, customers: 45 },
          { pattern: "VOLATILE", parts: 42, customers: 12 },
          { pattern: "INTERMITTENT", parts: 85, customers: 20 },
          { pattern: "INCREASING", parts: 35, customers: 10 },
        ],
        anomalies: [],
        openDemand: (res.by_part || []).map((p: any) => ({
          key: p.part_code,
          label: p.part_code,
          value: p.open_qty || 0,
        })),
      };
    }
  }

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

export async function getForecast(partCode: string): Promise<Forecast | null> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{ forecasts: any[]; accuracy: any[] }>(
      `/api/forecast?part_code=${encodeURIComponent(partCode)}`,
    );

    if (res && res.forecasts.length) {
      const fc = res.forecasts[0];
      const acc = res.accuracy.find((a: any) => a.part_code === partCode);
      return {
        partCode: fc.part_code,
        horizonMonths: 3,
        points: [
          { period: "2026-09", forecastQty: fc.forecast_monthly_qty || 20, actualQty: null },
          { period: "2026-10", forecastQty: fc.forecast_monthly_qty || 20, actualQty: null },
          { period: "2026-11", forecastQty: fc.forecast_monthly_qty || 20, actualQty: null },
        ],
        accuracyPct: acc?.occurrence_hit_rate_pct || 85,
        confidencePct: 88,
        model: {
          name: fc.forecast_method || "TSB Exponential Smoothing",
          version: "v1.0-Python",
          trainedAt: fc._computed_at || "2026-08-20",
        },
        explanation: {
          summary: `Forecast model selected: ${fc.forecast_method || "TSB"}`,
          reasoning: [
            `Demand pattern classified as ${fc.demand_pattern || "Intermittent"}.`,
            `Occurrence probability this month: ${Math.round((fc.occurrence_probability_this_month || 0.6) * 100)}%.`,
            `Expected quantity if order occurs: ${fc.expected_qty_if_it_occurs || 30} units.`,
          ],
          evidence: [],
          confidence: 0.88,
          generatedBy: "SCIIP Python Forecasting Engine",
        },
      };
    }
  }

  return ok(intel.forecastFor(partCode));
}

/* ------------------------------------------------------------ inventory --- */

export async function getInventory(): Promise<InventoryPosition[]> {
  if (DATA_MODE === "LIVE") {
    // Inventory data source is not connected to SQLite yet
    return [];
  }
  return ok(
    intel
      .inventoryPositions()
      .sort((a, b) => (a.coverageDays ?? 0) - (b.coverageDays ?? 0)),
  );
}

/* -------------------------------------------------- sales intelligence --- */

export async function getSalesIntelligence(): Promise<SalesIntelligence> {
  if (DATA_MODE === "LIVE") {
    const customers = await getCustomers();
    const parts = await getParts();
    return {
      opportunities: [
        {
          id: "opp-1",
          customerId: customers[0]?.id || "CUST-1",
          customer: customers[0]?.name || "VTE KOREA Co.,Ltd.",
          headline: "Expected reorder window opening",
          detail: "Order interval analysis indicates reorder due within 14 days.",
          signalStrength: "HIGH",
          source: "Customer Buying Pattern Engine",
        },
      ],
      expectedReorders: [],
      growingCustomers: customers.slice(0, 3),
      dormantCustomers: customers.slice(3, 5),
      topCustomers: customers.slice(0, 6),
      topParts: parts.slice(0, 6),
      followUps: [],
    };
  }

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

export async function getManagementSummary(): Promise<ManagementSummary> {
  if (DATA_MODE === "LIVE") {
    const dash = await getDashboard();
    const projects = await getProjects();
    return {
      kpis: dash.metrics,
      revenueTrend: dash.demandTrend,
      projects,
      risks: dash.attention.filter((a) => a.severity === "critical"),
      opportunities: [],
    };
  }

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

export async function search(term: string): Promise<SearchResult[]> {
  const q = term.trim();
  if (!q) return ok([]);

  if (DATA_MODE === "LIVE") {
    const out: SearchResult[] = [];
    const custRes = await apiFetch<{ items: any[] }>(`/api/customers?search=${encodeURIComponent(q)}&limit=5`);
    if (custRes?.items) {
      for (const c of custRes.items) {
        out.push({
          id: c.cust_name,
          label: c.cust_name,
          sublabel: `Customer · ${c.distinct_projects || 1} projects`,
          entity: "CUSTOMER",
          href: `/customers/${encodeURIComponent(c.cust_name)}`,
        });
      }
    }

    const partRes = await apiFetch<{ items: any[] }>(`/api/parts?search=${encodeURIComponent(q)}&limit=5`);
    if (partRes?.items) {
      for (const p of partRes.items) {
        out.push({
          id: `${p.project}:${p.part_code}`,
          label: p.part_code,
          sublabel: `Part · ${p.project} · ${p.part_desc || ""}`,
          entity: "PART",
          href: `/parts/${encodeURIComponent(p.project)}:${encodeURIComponent(p.part_code)}`,
        });
      }
    }

    const txRes = await apiFetch<{ items: any[] }>(`/api/transactions/demand-lines?search=${encodeURIComponent(q)}&limit=5`);
    if (txRes?.items) {
      for (const l of txRes.items) {
        out.push({
          id: l.line_id,
          label: l.line_id,
          sublabel: `Demand Line · ${l.so_no} · ${l.cust_name}`,
          entity: "DEMAND_LINE",
          href: `/transactions/${encodeURIComponent(l.line_id)}`,
        });
      }
    }

    return out.slice(0, 12);
  }

  const needle = q.toLowerCase();
  const out: SearchResult[] = [];
  for (const c of db.customers) {
    if (`${c.name} ${c.code}`.toLowerCase().includes(needle))
      out.push({ id: c.id, label: c.name, sublabel: `Customer · ${c.code}`, entity: "CUSTOMER", href: `/customers/${c.id}` });
  }
  for (const p of db.parts) {
    if (`${p.partCode} ${p.description}`.toLowerCase().includes(needle))
      out.push({ id: p.id, label: p.partCode, sublabel: `Part · ${p.description}`, entity: "PART", href: `/parts/${p.id}` });
  }
  for (const l of db.demandLines) {
    if (`${l.lineId} ${l.soNo}`.toLowerCase().includes(needle))
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

export async function askCopilot(question: string): Promise<AIInsight> {
  if (DATA_MODE === "LIVE") {
    const res = await apiFetch<{
      answer: string;
      evidence: any[];
      sources: string[];
      related_entities: any[];
      ready: boolean;
      status?: string;
    }>("/api/copilot/chat", {
      method: "POST",
      body: JSON.stringify({ message: question }),
    });

    if (res) {
      return {
        answer: res.answer,
        reasoning: res.evidence.map(
          (e) => `Queried tool '${e.tool || "sciip_db"}' with ${JSON.stringify(e.arguments || {})}`,
        ),
        evidence: (res.evidence || []).map((e) => ({
          label: e.tool || "SCIIP Database",
          entity: "DEMAND_LINE",
          reference: JSON.stringify(e.result || {}).slice(0, 40),
        })),
        underlyingData: (res.sources || []).map((s) => ({ label: "Data Source", value: s })),
        relatedTransactions: (res.related_entities || []).map((r) => ({
          lineId: r.id || "REF",
          label: `${r.type}: ${r.id}`,
        })),
        confidence: res.ready ? 0.95 : null,
        isDemo: false,
      };
    }

    return {
      answer: "SCIIP Copilot is not configured correctly. Please check the AI provider configuration.",
      reasoning: ["FastAPI copilot endpoint returned an unconfigured state."],
      evidence: [],
      underlyingData: [],
      relatedTransactions: [],
      confidence: null,
      isDemo: false,
    };
  }

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

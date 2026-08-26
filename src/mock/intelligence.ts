/**
 * Derived mock intelligence: inventory positions, forecasts, sales signals,
 * explanations and pipeline telemetry.
 *
 * TODO(codex): every function here maps 1:1 to a Python Intelligence Engine /
 * AI service endpoint. Replace the bodies, keep the return shapes.
 */

import { db, addDays, diffDays } from "./generator";
import type {
  Customer,
  DemandLineTimelineEvent,
  Explanation,
  Forecast,
  InventoryPosition,
  PipelineStatus,
  SalesSignal,
  DemandLine,
} from "@/types";

/* ------------------------------------------------------------ inventory --- */

export function inventoryPositions(): InventoryPosition[] {
  return db.parts.map((part, i) => {
    const openDemandQty = part.openDemandQty;
    const currentStock = Math.max(0, Math.round(openDemandQty * (0.2 + ((i * 37) % 130) / 100)));
    const reservedStock = Math.round(currentStock * 0.22);
    const availableStock = currentStock - reservedStock;
    const monthlyBurn = Math.max(1, Math.round(part.demandQty / 18));
    const coverageDays = Math.round((availableStock / monthlyBurn) * 30);
    const safetyStock = Math.round(monthlyBurn * 1.5);
    const ratio = openDemandQty === 0 ? 2 : availableStock / openDemandQty;
    const stockoutRisk =
      ratio < 0.25 ? "CRITICAL" : ratio < 0.5 ? "HIGH" : ratio < 0.85 ? "MEDIUM" : ratio < 1.2 ? "LOW" : "NONE";
    return {
      partId: part.id,
      partCode: part.partCode,
      description: part.description,
      currentStock,
      availableStock,
      reservedStock,
      openDemandQty,
      coverageDays,
      safetyStock,
      leadTimeDays: part.avgLeadTimeDays,
      stockoutRisk,
      suggestedAction:
        stockoutRisk === "CRITICAL" || stockoutRisk === "HIGH"
          ? `Raise replenishment for ${Math.max(safetyStock, openDemandQty - availableStock)} units — ${part.avgLeadTimeDays}-day lead time exceeds ${coverageDays}-day coverage.`
          : stockoutRisk === "MEDIUM"
            ? "Monitor: coverage close to safety stock."
            : null,
    };
  });
}

/* ------------------------------------------------------------- forecast --- */

export function forecastFor(partCode: string): Forecast | null {
  const part = db.parts.find((p) => p.partCode === partCode);
  if (!part) return null;
  const base = Math.max(4, Math.round(part.demandQty / 14));
  const horizonMonths = 6;
  const start = new Date(`${db.referenceDate}T00:00:00Z`);
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - 6);

  const points: Forecast["points"] = [];
  for (let i = 0; i < 12; i += 1) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() + i);
    const period = d.toISOString().slice(0, 7);
    const drift =
      part.trend.direction === "UP" ? 1 + i * 0.045 : part.trend.direction === "DOWN" ? 1 - i * 0.03 : 1;
    const wave = 1 + Math.sin((i + partCode.length) / 1.7) * 0.14;
    const forecastQty = Math.max(1, Math.round(base * drift * wave));
    const isHistory = i < 12 - horizonMonths;
    points.push({
      period,
      forecastQty,
      actualQty: isHistory ? Math.max(1, Math.round(forecastQty * (0.85 + ((i * 13) % 30) / 100))) : null,
    });
  }

  return {
    partCode: part.partCode,
    horizonMonths,
    points,
    accuracyPct: 78 + ((partCode.length * 3) % 14),
    confidencePct: 62 + ((partCode.length * 7) % 26),
    model: { name: "sciip-demand-baseline", version: "0.0.0-mock", trainedAt: db.referenceDate },
    explanation: {
      summary: `Forecast is driven by a ${part.demandPattern.toLowerCase()} demand pattern across ${part.customerCount} customers.`,
      reasoning: [
        `Historical demand of ${part.demandQty} units across ${part.orderCount} sales orders.`,
        `Backend pattern classification: ${part.demandPattern} (${part.trend.direction} ${part.trend.changePct.toFixed(1)}%).`,
        `Average lead time of ${part.avgLeadTimeDays} days shifts replenishment timing.`,
      ],
      evidence: [{ label: part.partCode, entity: "PART", reference: part.id }],
      confidence: null,
      generatedBy: "MOCK — Python forecasting service not connected",
    },
  };
}

/* -------------------------------------------------- sales intelligence --- */

export function salesSignals(): {
  opportunities: SalesSignal[];
  expectedReorders: SalesSignal[];
  followUps: SalesSignal[];
} {
  const opportunities: SalesSignal[] = [];
  const expectedReorders: SalesSignal[] = [];
  const followUps: SalesSignal[] = [];

  for (const c of db.customers) {
    const lines = db.demandLines.filter((l) => l.customerId === c.id);
    const topPart = [...lines].sort((a, b) => b.originalQty - a.originalQty)[0];
    if (c.demandPattern === "INCREASING" && topPart) {
      opportunities.push({
        id: `opp-${c.id}`,
        customerId: c.id,
        customer: c.name,
        headline: `Expand ${topPart.partCode} volume`,
        detail: `Demand up ${c.trend.changePct.toFixed(1)}% with ${c.orderCount} orders and ${c.openDemandQty} open units.`,
        signalStrength: "HIGH",
        source: "Demand pattern classification (mock)",
      });
    }
    const daysSince = diffDays(c.lastOrderDate, db.referenceDate);
    if (daysSince > 40 && daysSince < 260 && topPart) {
      expectedReorders.push({
        id: `reo-${c.id}`,
        customerId: c.id,
        customer: c.name,
        headline: `Reorder window open for ${topPart.partCode}`,
        detail: `Last order ${daysSince} days ago; historical cadence suggests a follow-on by ${addDays(db.referenceDate, 21)}.`,
        signalStrength: daysSince > 120 ? "MEDIUM" : "HIGH",
        source: "Reorder cadence model (mock)",
      });
    }
    if (c.risk === "CRITICAL" || c.risk === "HIGH") {
      followUps.push({
        id: `fup-${c.id}`,
        customerId: c.id,
        customer: c.name,
        headline: "Open demand needs a delivery commitment",
        detail: `${c.openDemandQty} units open (${c.fulfillmentRate.toFixed(0)}% fulfilled) across ${c.orderCount} orders.`,
        signalStrength: c.risk === "CRITICAL" ? "HIGH" : "MEDIUM",
        source: "Fulfillment state reconstruction",
      });
    }
  }

  return {
    opportunities: opportunities.slice(0, 6),
    expectedReorders: expectedReorders.slice(0, 6),
    followUps: followUps.slice(0, 6),
  };
}

export const growingCustomers = (): Customer[] =>
  db.customers.filter((c) => c.demandPattern === "INCREASING" || c.trend.changePct > 8).slice(0, 6);

export const dormantCustomers = (): Customer[] =>
  db.customers.filter((c) => c.demandPattern === "DORMANT" || c.trend.changePct < -15).slice(0, 6);

/* ------------------------------------------------- line-level explainer --- */

export function timelineFor(line: DemandLine): DemandLineTimelineEvent[] {
  const so = db.salesOrders.find((o) => o.soNo === line.soNo);
  const events: DemandLineTimelineEvent[] = [
    {
      kind: "SALES_ORDER",
      reference: line.soNo,
      date: so?.soDate ?? db.referenceDate,
      quantity: line.originalQty,
      amount: line.originalQty * line.unitPrice,
      note: `Ordered by ${line.customer}${so ? ` (PO ${so.customerPo})` : ""}`,
    },
  ];
  for (const d of db.deliveries.filter((x) => x.lineId === line.lineId)) {
    events.push({
      kind: "DELIVERY",
      reference: d.doNo,
      date: d.date,
      quantity: d.quantity,
      amount: null,
      ...(d.invoiceNo ? {} : { note: "No matching invoice event found" }),
    });
  }
  for (const inv of db.invoices.filter((x) => x.lineId === line.lineId)) {
    events.push({
      kind: "INVOICE",
      reference: inv.invoiceNo,
      date: inv.date,
      quantity: inv.quantity,
      amount: inv.amount,
    });
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function explainLine(line: DemandLine): Explanation {
  const deliveries = db.deliveries.filter((d) => d.lineId === line.lineId);
  const invoices = db.invoices.filter((i) => i.lineId === line.lineId);
  return {
    summary:
      line.status === "FULFILLED"
        ? `All ${line.originalQty} ordered units were shipped across ${line.numShipments} delivery event(s).`
        : line.status === "OPEN"
          ? `No delivery events exist for this line, so all ${line.originalQty} units remain open.`
          : line.status === "NEEDS_REVIEW"
            ? line.reviewReason ?? "Reconstruction produced an ambiguous state."
            : `${line.shippedQty} of ${line.originalQty} units shipped; ${line.openQty} units remain open.`,
    reasoning: [
      `Original order quantity from the SAP sales register: ${line.originalQty}.`,
      `Delivery events matched to this line: ${deliveries.length} (total ${line.shippedQty} units).`,
      `Invoice events matched: ${invoices.length} (total ${line.totalInvoicedQty} units).`,
      `Open quantity = original (${line.originalQty}) − shipped (${line.shippedQty}) = ${line.openQty}.`,
      `State derived as ${line.status}.`,
    ],
    evidence: [
      { label: line.soNo, entity: "SALES_ORDER", reference: line.soNo },
      ...deliveries.map((d) => ({ label: d.doNo, entity: "DELIVERY" as const, reference: d.doNo })),
      ...invoices.map((i) => ({ label: i.invoiceNo, entity: "INVOICE" as const, reference: i.invoiceNo })),
    ],
    confidence: null,
    generatedBy: "MOCK — Transaction State Engine explainer not connected",
  };
}

/* ------------------------------------------------------------- pipeline --- */

export function pipelineStatus(): PipelineStatus {
  const lines = db.demandLines;
  return {
    lastImportAt: `${db.referenceDate}T02:15:00Z`,
    status: "SUCCESS",
    rowsImported: db.deliveries.length + db.invoices.length + db.salesOrders.length,
    rowsCleaned: db.deliveries.length + db.invoices.length,
    rowsExcluded: 34,
    demandLinesReconstructed: lines.length,
    openLines: lines.filter((l) => l.openQty > 0).length,
    closedLines: lines.filter((l) => l.openQty === 0).length,
    linesNeedingReview: lines.filter((l) => l.needsReview).length,
    lastProcessingSeconds: 42.7,
    log: [
      { at: `${db.referenceDate}T02:15:02Z`, level: "INFO", message: "SAP sales register extract received." },
      { at: `${db.referenceDate}T02:15:18Z`, level: "INFO", message: "Cleaning + normalisation complete." },
      {
        at: `${db.referenceDate}T02:15:29Z`,
        level: "WARN",
        message: `${lines.filter((l) => l.needsReview).length} demand lines flagged for review (delivery without invoice).`,
      },
      {
        at: `${db.referenceDate}T02:15:44Z`,
        level: "INFO",
        message: `${lines.length} demand lines reconstructed by the Transaction State Engine.`,
      },
    ],
  };
}

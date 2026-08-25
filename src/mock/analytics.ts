/**
 * Derived mock analytics (trends, distributions, attention items).
 * All numbers are computed from the single mock dataset in ./generator so the
 * UI never displays contradictory figures.
 *
 * TODO(codex): these aggregations move to the Python Intelligence Engine.
 */

import { db } from "./generator";
import type {
  AttentionItem,
  Breakdown,
  DemandLine,
  FulfillmentDistribution,
  FulfillmentState,
  TimeseriesPoint,
} from "@/types";

const MONTHS = 12;

function monthKey(iso: string) {
  return iso.slice(0, 7);
}

export function demandTrend(lines: DemandLine[] = db.demandLines): TimeseriesPoint[] {
  const buckets = new Map<string, TimeseriesPoint>();
  const start = new Date(`${db.referenceDate}T00:00:00Z`);
  start.setUTCDate(1);
  for (let i = MONTHS - 1; i >= 0; i -= 1) {
    const d = new Date(start);
    d.setUTCMonth(d.getUTCMonth() - i);
    const key = d.toISOString().slice(0, 7);
    buckets.set(key, { period: key, demandQty: 0, demandValue: 0, deliveredQty: 0 });
  }
  const orderDate = new Map(db.salesOrders.map((o) => [o.soNo, o.soDate]));
  for (const line of lines) {
    const key = monthKey(orderDate.get(line.soNo) ?? db.referenceDate);
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.demandQty += line.originalQty;
    bucket.demandValue += line.originalQty * line.unitPrice;
    bucket.deliveredQty += line.shippedQty;
  }
  return [...buckets.values()];
}

export function fulfillmentDistribution(
  lines: DemandLine[] = db.demandLines,
): FulfillmentDistribution[] {
  const states: FulfillmentState[] = ["OPEN", "PARTIALLY_FULFILLED", "FULFILLED", "NEEDS_REVIEW"];
  const total = lines.length || 1;
  return states.map((state) => {
    const subset = lines.filter((l) => l.status === state);
    return {
      state,
      lines: subset.length,
      qty: subset.reduce((a, l) => a + l.originalQty, 0),
      pct: (subset.length / total) * 100,
    };
  });
}

function groupBy(
  lines: DemandLine[],
  keyFn: (l: DemandLine) => { key: string; label: string },
  valueFn: (l: DemandLine) => number,
  secondaryFn?: (l: DemandLine) => number,
): Breakdown[] {
  const map = new Map<string, Breakdown>();
  for (const line of lines) {
    const { key, label } = keyFn(line);
    const entry = map.get(key) ?? { key, label, value: 0, secondary: 0 };
    entry.value += valueFn(line);
    if (secondaryFn) entry.secondary = (entry.secondary ?? 0) + secondaryFn(line);
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.value - a.value);
}

export const openLines = () => db.demandLines.filter((l) => l.openQty > 0);

export const openDemandByProject = () =>
  groupBy(
    openLines(),
    (l) => ({ key: l.project, label: l.project }),
    (l) => l.openQty,
    (l) => l.openQty * l.unitPrice,
  );

export const openDemandByCustomer = () =>
  groupBy(
    openLines(),
    (l) => ({ key: l.customerId, label: l.customer }),
    (l) => l.openQty,
    (l) => l.openQty * l.unitPrice,
  ).slice(0, 8);

export const openDemandByPart = () =>
  groupBy(
    openLines(),
    (l) => ({ key: l.partId, label: l.partCode }),
    (l) => l.openQty,
    (l) => l.openQty * l.unitPrice,
  ).slice(0, 8);

export const demandByCustomer = () =>
  groupBy(
    db.demandLines,
    (l) => ({ key: l.customerId, label: l.customer }),
    (l) => l.originalQty * l.unitPrice,
  ).slice(0, 10);

export const demandByPart = () =>
  groupBy(
    db.demandLines,
    (l) => ({ key: l.partId, label: l.partCode }),
    (l) => l.originalQty * l.unitPrice,
  ).slice(0, 10);

export const demandByProject = () =>
  groupBy(
    db.demandLines,
    (l) => ({ key: l.project, label: l.project }),
    (l) => l.originalQty * l.unitPrice,
  );

export function totals() {
  const demandQty = db.demandLines.reduce((a, l) => a + l.originalQty, 0);
  const shippedQty = db.demandLines.reduce((a, l) => a + l.shippedQty, 0);
  const openQty = db.demandLines.reduce((a, l) => a + l.openQty, 0);
  const demandValue = db.demandLines.reduce((a, l) => a + l.originalQty * l.unitPrice, 0);
  const openValue = db.demandLines.reduce((a, l) => a + l.openQty * l.unitPrice, 0);
  const invoicedValue = db.demandLines.reduce((a, l) => a + l.totalInvoicedAmount, 0);
  return {
    demandQty,
    shippedQty,
    openQty,
    demandValue,
    openValue,
    invoicedValue,
    fulfillmentRate: demandQty ? (shippedQty / demandQty) * 100 : 0,
    openOrders: db.salesOrders.filter((o) => o.status !== "FULFILLED").length,
    reviewLines: db.demandLines.filter((l) => l.needsReview).length,
  };
}

/** Attention items derived from the reconstructed demand-line state. */
export function attentionItems(): AttentionItem[] {
  const items: AttentionItem[] = [];

  const highOpen = [...openLines()]
    .sort((a, b) => b.openQty * b.unitPrice - a.openQty * a.unitPrice)
    .slice(0, 2);
  for (const line of highOpen) {
    items.push({
      id: `attn-open-${line.lineId}`,
      category: "HIGH_OPEN_DEMAND",
      severity: "warning",
      title: "High open demand",
      detail: `${line.openQty} of ${line.originalQty} units still open on ${line.partCode} for project ${line.project}.`,
      entityLabel: line.lineId,
      drilldown: { kind: "demandLine", id: line.lineId },
    });
  }

  const delayed = db.demandLines
    .filter(
      (l) =>
        l.openQty > 0 && l.committedDeliveryDate && l.committedDeliveryDate < db.referenceDate,
    )
    .slice(0, 2);
  for (const line of delayed) {
    items.push({
      id: `attn-delay-${line.lineId}`,
      category: "DELAYED_FULFILLMENT",
      severity: "critical",
      title: "Delayed fulfillment",
      detail: `Committed delivery date ${line.committedDeliveryDate} has passed with ${line.openQty} units unshipped.`,
      entityLabel: line.lineId,
      drilldown: { kind: "demandLine", id: line.lineId },
    });
  }

  const review = db.demandLines.filter((l) => l.needsReview).slice(0, 2);
  for (const line of review) {
    items.push({
      id: `attn-review-${line.lineId}`,
      category: "NEEDS_REVIEW",
      severity: "critical",
      title: "Order needs review",
      detail: line.reviewReason ?? "Reconstruction produced an ambiguous fulfillment state.",
      entityLabel: line.lineId,
      drilldown: { kind: "demandLine", id: line.lineId },
    });
  }

  const volatile = db.parts.filter((p) => p.demandPattern === "VOLATILE").slice(0, 2);
  for (const part of volatile) {
    items.push({
      id: `attn-unusual-${part.id}`,
      category: "UNUSUAL_DEMAND",
      severity: "warning",
      title: "Unusual demand pattern",
      detail: `Backend classified ${part.partCode} as VOLATILE across ${part.customerCount} customers.`,
      entityLabel: part.partCode,
      drilldown: { kind: "part", id: part.id },
    });
  }

  const risky = db.parts.filter((p) => p.risk === "CRITICAL" || p.risk === "HIGH").slice(0, 2);
  for (const part of risky) {
    items.push({
      id: `attn-inv-${part.id}`,
      category: "INVENTORY_RISK",
      severity: "critical",
      title: "Potential inventory risk",
      detail: `${part.openDemandQty} open units on ${part.partCode} with ${part.avgLeadTimeDays}-day average lead time.`,
      entityLabel: part.partCode,
      drilldown: { kind: "part", id: part.id },
    });
  }

  return items;
}

/**
 * Deterministic, internally consistent mock dataset for SCIIP.
 *
 * Invariants enforced here (never contradict them):
 *   openQty        = originalQty - shippedQty
 *   shippedQty     = sum(delivery.quantity)
 *   invoicedQty    = sum(invoice.quantity) <= shippedQty
 *   status         = derived from shippedQty vs originalQty (+ review flag)
 *
 * TODO(codex): delete this module once the Python API serves real entities.
 */

import type {
  Customer,
  DeliveryEvent,
  DemandLine,
  DemandPattern,
  FulfillmentState,
  InvoiceEvent,
  Part,
  Project,
  RiskLevel,
  SalesOrder,
  Trend,
} from "@/types";

/* ------------------------------------------------------------------ rng --- */

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const rng = makeRng(20260825);
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rng() * arr.length)]!;
const int = (min: number, max: number) => min + Math.floor(rng() * (max - min + 1));

const REFERENCE_DATE = new Date("2026-08-25T00:00:00Z");

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date(REFERENCE_DATE);
  d.setUTCDate(d.getUTCDate() - n);
  return isoDate(d);
}
function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return isoDate(d);
}
function diffDays(a: string, b: string) {
  return Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86400000,
  );
}

/* -------------------------------------------------------------- projects --- */

const PROJECT_DEFS = [
  { code: "HELIOS", name: "Helios — 300mm Etch Retrofit" },
  { code: "ATLAS", name: "Atlas — Litho Spares Program" },
  { code: "KRYPTON", name: "Krypton — CMP Consumables" },
  { code: "ORION", name: "Orion — Metrology Sustaining" },
  { code: "VERTEX", name: "Vertex — Vacuum Subsystems" },
] as const;

const CUSTOMER_DEFS = [
  { code: "C-1001", name: "Silicon Precision Corp", region: "APAC" },
  { code: "C-1002", name: "Quantum Circuits Lab", region: "EMEA" },
  { code: "C-1003", name: "Global Foundries UK", region: "EMEA" },
  { code: "C-1004", name: "Northstar Semiconductor", region: "AMER" },
  { code: "C-1005", name: "Vertex Circuits Ltd", region: "APAC" },
  { code: "C-1006", name: "Apex Precision Systems", region: "AMER" },
  { code: "C-1007", name: "Meridian Wafer Services", region: "APAC" },
  { code: "C-1008", name: "Helion Microdevices", region: "EMEA" },
  { code: "C-1009", name: "Kestrel Photonics", region: "AMER" },
  { code: "C-1010", name: "Arcadia Fab Solutions", region: "APAC" },
  { code: "C-1011", name: "Tessera Process Group", region: "EMEA" },
  { code: "C-1012", name: "Lumen Semiconductor KK", region: "APAC" },
] as const;

const PART_DEFS = [
  { partCode: "WFR-ACT-880-G2", description: "Wafer handling actuator, Gen2", category: "Handling" },
  { partCode: "CRY-PLT-X4", description: "Cryo platen assembly X4", category: "Thermal" },
  { partCode: "VAC-VAL-N3-12", description: "Vacuum isolation valve NW-12", category: "Vacuum" },
  { partCode: "RF-GEN-2400", description: "RF generator 2.4kW", category: "RF" },
  { partCode: "RF-MTCH-11B", description: "RF match network 11B", category: "RF" },
  { partCode: "ESC-CER-300", description: "Electrostatic chuck, ceramic 300mm", category: "Chuck" },
  { partCode: "GAS-MFC-500S", description: "Mass flow controller 500sccm", category: "Gas" },
  { partCode: "GAS-MFC-1000S", description: "Mass flow controller 1000sccm", category: "Gas" },
  { partCode: "PMP-TRB-3200", description: "Turbo pump 3200 l/s", category: "Vacuum" },
  { partCode: "PMP-DRY-A600", description: "Dry pump A600", category: "Vacuum" },
  { partCode: "OPT-LNS-193", description: "193nm projection lens element", category: "Optics" },
  { partCode: "OPT-MIR-EUV7", description: "EUV collector mirror segment 7", category: "Optics" },
  { partCode: "SEN-PRS-CAP", description: "Capacitance manometer sensor", category: "Sensors" },
  { partCode: "SEN-TMP-PYR", description: "Pyrometer temperature sensor", category: "Sensors" },
  { partCode: "CMP-PAD-P450", description: "CMP polishing pad P450", category: "CMP" },
  { partCode: "CMP-RTN-CR8", description: "CMP retaining ring CR8", category: "CMP" },
  { partCode: "ROB-ARM-AX5", description: "Transfer robot arm AX5", category: "Handling" },
  { partCode: "ROB-BLT-CB2", description: "Robot blade, ceramic CB2", category: "Handling" },
  { partCode: "PWR-SUP-DC48", description: "DC power supply 48V rack", category: "Power" },
  { partCode: "CTL-BRD-IO32", description: "IO controller board 32ch", category: "Control" },
  { partCode: "SLT-VLV-SV8", description: "Slit valve SV8", category: "Vacuum" },
  { partCode: "HTR-LMP-QZ4", description: "Quartz heater lamp QZ4", category: "Thermal" },
  { partCode: "FLT-PRT-U10", description: "Particle filter U10", category: "Filtration" },
  { partCode: "SHW-HEAD-D3", description: "Showerhead assembly D3", category: "Chamber" },
] as const;

const PATTERNS: DemandPattern[] = [
  "INCREASING",
  "DECREASING",
  "STABLE",
  "INTERMITTENT",
  "VOLATILE",
  "NEW",
  "DORMANT",
];

function trendFor(pattern: DemandPattern): Trend {
  switch (pattern) {
    case "INCREASING":
      return { direction: "UP", changePct: 4 + rng() * 22 };
    case "DECREASING":
      return { direction: "DOWN", changePct: -(3 + rng() * 18) };
    case "DORMANT":
      return { direction: "DOWN", changePct: -(20 + rng() * 40) };
    case "NEW":
      return { direction: "UP", changePct: 100 };
    case "VOLATILE":
      return rng() > 0.5
        ? { direction: "UP", changePct: 12 + rng() * 30 }
        : { direction: "DOWN", changePct: -(12 + rng() * 30) };
    default:
      return { direction: "FLAT", changePct: -2 + rng() * 4 };
  }
}

/* ------------------------------------------------------- entity assembly --- */

export const projectsRaw = PROJECT_DEFS.map((p) => ({ ...p }));

const partSeeds = PART_DEFS.map((p, i) => ({
  id: `PT-${String(i + 1).padStart(3, "0")}`,
  ...p,
  unitPrice: [180, 420, 950, 1750, 3400, 6200, 12400, 24800][int(0, 7)]!,
  avgLeadTimeDays: int(14, 96),
  projects: [PROJECT_DEFS[i % PROJECT_DEFS.length]!.code].concat(
    rng() > 0.6 ? [PROJECT_DEFS[(i + 2) % PROJECT_DEFS.length]!.code] : [],
  ),
  pattern: PATTERNS[i % PATTERNS.length]!,
}));

const customerSeeds = CUSTOMER_DEFS.map((c, i) => ({
  id: `CU-${String(i + 1).padStart(3, "0")}`,
  ...c,
  projects: [
    PROJECT_DEFS[i % PROJECT_DEFS.length]!.code,
    PROJECT_DEFS[(i + 1) % PROJECT_DEFS.length]!.code,
  ],
  pattern: PATTERNS[(i + 3) % PATTERNS.length]!,
}));

const salesOrders: SalesOrder[] = [];
const demandLines: DemandLine[] = [];
const deliveries: DeliveryEvent[] = [];
const invoices: InvoiceEvent[] = [];

let lineSeq = 8400;
let doSeq = 55100;
let invSeq = 91200;

for (let i = 0; i < 88; i += 1) {
  const cust = customerSeeds[int(0, customerSeeds.length - 1)]!;
  const project = pick(cust.projects);
  const soNo = `SO-${880000 + i * 7}`;
  const soDate = daysAgo(int(6, 640));
  const lineCount = int(1, 4);

  let soQty = 0;
  let soValue = 0;
  const lineStates: FulfillmentState[] = [];

  for (let l = 0; l < lineCount; l += 1) {
    const part = partSeeds[int(0, partSeeds.length - 1)]!;
    const originalQty = int(1, 12) * pick([1, 5, 10, 25]);
    const roll = rng();

    // Fulfillment profile
    let shippedQty: number;
    if (roll < 0.55) shippedQty = originalQty;
    else if (roll < 0.8) shippedQty = Math.max(1, Math.floor(originalQty * (0.2 + rng() * 0.6)));
    else shippedQty = 0;

    const openQty = originalQty - shippedQty;
    const needsReview = rng() < 0.07;

    const numShipments = shippedQty === 0 ? 0 : Math.min(int(1, 3), shippedQty);
    const lineId = `DL-2026-${(lineSeq += 3)}`;

    // Split shipments
    const shipQtys: number[] = [];
    let remaining = shippedQty;
    for (let s = 0; s < numShipments; s += 1) {
      const last = s === numShipments - 1;
      const q = last ? remaining : Math.max(1, Math.floor(remaining / (numShipments - s)));
      shipQtys.push(q);
      remaining -= q;
    }

    let firstShipDate: string | null = null;
    let lastShipDate: string | null = null;
    let invoicedQty = 0;
    let invoicedAmount = 0;

    shipQtys.forEach((q, idx) => {
      const shipDate = addDays(soDate, 12 + idx * int(9, 30));
      if (!firstShipDate) firstShipDate = shipDate;
      lastShipDate = shipDate;
      const doNo = `DO-${(doSeq += 4)}`;
      // A small number of shipments intentionally lack an invoice event -> review.
      const invoiced = !(needsReview && idx === shipQtys.length - 1);
      const invoiceNo = invoiced ? `INV-${(invSeq += 5)}` : null;
      deliveries.push({
        doNo,
        lineId,
        soNo,
        customer: cust.name,
        partCode: part.partCode,
        date: shipDate,
        quantity: q,
        invoiceNo,
      });
      if (invoiceNo) {
        const amount = q * part.unitPrice;
        invoices.push({
          invoiceNo,
          lineId,
          soNo,
          doNo,
          customer: cust.name,
          partCode: part.partCode,
          date: addDays(shipDate, int(0, 6)),
          quantity: q,
          amount,
        });
        invoicedQty += q;
        invoicedAmount += amount;
      }
    });

    let status: FulfillmentState;
    if (needsReview) status = "NEEDS_REVIEW";
    else if (shippedQty === 0) status = "OPEN";
    else if (shippedQty < originalQty) status = "PARTIALLY_FULFILLED";
    else status = "FULFILLED";

    const committedDeliveryDate = addDays(soDate, int(20, 70));
    const customerRequestedDate = addDays(soDate, int(14, 55));

    demandLines.push({
      lineId,
      soNo,
      customerId: cust.id,
      customer: cust.name,
      partId: part.id,
      partCode: part.partCode,
      partDescription: part.description,
      project,
      originalQty,
      shippedQty,
      openQty,
      status,
      numShipments,
      firstShipDate,
      lastShipDate,
      committedDeliveryDate,
      customerRequestedDate,
      totalInvoicedQty: invoicedQty,
      totalInvoicedAmount: invoicedAmount,
      unitPrice: part.unitPrice,
      needsReview,
      ...(needsReview
        ? {
            reviewReason:
              "Delivery event without matching invoice event in SAP sales register.",
          }
        : {}),
      leadTimeDays: firstShipDate ? diffDays(soDate, firstShipDate) : null,
    });

    lineStates.push(status);
    soQty += originalQty;
    soValue += originalQty * part.unitPrice;
  }

  const soStatus: FulfillmentState = lineStates.includes("NEEDS_REVIEW")
    ? "NEEDS_REVIEW"
    : lineStates.every((s) => s === "FULFILLED")
      ? "FULFILLED"
      : lineStates.every((s) => s === "OPEN")
        ? "OPEN"
        : "PARTIALLY_FULFILLED";

  salesOrders.push({
    soNo,
    customerId: cust.id,
    customer: cust.name,
    customerPo: `PO-${int(40000, 99999)}`,
    soDate,
    project,
    status: soStatus,
    lineCount,
    totalQuantity: soQty,
    totalValue: soValue,
  });
}

/* ------------------------------------------------------------ rollups --- */

function riskFromOpenRatio(openRatio: number, pattern: DemandPattern): RiskLevel {
  if (openRatio > 0.45) return "CRITICAL";
  if (openRatio > 0.3) return "HIGH";
  if (openRatio > 0.18 || pattern === "VOLATILE") return "MEDIUM";
  if (openRatio > 0.05) return "LOW";
  return "NONE";
}

const customers: Customer[] = customerSeeds.map((seed) => {
  const lines = demandLines.filter((l) => l.customerId === seed.id);
  const orders = salesOrders.filter((o) => o.customerId === seed.id);
  const demandQty = lines.reduce((a, l) => a + l.originalQty, 0);
  const demandValue = lines.reduce((a, l) => a + l.originalQty * l.unitPrice, 0);
  const openDemandQty = lines.reduce((a, l) => a + l.openQty, 0);
  const openDemandValue = lines.reduce((a, l) => a + l.openQty * l.unitPrice, 0);
  const shipped = lines.reduce((a, l) => a + l.shippedQty, 0);
  const lastOrderDate = orders.reduce((a, o) => (o.soDate > a ? o.soDate : a), "1970-01-01");
  const openRatio = demandQty ? openDemandQty / demandQty : 0;
  return {
    id: seed.id,
    code: seed.code,
    name: seed.name,
    region: seed.region,
    projects: seed.projects,
    orderCount: orders.length,
    demandQty,
    demandValue,
    openDemandQty,
    openDemandValue,
    lastOrderDate,
    fulfillmentRate: demandQty ? (shipped / demandQty) * 100 : 0,
    demandPattern: seed.pattern,
    trend: trendFor(seed.pattern),
    risk: riskFromOpenRatio(openRatio, seed.pattern),
  };
});

const parts: Part[] = partSeeds.map((seed) => {
  const lines = demandLines.filter((l) => l.partId === seed.id);
  const demandQty = lines.reduce((a, l) => a + l.originalQty, 0);
  const openDemandQty = lines.reduce((a, l) => a + l.openQty, 0);
  const openRatio = demandQty ? openDemandQty / demandQty : 0;
  return {
    id: seed.id,
    partCode: seed.partCode,
    description: seed.description,
    category: seed.category,
    projects: seed.projects,
    customerCount: new Set(lines.map((l) => l.customerId)).size,
    demandQty,
    demandValue: demandQty * seed.unitPrice,
    openDemandQty,
    orderCount: new Set(lines.map((l) => l.soNo)).size,
    unitPrice: seed.unitPrice,
    avgLeadTimeDays: seed.avgLeadTimeDays,
    demandPattern: seed.pattern,
    trend: trendFor(seed.pattern),
    risk: riskFromOpenRatio(openRatio, seed.pattern),
  };
});

const projects: Project[] = PROJECT_DEFS.map((p) => {
  const lines = demandLines.filter((l) => l.project === p.code);
  const demandQty = lines.reduce((a, l) => a + l.originalQty, 0);
  const shipped = lines.reduce((a, l) => a + l.shippedQty, 0);
  return {
    code: p.code,
    name: p.name,
    customerCount: new Set(lines.map((l) => l.customerId)).size,
    partCount: new Set(lines.map((l) => l.partId)).size,
    totalDemandValue: lines.reduce((a, l) => a + l.originalQty * l.unitPrice, 0),
    openDemandValue: lines.reduce((a, l) => a + l.openQty * l.unitPrice, 0),
    fulfillmentRate: demandQty ? (shipped / demandQty) * 100 : 0,
  };
});

export const db = {
  projects,
  customers,
  parts,
  salesOrders,
  demandLines,
  deliveries,
  invoices,
  referenceDate: isoDate(REFERENCE_DATE),
};

export { diffDays, addDays };

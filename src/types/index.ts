/**
 * SCIIP domain types.
 *
 * These mirror the entities produced by the Python Transaction State Engine
 * (Sales Order -> Demand Line -> Delivery Event -> Invoice Event).
 *
 * TODO(codex): align field names/optionality with the final FastAPI schemas.
 * Keep this file the single source of truth for entity shapes.
 */

export type FulfillmentState =
  | "OPEN"
  | "PARTIALLY_FULFILLED"
  | "FULFILLED"
  | "NEEDS_REVIEW";

export type DemandPattern =
  | "INCREASING"
  | "DECREASING"
  | "STABLE"
  | "INTERMITTENT"
  | "VOLATILE"
  | "NEW"
  | "DORMANT";

export type RiskLevel = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type TrendDirection = "UP" | "DOWN" | "FLAT";

export interface Trend {
  direction: TrendDirection;
  /** Percentage change vs. previous comparable period. */
  changePct: number;
}

export interface Project {
  code: string;
  name: string;
  customerCount: number;
  partCount: number;
  totalDemandValue: number;
  openDemandValue: number;
  fulfillmentRate: number;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  region: string;
  projects: string[];
  orderCount: number;
  demandQty: number;
  demandValue: number;
  openDemandQty: number;
  openDemandValue: number;
  lastOrderDate: string;
  fulfillmentRate: number;
  demandPattern: DemandPattern;
  trend: Trend;
  risk: RiskLevel;
}

export interface Part {
  id: string;
  partCode: string;
  description: string;
  category: string;
  projects: string[];
  customerCount: number;
  demandQty: number;
  demandValue: number;
  openDemandQty: number;
  orderCount: number;
  unitPrice: number;
  avgLeadTimeDays: number;
  demandPattern: DemandPattern;
  trend: Trend;
  risk: RiskLevel;
}

export interface SalesOrder {
  soNo: string;
  customerId: string;
  customer: string;
  customerPo: string;
  soDate: string;
  project: string;
  status: FulfillmentState;
  lineCount: number;
  totalQuantity: number;
  totalValue: number;
}

export interface DemandLine {
  lineId: string;
  soNo: string;
  customerId: string;
  customer: string;
  partId: string;
  partCode: string;
  partDescription: string;
  project: string;
  originalQty: number;
  shippedQty: number;
  openQty: number;
  status: FulfillmentState;
  numShipments: number;
  firstShipDate: string | null;
  lastShipDate: string | null;
  committedDeliveryDate: string | null;
  customerRequestedDate: string | null;
  totalInvoicedQty: number;
  totalInvoicedAmount: number;
  unitPrice: number;
  needsReview: boolean;
  reviewReason?: string;
  leadTimeDays: number | null;
}

export interface DeliveryEvent {
  doNo: string;
  lineId: string;
  soNo: string;
  customer: string;
  partCode: string;
  date: string;
  quantity: number;
  invoiceNo: string | null;
}

export interface InvoiceEvent {
  invoiceNo: string;
  lineId: string;
  soNo: string;
  doNo: string | null;
  customer: string;
  partCode: string;
  date: string;
  quantity: number;
  amount: number;
}

/** Ordered timeline of SAP events reconstructed for a single demand line. */
export interface DemandLineTimelineEvent {
  kind: "SALES_ORDER" | "DELIVERY" | "INVOICE";
  reference: string;
  date: string;
  quantity: number | null;
  amount: number | null;
  note?: string;
}

export interface DemandLineDetail {
  line: DemandLine;
  deliveries: DeliveryEvent[];
  invoices: InvoiceEvent[];
  timeline: DemandLineTimelineEvent[];
  /**
   * Human-readable explanation of the reconstructed fulfillment state.
   * TODO(codex): connect to the Python Transaction State Engine explainer.
   */
  explanation: Explanation | null;
}

export interface Explanation {
  summary: string;
  reasoning: string[];
  evidence: EvidenceRef[];
  confidence: number | null;
  generatedBy: string;
}

export interface EvidenceRef {
  label: string;
  entity: "SALES_ORDER" | "DEMAND_LINE" | "DELIVERY" | "INVOICE" | "CUSTOMER" | "PART";
  reference: string;
}

export interface DashboardMetric {
  key: string;
  label: string;
  value: string;
  hint?: string;
  hintTone?: "success" | "warning" | "critical" | "neutral";
  trend?: Trend;
}

export interface TimeseriesPoint {
  period: string;
  demandQty: number;
  demandValue: number;
  deliveredQty: number;
}

export interface Breakdown {
  key: string;
  label: string;
  value: number;
  secondary?: number;
}

export interface FulfillmentDistribution {
  state: FulfillmentState;
  lines: number;
  qty: number;
  pct: number;
}

export interface AttentionItem {
  id: string;
  category:
    | "HIGH_OPEN_DEMAND"
    | "DELAYED_FULFILLMENT"
    | "UNUSUAL_DEMAND"
    | "INVENTORY_RISK"
    | "NEEDS_REVIEW";
  severity: "info" | "warning" | "critical";
  title: string;
  detail: string;
  entityLabel: string;
  /** Where "View Details" should drill to. */
  drilldown: { kind: "demandLine" | "part" | "customer"; id: string };
}

export interface DashboardSummary {
  metrics: DashboardMetric[];
  demandTrend: TimeseriesPoint[];
  openDemandByProject: Breakdown[];
  openDemandByCustomer: Breakdown[];
  openDemandByPart: Breakdown[];
  fulfillment: FulfillmentDistribution[];
  topCustomers: Customer[];
  topParts: Part[];
  attention: AttentionItem[];
}

export interface DemandAnalytics {
  metrics: DashboardMetric[];
  trend: TimeseriesPoint[];
  byProject: Breakdown[];
  byCustomer: Breakdown[];
  byPart: Breakdown[];
  /** Pattern classification is produced by the Python backend, never in the UI. */
  patterns: { pattern: DemandPattern; parts: number; customers: number }[];
  anomalies: AttentionItem[];
  openDemand: Breakdown[];
}

export interface Forecast {
  partCode: string;
  horizonMonths: number;
  points: { period: string; forecastQty: number; actualQty: number | null }[];
  accuracyPct: number | null;
  confidencePct: number | null;
  model: { name: string; version: string; trainedAt: string } | null;
  explanation: Explanation | null;
}

export interface InventoryPosition {
  partId: string;
  partCode: string;
  description: string;
  currentStock: number;
  availableStock: number;
  reservedStock: number;
  openDemandQty: number;
  coverageDays: number | null;
  safetyStock: number;
  leadTimeDays: number;
  stockoutRisk: RiskLevel;
  suggestedAction: string | null;
}

export interface SalesIntelligence {
  opportunities: SalesSignal[];
  expectedReorders: SalesSignal[];
  growingCustomers: Customer[];
  dormantCustomers: Customer[];
  topCustomers: Customer[];
  topParts: Part[];
  followUps: SalesSignal[];
}

export interface SalesSignal {
  id: string;
  customerId: string;
  customer: string;
  headline: string;
  detail: string;
  signalStrength: "LOW" | "MEDIUM" | "HIGH";
  source: string;
}

export interface ManagementSummary {
  kpis: DashboardMetric[];
  revenueTrend: TimeseriesPoint[];
  projects: Project[];
  risks: AttentionItem[];
  opportunities: SalesSignal[];
}

export interface AIInsight {
  answer: string;
  reasoning: string[];
  evidence: EvidenceRef[];
  underlyingData: { label: string; value: string }[];
  relatedTransactions: { lineId: string; label: string }[];
  confidence: number | null;
  isDemo: boolean;
}

export interface CopilotRequest {
  question: string;
  context?: Record<string, string>;
}

export interface DataStatus {
  connected: boolean;
  mode: "MOCK" | "LIVE";
  lastSync: string;
  recordCount: number;
  demandLineCount: number;
  source: string;
}

export interface PipelineStatus {
  lastImportAt: string;
  status: "IDLE" | "RUNNING" | "SUCCESS" | "FAILED";
  rowsImported: number;
  rowsCleaned: number;
  rowsExcluded: number;
  demandLinesReconstructed: number;
  openLines: number;
  closedLines: number;
  linesNeedingReview: number;
  lastProcessingSeconds: number;
  log: { at: string; level: "INFO" | "WARN" | "ERROR"; message: string }[];
}

export interface SearchResult {
  id: string;
  label: string;
  sublabel: string;
  entity: "CUSTOMER" | "PART" | "SALES_ORDER" | "DEMAND_LINE" | "PROJECT" | "DELIVERY" | "INVOICE";
  href: string;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface TransactionQuery {
  search?: string;
  project?: string;
  customerId?: string;
  partId?: string;
  status?: FulfillmentState | "ALL";
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

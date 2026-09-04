import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { demandLineQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote, EmptyState } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge, Tag } from "@/components/shared/Badges";
import { fmtDate, fmtMoney, fmtQty, titleCase } from "@/lib/format";
import type { DeliveryEvent, InvoiceEvent } from "@/types";

export const Route = createFileRoute("/transactions/$lineId")({
  loader: async ({ context, params }) => {
    const detail = await context.queryClient.ensureQueryData(demandLineQuery(params.lineId));
    if (!detail) throw notFound();
    return { lineId: params.lineId };
  },
  head: ({ params }) => ({
    meta: [
      { title: `Demand line ${params.lineId} — SCIIP` },
      {
        name: "description",
        content: `Reconstructed fulfillment timeline, deliveries and invoices for demand line ${params.lineId}.`,
      },
      { property: "og:title", content: `Demand line ${params.lineId} — SCIIP` },
      {
        property: "og:description",
        content: "Event-level fulfillment reconstruction with reasoning and evidence.",
      },
    ],
  }),
  component: DemandLineDetailPage,
});

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <p className="label-caps">{label}</p>
      <p className="mt-0.5 text-sm">{value}</p>
    </div>
  );
}

function DemandLineDetailPage() {
  const { lineId } = Route.useLoaderData();
  const { data } = useSuspenseQuery(demandLineQuery(lineId));
  if (!data) return <EmptyState message="Demand line not found." />;
  const { line, deliveries, invoices, timeline, explanation } = data;

  const dCols: Column<DeliveryEvent>[] = [
    { key: "doNo", header: "Delivery", cell: (d) => <span className="font-mono text-xs">{d.doNo}</span> },
    { key: "date", header: "Date", cell: (d) => fmtDate(d.date) },
    { key: "quantity", header: "Qty", align: "right", cell: (d) => fmtQty(d.quantity) },
    { key: "invoiceNo", header: "Invoice", cell: (d) => <span className="font-mono text-xs">{d.invoiceNo ?? "—"}</span> },
  ];

  const iCols: Column<InvoiceEvent>[] = [
    { key: "invoiceNo", header: "Invoice", cell: (i) => <span className="font-mono text-xs">{i.invoiceNo}</span> },
    { key: "date", header: "Date", cell: (i) => fmtDate(i.date) },
    { key: "quantity", header: "Qty", align: "right", cell: (i) => fmtQty(i.quantity) },
    { key: "amount", header: "Amount", align: "right", cell: (i) => fmtMoney(i.amount) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Demand line detail"
        title={line.lineId}
        description={`${line.customer} · ${line.partCode} — ${line.partDescription}`}
        actions={<StatusBadge status={line.status} />}
      />

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2" title="Line facts">
          <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-4">
            <Field
              label="Sales order"
              value={<span className="font-mono text-xs">{line.soNo}</span>}
            />
            <Field
              label="Customer"
              value={
                <Link
                  to="/customers/$customerId"
                  params={{ customerId: line.customerId }}
                  className="text-info hover:underline"
                >
                  {line.customer}
                </Link>
              }
            />
            <Field
              label="Part"
              value={
                <Link
                  to="/parts/$partId"
                  params={{ partId: line.partId }}
                  className="font-mono text-xs text-info hover:underline"
                >
                  {line.partCode}
                </Link>
              }
            />
            <Field label="Project" value={line.project} />
            <Field label="Ordered qty" value={fmtQty(line.originalQty)} />
            <Field label="Shipped qty" value={fmtQty(line.shippedQty)} />
            <Field label="Open qty" value={fmtQty(line.openQty)} />
            <Field label="Unit price" value={fmtMoney(line.unitPrice)} />
            <Field label="Invoiced qty" value={fmtQty(line.totalInvoicedQty)} />
            <Field label="Invoiced amount" value={fmtMoney(line.totalInvoicedAmount)} />
            <Field label="First ship" value={fmtDate(line.firstShipDate)} />
            <Field label="Last ship" value={fmtDate(line.lastShipDate)} />
            <Field label="Committed date" value={fmtDate(line.committedDeliveryDate)} />
            <Field label="Requested date" value={fmtDate(line.customerRequestedDate)} />
            <Field
              label="Lead time"
              value={line.leadTimeDays == null ? "—" : `${line.leadTimeDays} days`}
            />
            <Field label="Deliveries" value={fmtQty(line.numShipments)} />
          </div>
          {line.needsReview && (
            <p className="mt-4 rounded-md border border-critical/40 bg-critical/10 px-3 py-2 text-xs text-critical">
              Needs review — {line.reviewReason ?? "reconstruction ambiguity detected"}
            </p>
          )}
        </Panel>

        <Panel
          title="Why this state?"
          subtitle="Reconstruction reasoning produced by the state engine"
        >
          {explanation ? (
            <div className="space-y-3">
              <p className="text-sm">{explanation.summary}</p>
              <ol className="space-y-1.5 text-xs text-muted-foreground">
                {explanation.reasoning.map((r, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="font-mono text-info">{String(i + 1).padStart(2, "0")}</span>
                    <span>{r}</span>
                  </li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-1.5">
                {explanation.evidence.map((e) => (
                  <Tag key={`${e.entity}-${e.reference}`} variant="info">
                    {titleCase(e.entity)} {e.reference}
                  </Tag>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                Generated by {explanation.generatedBy}
                {explanation.confidence != null && ` · confidence ${explanation.confidence}%`}
              </p>
            </div>
          ) : (
            <EmptyState message="No explanation available." />
          )}
        </Panel>
      </div>

      <Panel title="Event timeline" subtitle="SAP events ordered as reconstructed">
        <ol className="relative space-y-4 border-l border-border pl-5">
          {timeline.map((e, i) => (
            <li key={`${e.reference}-${i}`} className="relative">
              <span className="absolute -left-[27px] top-1 size-2.5 rounded-full border border-border bg-primary" />
              <div className="flex flex-wrap items-baseline gap-2">
                <Tag
                  variant={
                    e.kind === "SALES_ORDER" ? "info" : e.kind === "DELIVERY" ? "warning" : "success"
                  }
                >
                  {titleCase(e.kind)}
                </Tag>
                <span className="font-mono text-xs">{e.reference}</span>
                <span className="text-xs text-muted-foreground">{fmtDate(e.date)}</span>
                {e.quantity != null && (
                  <span className="font-mono text-xs">{fmtQty(e.quantity)} units</span>
                )}
                {e.amount != null && (
                  <span className="font-mono text-xs">{fmtMoney(e.amount)}</span>
                )}
              </div>
              {e.note && <p className="mt-1 text-xs text-muted-foreground">{e.note}</p>}
            </li>
          ))}
        </ol>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Delivery events" bodyClassName="p-0">
          <DataTable columns={dCols} rows={deliveries} rowKey={(d) => d.doNo} empty="No deliveries recorded." />
        </Panel>
        <Panel title="Invoice events" bodyClassName="p-0">
          <DataTable columns={iCols} rows={invoices} rowKey={(i) => i.invoiceNo} empty="No invoices recorded." />
        </Panel>
      </div>

      <BackendNote>
        `getDemandLine(lineId)` returns line facts, events, timeline and explanation in one payload —
        the Python explainer replaces the `explanation` field only.
      </BackendNote>
    </>
  );
}

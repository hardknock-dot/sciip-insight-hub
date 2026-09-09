import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { transactionsQuery } from "@/services/queries";
import { PageHeader, Panel, BackendNote } from "@/components/shared/Panel";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { StatusBadge } from "@/components/shared/Badges";
import { fmtDate, fmtMoney, fmtQty } from "@/lib/format";
import type { DemandLine, FulfillmentState, TransactionQuery } from "@/types";

export const Route = createFileRoute("/transactions/")({
  head: () => ({
    meta: [
      { title: "Transaction Explorer — SCIIP" },
      {
        name: "description",
        content:
          "Explore reconstructed sales orders, demand lines, deliveries and invoices with filters on project, status and date.",
      },
      { property: "og:title", content: "Transaction Explorer — SCIIP" },
      {
        property: "og:description",
        content: "Filter and drill into every demand line reconstructed from SAP events.",
      },
    ],
  }),
  component: TransactionExplorer,
});

const STATUSES: (FulfillmentState | "ALL")[] = [
  "ALL",
  "OPEN",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
  "NEEDS_REVIEW",
];

function TransactionExplorer() {
  const navigate = useNavigate();
  const [query, setQuery] = useState<TransactionQuery>({
    page: 1,
    pageSize: 25,
    sortBy: "openQty",
    sortDir: "desc",
    status: "ALL",
  });
  const { data, isFetching } = useQuery(transactionsQuery(query));

  const patch = (p: Partial<TransactionQuery>) => setQuery((q) => ({ ...q, page: 1, ...p }));
  const sort = (key: string) =>
    setQuery((q) => ({
      ...q,
      sortBy: key,
      sortDir: q.sortBy === key && q.sortDir === "desc" ? "asc" : "desc",
    }));

  const cols: Column<DemandLine>[] = [
    { key: "lineId", header: "Line", sortable: true, cell: (l) => <span className="font-mono text-xs">{l.lineId}</span> },
    { key: "soNo", header: "Sales order", sortable: true, cell: (l) => <span className="font-mono text-xs">{l.soNo}</span> },
    { key: "customer", header: "Customer", sortable: true, cell: (l) => l.customer },
    { key: "partCode", header: "Part", sortable: true, cell: (l) => <span className="font-mono text-xs">{l.partCode}</span> },
    { key: "project", header: "Project", cell: (l) => l.project },
    { key: "originalQty", header: "Ordered", align: "right", sortable: true, cell: (l) => fmtQty(l.originalQty) },
    { key: "shippedQty", header: "Shipped", align: "right", sortable: true, cell: (l) => fmtQty(l.shippedQty) },
    { key: "openQty", header: "Open", align: "right", sortable: true, cell: (l) => fmtQty(l.openQty) },
    { key: "numShipments", header: "Deliveries", align: "right", cell: (l) => fmtQty(l.numShipments) },
    { key: "totalInvoicedAmount", header: "Invoiced", align: "right", sortable: true, cell: (l) => fmtMoney(l.totalInvoicedAmount, { compact: true }) },
    { key: "lastShipDate", header: "Last ship", align: "right", cell: (l) => fmtDate(l.lastShipDate) },
    { key: "status", header: "State", cell: (l) => <StatusBadge status={l.status} /> },
  ];

  const total = data?.total ?? 0;
  const pageSize = query.pageSize ?? 25;
  const page = query.page ?? 1;
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <>
      <PageHeader
        eyebrow="Transaction state engine"
        title="Transaction Explorer"
        description="One row per demand line — the reconstructed link between a sales order line, its delivery events and its invoice events."
      />

      <Panel bodyClassName="p-3">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="label-caps">Search</span>
            <input
              value={query.search ?? ""}
              onChange={(e) => patch({ search: e.target.value })}
              placeholder="Line, order, customer, part…"
              className="h-9 w-64 rounded-md border border-input bg-surface px-3 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">State</span>
            <select
              value={query.status ?? "ALL"}
              onChange={(e) => patch({ status: e.target.value as FulfillmentState | "ALL" })}
              className="h-9 rounded-md border border-input bg-surface px-2 text-sm outline-none focus:border-ring"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">Order date from</span>
            <input
              type="date"
              value={query.dateFrom ?? ""}
              onChange={(e) => patch({ dateFrom: e.target.value })}
              className="h-9 rounded-md border border-input bg-surface px-2 text-sm outline-none focus:border-ring"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="label-caps">to</span>
            <input
              type="date"
              value={query.dateTo ?? ""}
              onChange={(e) => patch({ dateTo: e.target.value })}
              className="h-9 rounded-md border border-input bg-surface px-2 text-sm outline-none focus:border-ring"
            />
          </label>
          <span className="ml-auto text-xs text-muted-foreground">
            {isFetching ? "Loading…" : `${fmtQty(total)} demand lines`}
          </span>
        </div>
      </Panel>

      <Panel bodyClassName="p-0">
        <DataTable
          columns={cols}
          rows={data?.items ?? []}
          rowKey={(l) => l.lineId}
          sortBy={query.sortBy ?? "lineId"}
          sortDir={query.sortDir ?? "desc"}

          onSort={sort}
          onRowClick={(l) => void navigate({ to: "/transactions/$lineId", params: { lineId: l.lineId } })}
        />
        <div className="flex items-center justify-between gap-3 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span>
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setQuery((q) => ({ ...q, page: Math.max(1, (q.page ?? 1) - 1) }))}
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={page >= pages}
              onClick={() => setQuery((q) => ({ ...q, page: (q.page ?? 1) + 1 }))}
              className="rounded border border-border px-2 py-1 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </Panel>

      <BackendNote>
        Filters, sorting and pagination are passed as a single `TransactionQuery` to
        `getTransactions()` — swap that service body for a FastAPI call and this screen keeps
        working unchanged.
      </BackendNote>
    </>
  );
}

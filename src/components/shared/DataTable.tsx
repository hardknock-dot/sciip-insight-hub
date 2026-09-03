import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./Panel";

export interface Column<T> {
  key: string;
  header: string;
  align?: "left" | "right";
  className?: string;
  cell: (row: T) => ReactNode;
  sortable?: boolean;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  empty = "No records match the current filters.",
  sortBy,
  sortDir,
  onSort,
}: {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  empty?: string;
  sortBy?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
}) {
  if (rows.length === 0) return <EmptyState message={empty} />;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((c) => (
              <th
                key={c.key}
                onClick={c.sortable && onSort ? () => onSort(c.key) : undefined}
                className={cn(
                  "label-caps px-3 py-2 text-left",
                  c.align === "right" && "text-right",
                  c.sortable && onSort && "cursor-pointer select-none hover:text-foreground",
                )}
              >
                {c.header}
                {sortBy === c.key && <span className="ml-1">{sortDir === "asc" ? "▲" : "▼"}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                "row-hover border-b border-border/60 last:border-0",
                onRowClick && "cursor-pointer",
              )}
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={cn(
                    "px-3 py-2 align-middle",
                    c.align === "right" && "text-right font-mono",
                    c.className,
                  )}
                >
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

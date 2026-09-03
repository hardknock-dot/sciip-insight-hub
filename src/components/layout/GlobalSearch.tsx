import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { searchQuery } from "@/services/queries";

export function GlobalSearch() {
  const [term, setTerm] = useState("");
  const navigate = useNavigate();
  const { data } = useQuery({ ...searchQuery(term), enabled: term.trim().length > 1 });
  const results = data ?? [];

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Search customers, parts, orders, demand lines…"
        className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-3 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
      />
      {term.trim().length > 1 && (
        <div className="absolute left-0 right-0 top-11 z-40 max-h-80 overflow-y-auto rounded-md border border-border bg-popover p-1 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-2 text-xs text-muted-foreground">No matches.</p>
          ) : (
            results.map((r) => (
              <button
                key={`${r.entity}-${r.id}`}
                onClick={() => {
                  setTerm("");
                  void navigate({ to: r.href });
                }}
                className="flex w-full items-baseline justify-between gap-3 rounded px-3 py-1.5 text-left text-sm hover:bg-surface-raised"
              >
                <span className="font-medium">{r.label}</span>
                <span className="truncate text-xs text-muted-foreground">{r.sublabel}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

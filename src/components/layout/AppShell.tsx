import { Link, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  Activity,
  Boxes,
  Building2,
  Cpu,
  Factory,
  LayoutDashboard,
  LineChart,
  MessageSquareCode,
  Package,
  Settings,
  Sparkles,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { dataStatusQuery } from "@/services/queries";
import { GlobalSearch } from "./GlobalSearch";

const NAV: { group: string; items: { to: string; label: string; icon: typeof Activity }[] }[] = [
  {
    group: "Knowledge",
    items: [
      { to: "/", label: "Command Center", icon: LayoutDashboard },
      { to: "/transactions", label: "Transactions", icon: Table2 },
      { to: "/customers", label: "Customers", icon: Building2 },
      { to: "/parts", label: "Parts", icon: Package },
    ],
  },
  {
    group: "Intelligence",
    items: [
      { to: "/demand", label: "Demand", icon: Activity },
      { to: "/forecast", label: "Forecast", icon: LineChart },
      { to: "/inventory", label: "Inventory", icon: Boxes },
      { to: "/sales-intelligence", label: "Sales Intelligence", icon: Sparkles },
      { to: "/management", label: "Management", icon: Factory },
    ],
  },
  {
    group: "System",
    items: [
      { to: "/copilot", label: "AI Copilot", icon: MessageSquareCode },
      { to: "/pipeline", label: "Data Pipeline", icon: Cpu },
      { to: "/settings", label: "Settings", icon: Settings },
    ],
  },
];

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data: status } = useQuery(dataStatusQuery);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-4">
          <div className="grid size-8 place-items-center rounded-md bg-primary/15 text-primary">
            <Cpu className="size-4" />
          </div>
          <div>
            <p className="text-sm font-semibold leading-tight tracking-tight">SCIIP</p>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Supply chain intelligence
            </p>
          </div>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {NAV.map((section) => (
            <div key={section.group} className="mb-5">
              <p className="label-caps px-2 pb-1.5">{section.group}</p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item.to);
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.to}
                        className={cn(
                          "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] font-medium transition-colors",
                          active
                            ? "bg-primary/12 text-primary"
                            : "text-muted-foreground hover:bg-surface-raised hover:text-foreground",
                        )}
                      >
                        <item.icon className="size-4 shrink-0" />
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-border px-4 py-3 text-[11px] text-muted-foreground">
          <p className="flex items-center gap-1.5">
            <span
              className={cn(
                "size-1.5 rounded-full",
                status?.mode === "LIVE" ? "bg-success" : "bg-warning",
              )}
            />
            {status ? `${status.mode} data · ${status.source}` : "Connecting…"}
          </p>
          <p className="mt-1">SAP sales register → state engine</p>
        </div>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex flex-wrap items-center gap-3 border-b border-border bg-background/85 px-4 py-3 backdrop-blur">
          <nav className="flex gap-1 overflow-x-auto lg:hidden">
            {NAV.flatMap((s) => s.items).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded px-2 py-1 text-xs whitespace-nowrap",
                  isActive(pathname, item.to)
                    ? "bg-primary/12 text-primary"
                    : "text-muted-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto w-full max-w-md">
            <GlobalSearch />
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1600px] space-y-5 px-4 py-5">{children}</main>
      </div>
    </div>
  );
}

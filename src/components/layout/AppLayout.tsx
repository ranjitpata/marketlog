import { NavLink, Outlet, useLocation } from "react-router-dom";
import { House, CalendarDays, Package, Settings2, ScanBarcode } from "lucide-react";
import { cn } from "@/lib/utils";
import SyncStatusBadge from "./SyncStatusBadge";
import StatusBanner from "./StatusBanner";

const NAV = [
  { to: "/", label: "Home", icon: House, match: (p: string) => p === "/" },
  { to: "/events", label: "Events", icon: CalendarDays, match: (p: string) => p.startsWith("/events") },
  { to: "/sale", label: "Sell", icon: ScanBarcode, match: (p: string) => p.startsWith("/sale"), center: true },
  { to: "/products", label: "Products", icon: Package, match: (p: string) => p.startsWith("/products") },
  { to: "/settings", label: "Settings", icon: Settings2, match: (p: string) => p.startsWith("/settings") },
];

function titleFor(pathname: string): string {
  if (pathname === "/") return "MarketLog";
  if (pathname.startsWith("/events/new")) return "New event";
  if (pathname === "/events" || pathname.startsWith("/events/")) {
    return pathname === "/events" ? "Events" : "Event details";
  }
  if (pathname.startsWith("/sale")) return "Quick Sale";
  if (pathname.startsWith("/products/new")) return "New product";
  if (pathname.startsWith("/products")) return "Product";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/login")) return "Sign in";
  return "MarketLog";
}

export default function AppLayout() {
  const { pathname } = useLocation();

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="sticky top-0 z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
        <div className="mx-auto flex h-14 max-w-2xl items-center justify-between px-4">
          <h1 className="truncate text-base font-semibold tracking-tight">{titleFor(pathname)}</h1>
          <SyncStatusBadge />
        </div>
      </header>

      <StatusBanner />

      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-28">
        <Outlet />
      </main>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t bg-background/95 backdrop-blur pb-safe"
      >
        <div className="mx-auto flex max-w-2xl items-stretch justify-around px-2 pt-1.5 pb-1.5">
          {NAV.map((item) => {
            const active = item.match(pathname);
            const Icon = item.icon;
            if (item.center) {
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  aria-label={item.label}
                  className={cn(
                    "flex h-12 w-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95",
                    active && "ring-2 ring-ring ring-offset-2 ring-offset-background",
                  )}
                >
                  <Icon className="h-6 w-6" />
                </NavLink>
              );
            }
            return (
              <NavLink
                key={item.to}
                to={item.to}
                aria-label={item.label}
                className={cn(
                  "flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1.5 text-muted-foreground transition-colors",
                  active && "text-foreground",
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.4 : 1.8} />
                <span className={cn("text-[10px] font-medium", active && "font-semibold")}>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

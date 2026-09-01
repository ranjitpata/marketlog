import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useState } from "react";
import { CalendarX2, CheckCircle2, MapPin, MoreVertical, Pencil, RotateCcw, ShoppingCart } from "lucide-react";
import { useEventData } from "@/hooks/useEventData";
import { useEvents } from "@/hooks/useEvents";
import EmptyState from "@/components/shared/EmptyState";
import ConfirmDialog from "@/components/shared/ConfirmDialog";
import EventOverview from "@/features/events/EventOverview";
import EventSalesTab from "@/features/events/EventSalesTab";
import EventInventoryTab from "@/features/events/EventInventoryTab";
import EventExpensesTab from "@/features/events/EventExpensesTab";
import EventAnalyticsTab from "@/features/events/EventAnalyticsTab";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { markEventCompleted, reopenEvent, softDeleteEvent } from "@/lib/repositories/eventRepository";
import { formatDateMedium, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = ["overview", "sales", "inventory", "expenses", "analytics"] as const;
type Tab = (typeof TABS)[number];

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const events = useEvents();
  const tabParam = params.get("tab") as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : "overview";

  const { event, inventory, sales, saleItems, expenses, summary, totalBrought, totalSold, sellThrough, loading } = useEventData(id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!loading && !event) {
    return (
      <EmptyState
        icon={CalendarX2}
        title="Event not found"
        description="It may have been removed."
        action={<Button onClick={() => navigate("/events")}>Back to events</Button>}
      />
    );
  }

  const effective = events.find((e) => e.id === id)?.effective ?? "upcoming";
  const completed = effective === "completed";

  function setTab(next: Tab) {
    setParams(next === "overview" ? {} : { tab: next }, { replace: true });
  }

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold">{event?.name ?? "…"}</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {event && (event.start_date === event.end_date
                ? formatDateMedium(event.start_date)
                : `${formatDateMedium(event.start_date)} – ${formatDateMedium(event.end_date)}`)}
            </p>
            {event?.location && (
              <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="h-3 w-3" /> {event.location}
              </p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {completed ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] font-semibold text-muted-foreground">
                <CheckCircle2 className="h-3 w-3" /> Finished
              </span>
            ) : effective === "ongoing" ? (
              <span className="rounded-full bg-primary px-2.5 py-1 text-[10px] font-bold text-primary-foreground">LIVE</span>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Event actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => navigate(`/events/${id}/edit`)}>
                  <Pencil className="h-4 w-4" /> Edit event
                </DropdownMenuItem>
                {completed ? (
                  <DropdownMenuItem onClick={() => void reopenEvent(id!).then(() => toast.success("Event reopened"))}>
                    <RotateCcw className="h-4 w-4" /> Reopen event
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    onClick={() =>
                      void markEventCompleted(id!).then(() =>
                        toast.success("Event wrapped up", {
                          description: "Leftover stock is back in your available count.",
                        }),
                      )
                    }
                  >
                    <CheckCircle2 className="h-4 w-4" /> Mark completed
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                  <CalendarX2 className="h-4 w-4" /> Delete event
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Quick numbers strip */}
        <div className="mt-3 grid grid-cols-3 divide-x rounded-lg bg-muted/60 py-2 text-center">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Revenue</p>
            <p className="tabular text-sm font-bold">{formatMoney(summary.revenue)}</p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Profit</p>
            <p
              className={cn(
                "tabular text-sm font-bold",
                summary.profit > 0 ? "text-emerald-600 dark:text-emerald-400" : summary.profit < 0 ? "text-destructive" : "",
              )}
            >
              {formatMoney(summary.profit)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">Sales</p>
            <p className="tabular text-sm font-bold">{sales.length}</p>
          </div>
        </div>

        {!completed && (
          <Button asChild className="mt-3 w-full" size="lg">
            <Link to={`/sale?event=${id}`}>
              <ShoppingCart className="h-4 w-4" /> Record a sale
            </Link>
          </Button>
        )}
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="sales">Sales</TabsTrigger>
          <TabsTrigger value="inventory">Stock</TabsTrigger>
          <TabsTrigger value="expenses">Costs</TabsTrigger>
          <TabsTrigger value="analytics">Stats</TabsTrigger>
        </TabsList>
      </Tabs>

      {tab === "overview" && (
        <EventOverview
          eventId={id!}
          completed={completed}
          boothFee={event?.booth_fee ?? 0}
          data={{ inventory, saleItems, expenses, summary, totalBrought, totalSold, sellThrough }}
        />
      )}
      {tab === "sales" && <EventSalesTab eventId={id!} completed={completed} />}
      {tab === "inventory" && <EventInventoryTab eventId={id!} completed={completed} />}
      {tab === "expenses" && <EventExpensesTab eventId={id!} />}
      {tab === "analytics" && <EventAnalyticsTab eventId={id!} />}

      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Delete ${event?.name}?`}
        description="The event and its prep list are removed. Your products and their stock counts stay safe."
        confirmLabel="Delete event"
        destructive
        onConfirm={async () => {
          await softDeleteEvent(id!);
          setConfirmDelete(false);
          toast.success("Event deleted");
          navigate("/events");
        }}
      />
    </div>
  );
}

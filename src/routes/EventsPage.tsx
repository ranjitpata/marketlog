import { Link, useNavigate } from "react-router-dom";
import { CalendarPlus, ChevronRight, MapPin } from "lucide-react";
import { useEvents, type EventWithStatus } from "@/hooks/useEvents";
import EmptyState from "@/components/shared/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDateMedium, formatMoney, relativeDay } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function EventsPage() {
  const events = useEvents();

  const happening = events.filter((e) => e.effective === "ongoing");
  const upcoming = events.filter((e) => e.effective === "upcoming");
  const past = events.filter((e) => e.effective === "completed");

  return (
    <div className="space-y-6">
      <Button asChild className="w-full">
        <Link to="/events/new">
          <CalendarPlus className="h-4 w-4" /> New event
        </Link>
      </Button>

      {events.length === 0 && (
        <EmptyState
          icon={CalendarPlus}
          title="No events yet"
          description="Create your first market or fair to start tracking what you sell and earn."
          action={
            <Button asChild>
              <Link to="/events/new">Create an event</Link>
            </Button>
          }
        />
      )}

      {happening.length > 0 && <Section title="Happening now" events={happening} highlight />}
      {upcoming.length > 0 && <Section title="Upcoming" events={upcoming} />}
      {past.length > 0 && <Section title="Finished" events={past} />}
    </div>
  );
}

function Section({ title, events, highlight }: { title: string; events: EventWithStatus[]; highlight?: boolean }) {
  return (
    <section className="space-y-2">
      <h2 className={cn("text-sm font-semibold uppercase tracking-wide", highlight ? "text-primary" : "text-muted-foreground")}>
        {title}
      </h2>
      <ul className="space-y-2">
        {events.map((e) => (
          <EventCard key={e.id} event={e} highlight={highlight} />
        ))}
      </ul>
    </section>
  );
}

function EventCard({ event, highlight }: { event: EventWithStatus; highlight?: boolean }) {
  const navigate = useNavigate();
  const multiDay = event.start_date !== event.end_date;

  return (
    <li>
      <button
        onClick={() => navigate(`/events/${event.id}`)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-card p-3.5 text-left shadow-sm transition-colors hover:bg-accent/50 active:bg-accent",
          highlight && "border-primary/40",
        )}
      >
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg",
            event.effective === "completed" ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary",
          )}
        >
          <span className="tabular text-sm font-bold">{event.start_date.slice(8, 10)}</span>
          <span className="text-[9px] font-medium uppercase">
            {new Intl.DateTimeFormat(undefined, { month: "short" }).format(new Date(event.start_date + "T00:00"))}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{event.name}</p>
          <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
            <span>{multiDay ? `${formatDateMedium(event.start_date)} – ${formatDateMedium(event.end_date)}` : formatDateMedium(event.start_date)}</span>
            {event.location && (
              <span className="inline-flex items-center gap-0.5 truncate">
                <MapPin className="h-3 w-3" /> {event.location}
              </span>
            )}
          </div>
          {event.booth_fee > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground">Booth fee {formatMoney(event.booth_fee)}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1">
          {event.effective === "ongoing" && (
            <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">LIVE</span>
          )}
          {event.effective === "upcoming" && (
            <span className="text-[11px] text-muted-foreground">{relativeDay(event.start_date)}</span>
          )}
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      </button>
    </li>
  );
}

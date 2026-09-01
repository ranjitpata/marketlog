import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import MoneyInput from "@/components/shared/MoneyInput";
import { createEvent, updateEvent } from "@/lib/repositories/eventRepository";
import { todayStr } from "@/lib/format";
import { db } from "@/lib/db/dexie";
import { useEffect } from "react";
import type { MarketEvent } from "@/types";

interface Props {
  eventId?: string;
}

export default function EventForm({ eventId }: Props) {
  const navigate = useNavigate();
  const [event, setEvent] = useState<MarketEvent | undefined>(undefined);
  const editing = Boolean(eventId);

  useEffect(() => {
    if (!eventId) return;
    void db.events.get(eventId).then(setEvent);
  }, [eventId]);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [startDate, setStartDate] = useState(todayStr());
  const [endDate, setEndDate] = useState(todayStr());
  const [boothFee, setBoothFee] = useState(0);
  const [notes, setNotes] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (event && !hydrated) {
      setName(event.name);
      setLocation(event.location ?? "");
      setStartDate(event.start_date);
      setEndDate(event.end_date);
      setBoothFee(event.booth_fee);
      setNotes(event.notes ?? "");
      setHydrated(true);
    }
  }, [event, hydrated]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your event a name.");
      return;
    }
    if (endDate < startDate) {
      setError("The end date can't be before the start date.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: trimmed,
        location: location.trim() || null,
        start_date: startDate,
        end_date: endDate,
        booth_fee: Math.max(0, boothFee),
        notes: notes.trim() || null,
      };
      if (editing && eventId) {
        const updated = await updateEvent(eventId, payload);
        if (updated) {
          // Editing a completed event's dates doesn't reopen it.
          toast.success("Event updated", { description: "Saved on this device." });
        }
        navigate(`/events/${eventId}`);
      } else {
        const created = await createEvent(payload);
        toast.success("Event created", {
          description: "Next: choose how much stock to bring.",
        });
        navigate(`/events/${created.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong saving the event.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5" noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="e-name">Event name</Label>
        <Input
          id="e-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Riverside Craft Market"
          required
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="e-loc">Where (optional)</Label>
        <Input id="e-loc" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Riverside Park, Booth 12" />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="e-start">Starts</Label>
          <Input id="e-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="e-end">Ends</Label>
          <Input id="e-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="e-fee">Booth / stall fee</Label>
        <MoneyInput id="e-fee" value={boothFee} onChange={setBoothFee} placeholder="45.00" />
        <p className="text-xs text-muted-foreground">
          Counted once in this event's costs — no need to add it again under expenses.
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="e-notes">Notes (optional)</Label>
        <Textarea id="e-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Setup time, parking, contact…" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex gap-3">
        <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(-1)}>
          Cancel
        </Button>
        <Button type="submit" className="flex-1" disabled={saving}>
          {saving ? "Saving…" : editing ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
}

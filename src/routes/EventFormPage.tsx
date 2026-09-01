import { useParams } from "react-router-dom";
import EventForm from "@/features/events/EventForm";

export default function EventFormPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="mx-auto max-w-md">
      <EventForm eventId={id} />
    </div>
  );
}

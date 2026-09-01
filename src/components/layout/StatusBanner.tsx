import { CloudOff, LifeBuoy, CloudAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useSyncStore } from "@/stores/syncStore";

/**
 * Contextual banner under the header. Copy is plain-language per guidelines —
 * never "IndexedDB write" or "sync operation failed".
 */
export default function StatusBanner() {
  const { status, queueCount, message } = useSyncStore();

  if (status === "offline" && queueCount > 0) {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/10">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <CloudOff className="h-3.5 w-3.5 shrink-0" />
          <p>
            You're offline. Your {queueCount === 1 ? "change is" : `${queueCount} changes are`} saved on this device
            and will sync when you're back online.
          </p>
        </div>
      </div>
    );
  }

  if (status === "session") {
    return (
      <div className="border-b border-amber-500/20 bg-amber-500/10">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-1.5 text-xs text-amber-800 dark:text-amber-300">
          <LifeBuoy className="h-3.5 w-3.5 shrink-0" />
          <p className="flex-1">{message ?? "Your session needs refreshing to sync — your data is safe on this device."}</p>
          <Link to="/login" className="shrink-0 font-semibold underline underline-offset-2">
            Refresh
          </Link>
        </div>
      </div>
    );
  }

  if (status === "error" && message) {
    return (
      <div className="border-b border-destructive/20 bg-destructive/5">
        <div className="mx-auto flex max-w-2xl items-center gap-2 px-4 py-1.5 text-xs text-destructive">
          <CloudAlert className="h-3.5 w-3.5 shrink-0" />
          <p className="flex-1">{message}</p>
          <Link to="/settings" className="shrink-0 font-semibold underline underline-offset-2">
            Retry
          </Link>
        </div>
      </div>
    );
  }

  return null;
}

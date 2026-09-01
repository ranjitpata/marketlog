import { CloudOff, CloudCheck, RefreshCw, CloudAlert, LifeBuoy, HardDrive } from "lucide-react";
import { useSyncStore } from "@/stores/syncStore";
import { cn } from "@/lib/utils";

/**
 * The sync badge — the only place sync state intrudes on the UI.
 * States: Synced / Offline — N changes waiting / Syncing… / Sync issue — Retry /
 * Session needs refreshing / On this device (local-only).
 */
export default function SyncStatusBadge() {
  const { status, queueCount } = useSyncStore();

  const config = (() => {
    switch (status) {
      case "synced":
        return { icon: CloudCheck, text: "Backed up", className: "bg-primary/10 text-primary", to: null };
      case "syncing":
        return { icon: RefreshCw, text: "Saving…", className: "bg-muted text-muted-foreground", to: null, spin: true };
      case "offline":
        return {
          icon: CloudOff,
          text: queueCount > 0 ? `Offline · ${queueCount}` : "Offline",
          className: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
          to: "/settings",
        };
      case "error":
        return { icon: CloudAlert, text: "Retry sync", className: "bg-destructive/10 text-destructive", to: "/settings" };
      case "session":
        return { icon: LifeBuoy, text: "Session", className: "bg-amber-500/15 text-amber-700 dark:text-amber-400", to: "/login" };
      default:
        return { icon: HardDrive, text: "This device", className: "bg-muted text-muted-foreground", to: "/settings" };
    }
  })();

  const Icon = config.icon;
  const content = (
    <>
      <Icon className={cn("h-3.5 w-3.5", config.spin && "animate-spin")} />
      <span className="text-[11px] font-medium">{config.text}</span>
    </>
  );

  if (config.to) {
    return (
      <a
        href={config.to}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition-opacity active:opacity-70",
          config.className,
        )}
      >
        {content}
      </a>
    );
  }
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1", config.className)}>{content}</span>;
}

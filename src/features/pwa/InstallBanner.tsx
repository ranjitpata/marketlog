import { useState } from "react";
import { Share, PlusSquare, X, Smartphone, Download } from "lucide-react";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

/**
 * Browser-installable prompts:
 *  - Chrome/Edge/Android → beforeinstallprompt captured; we offer our own button
 *    (more reliable mid-setup than the browser's mini-infobar).
 *  - iOS Safari → no prompt API exists; explicit Add-to-Home-Screen walkthrough.
 *  - Already installed → nothing.
 */
export default function InstallBanner() {
  const { platform, canPrompt, installed, promptInstall } = useInstallPrompt();
  const [dismissed, setDismissed] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);

  if (installed || platform === "installed" || dismissed) return null;

  const showChrome = platform === "chrome-like";
  const showIos = platform === "ios-safari";

  if (!showChrome && !showIos) return null;
  // On Chrome we only show once the browser confirms installability.
  if (showChrome && !canPrompt) return null;

  return (
    <>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
          <Smartphone className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Install MarketLog</p>
          <p className="text-xs text-muted-foreground">Full-screen, works offline, opens in one tap.</p>
        </div>
        <Button
          size="sm"
          onClick={() => {
            if (showIos) setIosOpen(true);
            else void promptInstall();
          }}
        >
          <Download className="h-4 w-4" /> Install
        </Button>
        <button
          onClick={() => setDismissed(true)}
          aria-label="Dismiss"
          className="shrink-0 rounded-full p-1 text-muted-foreground hover:bg-accent"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />
    </>
  );
}

export function IosInstallDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Add MarketLog to your Home Screen</DialogTitle>
          <DialogDescription>Safari doesn't offer a direct install button — it takes three taps, once:</DialogDescription>
        </DialogHeader>
        <ol className="space-y-3">
          <li className="flex items-center gap-3 rounded-xl border p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">1</span>
            <div className="flex flex-1 items-center gap-2">
              <p className="text-sm">
                Tap the <span className="font-semibold">Share</span> button in Safari's toolbar
              </p>
              <Share className="ml-auto h-5 w-5 shrink-0 text-primary" />
            </div>
          </li>
          <li className="flex items-center gap-3 rounded-xl border p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">2</span>
            <div className="flex flex-1 items-center gap-2">
              <p className="text-sm">
                Scroll and tap <span className="font-semibold">Add to Home Screen</span>
              </p>
              <PlusSquare className="ml-auto h-5 w-5 shrink-0 text-primary" />
            </div>
          </li>
          <li className="flex items-center gap-3 rounded-xl border p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">3</span>
            <p className="text-sm">
              Confirm with <span className="font-semibold">Add</span> — MarketLog will open full-screen, even offline
            </p>
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          Your data lives on this device, so it will all be there when you open it from your Home Screen.
        </p>
        <Button className="w-full" onClick={() => onOpenChange(false)}>
          Got it
        </Button>
      </DialogContent>
    </Dialog>
  );
}

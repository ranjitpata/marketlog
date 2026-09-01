import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { CloudOff, Database, Download, LogOut, Moon, RefreshCw, Smartphone, Sun, UserRound } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSyncStore } from "@/stores/syncStore";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db/dexie";
import { supabaseConfigured } from "@/lib/supabase/client";
import { syncEngine } from "@/lib/sync/syncEngine";
import { useInstallPrompt } from "@/hooks/useInstallPrompt";
import { IosInstallDialog } from "@/features/pwa/InstallBanner";
import { updateProfile } from "@/lib/repositories/profileRepository";
import { getProfile } from "@/lib/repositories/profileRepository";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { formatDateTime } from "@/lib/format";

export default function SettingsPage() {
  const navigate = useNavigate();
  const { userId, mode, email, signOut } = useAuthStore();
  const sync = useSyncStore();
  const { platform, canPrompt, installed, promptInstall } = useInstallPrompt();
  const [iosOpen, setIosOpen] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);

  const profile = useLiveQuery(async () => (userId ? getProfile(userId) : undefined), [userId]);

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name ?? "");
      setBusinessName(profile.business_name ?? "");
    }
  }, [profile]);

  const queuePreview = useLiveQuery(
    async () => (userId ? db.syncQueue.where("user_id").equals(userId).filter((e) => e.status !== "done").count() : 0),
    [userId],
    0,
  );

  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    window.localStorage.setItem("marketlog.theme", next ? "dark" : "light");
  }

  async function saveProfile() {
    if (!userId) return;
    setSavingProfile(true);
    try {
      await updateProfile(
        { display_name: displayName.trim() || "You", business_name: businessName.trim() || null },
        userId,
      );
      toast.success("Profile saved", { description: "Saved on this device." });
    } catch {
      toast.error("Couldn't save your profile.");
    } finally {
      setSavingProfile(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Profile */}
      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-primary" /> Your details
        </h3>
        <div className="space-y-1.5">
          <Label htmlFor="s-name">Display name</Label>
          <Input id="s-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Your name" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="s-biz">Business name (optional)</Label>
          <Input id="s-biz" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Willow & Wax Co." />
        </div>
        <Button size="sm" onClick={saveProfile} disabled={savingProfile}>
          {savingProfile ? "Saving…" : "Save"}
        </Button>
      </section>

      {/* Cloud & sync */}
      <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Database className="h-4 w-4 text-primary" /> Backup & sync
        </h3>

        {!supabaseConfigured ? (
          <>
            <p className="text-sm text-muted-foreground">
              This copy of MarketLog runs <span className="font-medium text-foreground">on this device only</span>. Everything
              you enter is stored safely here and works fully offline.
            </p>
            <p className="text-xs text-muted-foreground">
              To add automatic cloud backup across devices, configure your Supabase project keys
              (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY) when building the app.
            </p>
          </>
        ) : mode === "supabase" ? (
          <>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Signed in as</span>
              <span className="font-medium">{email ?? "cloud account"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Last synced</span>
              <span className="font-medium">{sync.lastSyncAt ? formatDateTime(new Date(sync.lastSyncAt).toISOString()) : "never"}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Waiting to sync</span>
              <span className="tabular font-medium">{queuePreview}</span>
            </div>
            <Button variant="outline" size="sm" className="w-full" onClick={() => syncEngine.requestRetry()}>
              <RefreshCw className="h-4 w-4" /> Retry sync now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-destructive"
              onClick={async () => {
                await signOut();
                toast.success("Signed out", { description: "Your data stays safe on this device." });
                navigate("/login");
              }}
            >
              <LogOut className="h-4 w-4" /> Sign out
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Cloud backup is available — sign in to sync this device's data to your account.
            </p>
            <Button asChild size="sm" className="w-full">
              <a href="/login">Sign in</a>
            </Button>
          </>
        )}

        {sync.status === "session" && (
          <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
            Your session needs refreshing to sync — your data is safe on this device.{" "}
            <a href="/login" className="font-semibold underline">
              Refresh now
            </a>
          </p>
        )}
        {sync.status === "error" && (
          <p className="flex items-center gap-1.5 rounded-lg bg-destructive/10 p-2.5 text-xs text-destructive">
            <CloudOff className="h-3.5 w-3.5" /> {sync.message ?? "Sync issue — your data is safe."}
          </p>
        )}
      </section>

      <Separator />

      {/* Appearance */}
      <section className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          {dark ? <Moon className="h-4 w-4 text-primary" /> : <Sun className="h-4 w-4 text-primary" />}
          <div>
            <p className="text-sm font-semibold">Dark mode</p>
            <p className="text-xs text-muted-foreground">Easier on the eyes at early markets.</p>
          </div>
        </div>
        <button
          role="switch"
          aria-checked={dark}
          onClick={toggleTheme}
          className={"relative h-7 w-12 rounded-full transition-colors " + (dark ? "bg-primary" : "bg-muted")}
        >
          <span
            className={"absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all " + (dark ? "left-[22px]" : "left-0.5")}
          />
        </button>
      </section>

      {/* Install */}
      <section className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm">
        <div className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          <div>
            <p className="text-sm font-semibold">Install as an app</p>
            <p className="text-xs text-muted-foreground">
              {installed || platform === "installed"
                ? "MarketLog is installed on this device."
                : platform === "ios-safari"
                  ? "Add it to your Home Screen (3 taps)."
                  : "Full-screen and offline-ready."}
            </p>
          </div>
        </div>
        {!installed && platform !== "installed" && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (platform === "ios-safari") setIosOpen(true);
              else void promptInstall();
            }}
            disabled={platform === "chrome-like" && !canPrompt}
          >
            <Download className="h-4 w-4" /> Install
          </Button>
        )}
      </section>

      <IosInstallDialog open={iosOpen} onOpenChange={setIosOpen} />

      <Separator />

      {/* Data & privacy */}
      <section className="space-y-1.5 rounded-xl border bg-card p-4 text-xs text-muted-foreground shadow-sm">
        <p className="text-sm font-semibold text-foreground">Where your data lives</p>
        <p>
          MarketLog saves everything on this device first — that's why it keeps working with no signal at busy markets.
          If cloud backup is on, a synced copy is kept in your account and nothing is ever shared with anyone else.
        </p>
        <p>Version 1.0.0 · MarketLog</p>
      </section>
    </div>
  );
}

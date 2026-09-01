import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { HardDrive, LogIn, Sparkles } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { supabaseConfigured } from "@/lib/supabase/client";
import { resetPullState, pushProfileBootstrap } from "@/lib/sync/syncEngine";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export default function LoginPage() {
  const navigate = useNavigate();
  const { signIn, signUp, mode, email: currentEmail } = useAuthStore();
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    if (isSignUp && password.length < 6) {
      setError("Passwords need at least 6 characters.");
      return;
    }
    setBusy(true);
    try {
      if (isSignUp) {
        await signUp(email.trim(), password, displayName.trim() || "You");
        await pushProfileBootstrap(useAuthStore.getState().userId!, displayName.trim() || "You");
        resetPullState(useAuthStore.getState().userId!);
        toast.success("Welcome to MarketLog", { description: "Your account is ready." });
      } else {
        await signIn(email.trim(), password);
        const uid = useAuthStore.getState().userId!;
        resetPullState(uid);
        await pushProfileBootstrap(uid, "You");
        toast.success("Signed in", { description: "Your data will sync to the cloud copy." });
      }
      navigate("/");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sign-in didn't work. Try again.";
      setError(msg.includes("Invalid login") ? "That email and password don't match." : msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-10">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30">
          <Sparkles className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight">MarketLog</h1>
        <p className="mt-1 text-sm text-muted-foreground">Simple, reliable tracking for market vendors.</p>
      </div>

      {supabaseConfigured ? (
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm" noValidate>
          <div className="text-center">
            <h2 className="font-semibold">{isSignUp ? "Create your account" : `Welcome back${currentEmail && mode === "supabase" ? "" : ""}`}</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {isSignUp ? "Your data still works offline first." : "Sign in to sync across your devices."}
            </p>
          </div>

          {isSignUp && (
            <div className="space-y-1.5">
              <Label htmlFor="l-name">Your name</Label>
              <Input id="l-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Alex" autoComplete="name" />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="l-email">Email</Label>
            <Input id="l-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" inputMode="email" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="l-pass">Password</Label>
            <Input id="l-pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={isSignUp ? "new-password" : "current-password"} />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" className="w-full" size="lg" disabled={busy}>
            <LogIn className="h-4 w-4" />
            {busy ? "Just a moment…" : isSignUp ? "Create account" : "Sign in"}
          </Button>

          <button
            type="button"
            onClick={() => setIsSignUp((v) => !v)}
            className="w-full text-center text-xs font-medium text-primary hover:underline"
          >
            {isSignUp ? "I already have an account — sign in" : "New here? Create an account"}
          </button>
        </form>
      ) : (
        <div className="space-y-4 rounded-2xl border bg-card p-5 text-center shadow-sm">
          <HardDrive className="mx-auto h-8 w-8 text-primary" />
          <h2 className="font-semibold">Cloud sync isn't set up in this build</h2>
          <p className="text-sm text-muted-foreground">
            You can still use everything on this device — products, events, sales and reports all work offline.
          </p>
        </div>
      )}

      <div className={cn("mt-6 text-center", !supabaseConfigured && "mt-0")}>
        <Link to="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
          <HardDrive className="h-4 w-4" /> Continue on this device only
        </Link>
        <p className="mt-1.5 text-xs text-muted-foreground">
          Your data stays on this phone or tablet — nothing leaves it.
        </p>
      </div>
    </div>
  );
}

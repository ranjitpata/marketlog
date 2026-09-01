/**
 * Connectivity detection that does NOT trust navigator.onLine alone.
 *
 * Before any sync attempt we probe the Supabase auth health endpoint with a
 * short timeout. Only a real response declares "online". navigator.onLine and
 * window online/offline events are used merely as hints to re-probe sooner.
 */
import { supabase, supabaseConfigured, supabaseUrl } from "@/lib/supabase/client";

export type Reachability = "online" | "offline" | "unconfigured";

export async function checkReachability(timeoutMs = 5000): Promise<Reachability> {
  if (!supabaseConfigured || !supabase || !supabaseUrl) return "unconfigured";
  const url = `${supabaseUrl.replace(/\/$/, "")}/auth/v1/health`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "GET",
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    // Any real HTTP answer means the network path works. 5xx = Supabase down → offline.
    return res.status < 500 ? "online" : "offline";
  } catch {
    return "offline";
  } finally {
    clearTimeout(timer);
  }
}

/** Exponential backoff with a cap; resets to fast retries after success. */
export function backoffDelayMs(consecutiveFailures: number, baseMs = 1000, maxMs = 60_000): number {
  if (consecutiveFailures <= 0) return baseMs;
  const exp = baseMs * Math.pow(2, Math.min(consecutiveFailures, 10));
  return Math.min(exp, maxMs);
}

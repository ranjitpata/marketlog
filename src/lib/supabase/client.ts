/**
 * The single client-side supabase-js instance.
 *
 * There is NO server tier in MarketLog — the browser talks to Supabase directly
 * with the anon key, and Row Level Security enforces auth.uid() = user_id on
 * every table. This module is imported ONLY by the sync engine and the auth
 * store; repositories and UI components never touch it.
 *
 * When env vars are absent the app runs in local-only mode: everything works,
 * nothing leaves the device.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SupabaseClient | null = supabaseConfigured
  ? createClient(url!, anonKey!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: "marketlog.auth",
      },
    })
  : null;

/** Build-time info surfaced in Settings so users know if cloud sync is wired up. */
export const supabaseUrl = url ?? null;

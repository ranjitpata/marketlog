/**
 * Identity store — local-first auth.
 *
 * IndexedDB writes must keep working under the CACHED user_id even if the
 * Supabase JWT expired while offline. So identity is persisted locally and is
 * the input to every repository write; the Supabase session is refreshed
 * separately (see sync engine "session" state) without ever blocking local use.
 */
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { newId } from "@/lib/uuid";
import { supabase, supabaseConfigured } from "@/lib/supabase/client";

export type IdentityMode = "local" | "supabase";

const LOCAL_USER_KEY = "marketlog.localUserId";

interface AuthState {
  /** False until the initial identity resolution finished (app gate). */
  ready: boolean;
  userId: string | null;
  mode: IdentityMode;
  email: string | null;
  ensureIdentity: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearIdentity: () => void;
}

function getOrCreateLocalUserId(): string {
  let id = window.localStorage.getItem(LOCAL_USER_KEY);
  if (!id) {
    id = newId();
    window.localStorage.setItem(LOCAL_USER_KEY, id);
  }
  return id;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      ready: false,
      userId: null,
      mode: "local",
      email: null,

      /**
       * Resolves who "this device's user" is. Never throws: worst case we fall
       * back to a local identity so the app is fully usable offline / without
       * any cloud configured.
       */
      async ensureIdentity() {
        if (get().ready) return;

        if (!supabaseConfigured) {
          // No cloud configured — pure local mode. Everything works, nothing syncs.
          set({ userId: getOrCreateLocalUserId(), mode: "local", email: null, ready: true });
          return;
        }

        try {
          const { data } = await supabase!.auth.getSession();
          const user = data.session?.user ?? null;
          if (user) {
            set({ userId: user.id, mode: "supabase", email: user.email ?? null, ready: true });
            // Keep a hard cache so identity survives expired-token offline boots.
            window.localStorage.setItem("marketlog.cachedUserId", user.id);
            return;
          }
        } catch {
          // Network/auth unreachable on boot. Use cached identity if we have one.
        }

        const cached = window.localStorage.getItem("marketlog.cachedUserId");
        if (cached) {
          // Session is stale but identity is intact — local writes keep working;
          // the sync engine will surface "refresh your session" once online.
          set({ userId: cached, mode: "supabase", ready: true });
          return;
        }

        // Never signed in on this device and cloud is configured: local identity
        // so the app is explorable; sign-in upgrades it to a synced account.
        set({ userId: getOrCreateLocalUserId(), mode: "local", ready: true });
      },

      async signIn(email: string, password: string) {
        if (!supabaseConfigured) throw new Error("Cloud sync is not configured on this build.");
        const { error } = await supabase!.auth.signInWithPassword({ email, password });
        if (error) throw error;
        const { data } = await supabase!.auth.getSession();
        const user = data.session?.user;
        if (user) {
          window.localStorage.setItem("marketlog.cachedUserId", user.id);
          set({ userId: user.id, mode: "supabase", email: user.email ?? null, ready: true });
        }
      },

      async signUp(email: string, password: string, displayName: string) {
        if (!supabaseConfigured) throw new Error("Cloud sync is not configured on this build.");
        const { error } = await supabase!.auth.signUp({
          email,
          password,
          options: { data: { display_name: displayName } },
        });
        if (error) throw error;
        // Email confirmation flows vary; after signUp we try an immediate
        // sign-in — if it fails, the user can sign in once they confirm.
        try {
          await get().signIn(email, password);
        } catch {
          /* confirmation required — user will sign in later */
        }
      },

      async signOut() {
        if (supabaseConfigured) {
          try {
            await supabase!.auth.signOut();
          } catch {
            /* signing out locally anyway */
          }
        }
        window.localStorage.removeItem("marketlog.cachedUserId");
        set({ userId: null, mode: "local", email: null, ready: true });
      },

      clearIdentity() {
        window.localStorage.removeItem("marketlog.cachedUserId");
        set({ userId: null, mode: "local", email: null });
      },
    }),
    {
      name: "marketlog.identity",
      storage: createJSONStorage(() => window.localStorage),
      partialize: (s) => ({ userId: s.userId, mode: s.mode, email: s.email }),
    },
  ),
);

/** Synchronous current user id for repository writes. */
export function currentUserId(): string {
  return useAuthStore.getState().userId ?? "anonymous";
}

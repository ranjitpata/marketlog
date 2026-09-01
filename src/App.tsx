import { useEffect } from "react";
import { Route, Routes } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { syncEngine } from "@/lib/sync/syncEngine";
import { ensureProfile } from "@/lib/repositories/profileRepository";
import AppLayout from "@/components/layout/AppLayout";
import DashboardPage from "@/routes/DashboardPage";
import EventsPage from "@/routes/EventsPage";
import EventFormPage from "@/routes/EventFormPage";
import EventDetailPage from "@/routes/EventDetailPage";
import QuickSalePage from "@/routes/QuickSalePage";
import ProductsPage from "@/routes/ProductsPage";
import ProductFormPage from "@/routes/ProductFormPage";
import ProductDetailPage from "@/routes/ProductDetailPage";
import SettingsPage from "@/routes/SettingsPage";
import LoginPage from "@/routes/LoginPage";

export default function App() {
  const ready = useAuthStore((s) => s.ready);
  const userId = useAuthStore((s) => s.userId);

  // Resolve this device's identity (cached user id — works fully offline).
  useEffect(() => {
    void useAuthStore.getState().ensureIdentity();
  }, []);

  // Start the background sync engine once identity is known.
  useEffect(() => {
    if (!ready || !userId) return;
    syncEngine.start();
    void ensureProfile(userId, "You").catch(() => {
      /* profile bootstrap is best-effort; app works regardless */
    });
  }, [ready, userId]);

  // Restore the saved theme (default: light, warm).
  useEffect(() => {
    const saved = window.localStorage.getItem("marketlog.theme");
    if (saved === "dark") document.documentElement.classList.add("dark");
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-sm text-muted-foreground">Opening MarketLog…</p>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AppLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="events/new" element={<EventFormPage />} />
        <Route path="events/:id" element={<EventDetailPage />} />
        <Route path="events/:id/edit" element={<EventFormPage />} />
        <Route path="sale" element={<QuickSalePage />} />
        <Route path="products" element={<ProductsPage />} />
        <Route path="products/new" element={<ProductFormPage />} />
        <Route path="products/:id" element={<ProductDetailPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<DashboardPage />} />
      </Route>
    </Routes>
  );
}

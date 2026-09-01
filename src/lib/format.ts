/** Time + money formatting helpers. Pure, no dependencies, no network. */

export function nowIso(): string {
  return new Date().toISOString();
}

export function todayStr(): string {
  return dateToStr(new Date());
}

export function dateToStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parse 'YYYY-MM-DD' into a LOCAL midnight Date (avoids UTC shift bugs). */
export function strToDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

/** Money in integer cents → localized display string. */
export function formatMoney(cents: number, opts?: { signed?: boolean }): string {
  const abs = Math.abs(cents);
  const body = new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: abs % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(abs / 100);
  if (opts?.signed && cents > 0) return `+${body}`;
  if (cents < 0) return `−${body}`;
  return body;
}

/** Money input as decimal string (e.g. "12.50") → integer cents. */
export function parseMoneyToCents(input: string): number {
  const cleaned = input.replace(/[^0-9.\-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return 0;
  return Math.round(parseFloat(cleaned) * 100);
}

/** Integer cents → decimal string for form inputs ("12.5" style). */
export function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace(/\.00$/, "");
}

export function formatDateShort(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(strToDate(dateStr));
}

export function formatDateMedium(dateStr: string): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(strToDate(dateStr));
}

export function formatTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

/** "Today", "Tomorrow", "In 3 days", "3 days ago", or short date. */
export function relativeDay(dateStr: string): string {
  const today = strToDate(todayStr());
  const target = strToDate(dateStr);
  const diffDays = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  if (diffDays > 1 && diffDays <= 14) return `In ${diffDays} days`;
  if (diffDays < -1 && diffDays >= -14) return `${Math.abs(diffDays)} days ago`;
  return formatDateShort(dateStr);
}

export function isSameMonth(isoOrDateStr: string, ref: Date): boolean {
  const d = isoOrDateStr.includes("T") ? new Date(isoOrDateStr) : strToDate(isoOrDateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** clamp helper used by steppers */
export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

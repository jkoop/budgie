/** Money helpers — store amounts as integer cents. */

export function dollarsToCents(value) {
  if (typeof value === "number") {
    return Math.round(value * 100);
  }
  const s = String(value ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  if (!s) return 0;
  const neg = s.startsWith("-") || s.startsWith("(");
  const cleaned = s.replace(/^[-(]/, "").replace(/\)$/, "");
  const n = Number.parseFloat(cleaned);
  if (Number.isNaN(n)) return 0;
  const cents = Math.round(Math.abs(n) * 100);
  return neg ? -cents : cents;
}

export function formatMoney(cents) {
  const n = (Number(cents) || 0) / 100;
  const abs = Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${abs}` : `$${abs}`;
}

export function moneyClass(cents) {
  const n = Number(cents) || 0;
  if (n < 0) return "neg";
  if (n > 0) return "pos";
  return "zero";
}

export function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  const yy = dt.getFullYear();
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

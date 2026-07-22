import { escapeHtml, formatMoney, moneyClass } from "../money.js";

export function moneySpan(cents) {
  return `<span class="money ${moneyClass(cents)}">${formatMoney(cents)}</span>`;
}

export function layout(title, body, { flash = null, active = "" } = {}) {
  const nav = [
    ["/", "Dashboard", "dashboard"],
    ["/envelopes", "Envelopes", "envelopes"],
    ["/ledger", "Ledger", "ledger"],
    ["/accounts", "Accounts", "accounts"],
    ["/goals", "Goals", "goals"],
    ["/schedules", "Schedules", "schedules"],
    ["/import", "Import", "import"],
  ]
    .map(
      ([href, label, key]) =>
        `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`
    )
    .join("");

  const flashHtml = flash
    ? `<div class="flash ${flash.type || "info"}">${escapeHtml(flash.message)}</div>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Budgie</title>
  <link rel="stylesheet" href="/public/style.css" />
  <script src="https://unpkg.com/htmx.org@2.0.4"></script>
</head>
<body>
  <header class="top">
    <a class="brand" href="/">Budgie</a>
    <nav>${nav}</nav>
  </header>
  <main>
    ${flashHtml}
    ${body}
  </main>
</body>
</html>`;
}

export function selectOptions(items, selected, { valueKey = "id", labelKey = "name", empty = null } = {}) {
  const opts = [];
  const emptySelected = selected == null || selected === "";
  if (empty != null) {
    opts.push(
      `<option value=""${emptySelected ? " selected" : ""}>${escapeHtml(empty)}</option>`
    );
  }
  for (const item of items) {
    const v = item[valueKey];
    const sel = !emptySelected && String(v) === String(selected) ? " selected" : "";
    opts.push(
      `<option value="${escapeHtml(v)}"${sel}>${escapeHtml(item[labelKey])}</option>`
    );
  }
  return opts.join("");
}

export function cadenceFields(prefix = "", values = {}) {
  const kind = values.cadence_kind || "monthly";
  const interval = values.cadence_interval ?? 1;
  const day = values.cadence_day ?? "";
  const next = values.next_date || "";
  return `
    <label>Cadence
      <select name="${prefix}cadence_kind">
        <option value="daily"${kind === "daily" ? " selected" : ""}>Every N days</option>
        <option value="weekly"${kind === "weekly" ? " selected" : ""}>Weekly</option>
        <option value="biweekly"${kind === "biweekly" ? " selected" : ""}>Biweekly</option>
        <option value="monthly"${kind === "monthly" ? " selected" : ""}>Monthly</option>
        <option value="yearly"${kind === "yearly" ? " selected" : ""}>Yearly</option>
      </select>
    </label>
    <label>Interval
      <input type="number" name="${prefix}cadence_interval" min="1" value="${escapeHtml(interval)}" />
    </label>
    <label>Day (DOM 1–28, or -1 last; weekly ignored)
      <input type="number" name="${prefix}cadence_day" value="${escapeHtml(day)}" />
    </label>
    <label>Next date
      <input type="date" name="${prefix}next_date" required value="${escapeHtml(next)}" />
    </label>`;
}

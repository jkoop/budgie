import {
  escapeHtml,
  formatMoney,
  moneyClass,
  todayISO,
} from "../money.js";
import { cadenceFields, layout, moneySpan, selectOptions } from "./layout.js";

function progressBar(funded, target) {
  if (!target || target <= 0) return "";
  const pct = Math.min(100, Math.round((funded / target) * 100));
  return `<div class="progress" title="${pct}%"><span style="width:${pct}%"></span></div>
    <div class="muted" style="font-size:0.8rem">${pct}% · ${formatMoney(funded)} of ${formatMoney(target)}</div>`;
}

function goalEnvelopeSummary(e) {
  return `<div style="margin-bottom:0.75rem">
    <strong>${escapeHtml(e.name)}</strong> <span class="pill">envelope</span>
    ${progressBar(e.balance, e.target_amount)}
  </div>`;
}

function standaloneGoalSummary(g) {
  return `<div style="margin-bottom:0.75rem">
    <strong>${escapeHtml(g.name)}</strong> <span class="pill">standalone</span>
    ${progressBar(g.funded, g.target_amount)}
  </div>`;
}

function goalEnvelopeTableRow(e) {
  return `<tr>
    <td><strong>${escapeHtml(e.name)}</strong> <span class="pill">envelope</span>
      <div class="muted">${escapeHtml(e.group_name || "")}${e.target_date ? ` · by ${escapeHtml(e.target_date)}` : ""}</div>
      ${progressBar(e.balance, e.target_amount)}
    </td>
    <td class="num">${moneySpan(e.balance)}</td>
    <td class="num">${moneySpan(e.target_amount)}</td>
    <td><a href="/envelopes">Manage in Envelopes →</a></td>
  </tr>`;
}

function standaloneGoalTableRow(g) {
  const remaining = Math.max(0, g.target_amount - g.funded);
  return `<tr>
    <td>
      <strong>${escapeHtml(g.name)}</strong> <span class="pill">standalone</span>
      <div class="muted">Source: ${escapeHtml(g.source_envelope_name || "Ready to Assign")}
        ${g.target_date ? ` · by ${escapeHtml(g.target_date)}` : ""}
        ${g.auto_amount ? ` · auto ${formatMoney(g.auto_amount)} ${escapeHtml(g.cadence_kind || "")}` : ""}
      </div>
      ${progressBar(g.funded, g.target_amount)}
    </td>
    <td class="num">${moneySpan(g.funded)}</td>
    <td class="num">${moneySpan(g.target_amount)}</td>
    <td>
      <form method="post" action="/goals/${g.id}/fund" class="actions">
        <input name="amount" placeholder="${(remaining / 100).toFixed(2)}" required style="width:5.5rem" />
        <button type="submit">Fund</button>
      </form>
      <form method="post" action="/goals/${g.id}/delete" onsubmit="return confirm('Delete goal?')" style="margin-top:0.35rem">
        <button type="submit" class="danger">Delete</button>
      </form>
    </td>
  </tr>`;
}

export function dashboardPage({
  ready,
  accountTotal,
  envelopeTotal,
  uncategorized,
  groups,
  goalEnvelopes,
  goals,
  upcomingAllowances,
  upcomingIncome,
  recent,
  flash,
}) {
  const groupHtml = groups
    .map((g) => {
      const rows = g.envelopes
        .map(
          (e) => `
        <div class="envelope-row">
          <div>
            <strong>${escapeHtml(e.name)}</strong>
            ${e.target_amount ? `<span class="pill">goal</span>` : ""}
            ${e.target_amount ? progressBar(e.balance, e.target_amount) : ""}
          </div>
          <div class="num">${moneySpan(e.balance)}</div>
          <form method="post" action="/envelopes/assign" class="row">
            <input type="hidden" name="envelope_id" value="${e.id}" />
            <input type="text" name="amount" placeholder="Assign" required />
            <button type="submit">Assign</button>
          </form>
        </div>`
        )
        .join("");
      return `<div class="panel"><h3>${escapeHtml(g.name)}</h3>${rows || '<p class="muted">No envelopes</p>'}</div>`;
    })
    .join("");

  const upcoming = `
    <div class="panel">
      <h3>Upcoming</h3>
      <p class="hint">Schedules auto-apply when due (on each page load).</p>
      <ul>
        ${upcomingIncome
          .map(
            (s) =>
              `<li>Income <strong>${escapeHtml(s.name)}</strong> ${moneySpan(s.amount)} on ${escapeHtml(s.next_date)}</li>`
          )
          .join("")}
        ${upcomingAllowances
          .map(
            (r) =>
              `<li>Allowance → <strong>${escapeHtml(r.envelope_name)}</strong> ${moneySpan(r.amount)} on ${escapeHtml(r.next_date)}${r.last_shortfall ? ` <span class="muted">(last shortfall ${formatMoney(r.last_shortfall)})</span>` : ""}</li>`
          )
          .join("")}
        ${!upcomingIncome.length && !upcomingAllowances.length ? "<li class='muted'>Nothing scheduled</li>" : ""}
      </ul>
    </div>`;

  const goalsHtml = `
    <div class="panel">
      <h3>Goals</h3>
      ${(goalEnvelopes || []).map(goalEnvelopeSummary).join("")}
      ${(goals || []).map(standaloneGoalSummary).join("")}
      ${!goalEnvelopes?.length && !goals?.length ? '<p class="muted">No goals yet</p>' : ""}
    </div>`;

  const recentHtml = `
    <div class="panel">
      <h3>Recent activity</h3>
      <table>
        <thead><tr><th>Date</th><th>Payee</th><th>Envelope</th><th class="num">Amount</th></tr></thead>
        <tbody>
          ${recent
            .map(
              (t) => `<tr>
              <td>${escapeHtml(t.date)}</td>
              <td>${escapeHtml(t.payee || t.kind)}${t.memo ? `<div class="muted">${escapeHtml(t.memo)}</div>` : ""}</td>
              <td>${escapeHtml(t.envelope_name || (t.kind === "income" ? "Ready" : "—"))}</td>
              <td class="num">${moneySpan(t.amount)}</td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    </div>`;

  const body = `
    <h1>Dashboard</h1>
    <div class="grid stats">
      <div class="stat"><div class="label">Ready to Assign</div><div class="value ${moneyClass(ready)}">${formatMoney(ready)}</div></div>
      <div class="stat"><div class="label">Accounts</div><div class="value">${formatMoney(accountTotal)}</div></div>
      <div class="stat"><div class="label">In envelopes</div><div class="value">${formatMoney(envelopeTotal)}</div></div>
      <div class="stat"><div class="label">Uncategorized</div><div class="value">${uncategorized}${uncategorized ? ' <a href="/ledger?uncategorized=1">fix →</a>' : ""}</div></div>
    </div>
    <div class="two-col" style="margin-top:1.25rem">
      <div>
        <h2>Envelopes</h2>
        ${groupHtml}
      </div>
      <div>
        ${upcoming}
        ${goalsHtml}
        ${recentHtml}
      </div>
    </div>`;

  return layout("Dashboard", body, { flash, active: "dashboard" });
}

export function envelopesPage({ groups, envelopes, flash }) {
  const list = groups
    .map((g) => {
      const rows = g.envelopes
        .map((e) => {
          const over =
            e.balance < 0
              ? `<form method="post" action="/envelopes/cover" style="display:inline">
                   <input type="hidden" name="envelope_id" value="${e.id}" />
                   <button type="submit" class="secondary">Cover</button>
                 </form>`
              : "";
          return `<tr>
            <td>
              <strong>${escapeHtml(e.name)}</strong>
              ${e.target_amount ? `<div class="muted">Target ${formatMoney(e.target_amount)}${e.target_date ? ` by ${escapeHtml(e.target_date)}` : ""}</div>${progressBar(e.balance, e.target_amount)}` : ""}
            </td>
            <td class="num">${moneySpan(e.balance)}</td>
            <td>
              <form method="post" action="/envelopes/assign" class="actions">
                <input type="hidden" name="envelope_id" value="${e.id}" />
                <input type="text" name="amount" placeholder="0.00" required style="width:5.5rem" />
                <button type="submit">Assign</button>
              </form>
              ${over}
            </td>
            <td>
              <details>
                <summary class="muted">Edit</summary>
                <form method="post" action="/envelopes/${e.id}/update" class="stack" style="margin-top:0.5rem">
                  <label>Name<input name="name" value="${escapeHtml(e.name)}" required /></label>
                  <label>Group
                    <select name="group_id">${selectOptions(
                      groups.map((x) => ({ id: x.id, name: x.name })),
                      e.group_id
                    )}</select>
                  </label>
                  <label>Target amount<input name="target_amount" value="${e.target_amount != null ? (e.target_amount / 100).toFixed(2) : ""}" placeholder="optional" /></label>
                  <label>Target date<input type="date" name="target_date" value="${escapeHtml(e.target_date || "")}" /></label>
                  <label><span><input type="checkbox" name="archived" value="1" ${e.archived ? "checked" : ""}/> Archived</span></label>
                  <button type="submit">Save</button>
                </form>
              </details>
            </td>
          </tr>`;
        })
        .join("");
      return `<div class="panel"><h3>${escapeHtml(g.name)}</h3>
        <table><thead><tr><th>Envelope</th><th class="num">Balance</th><th>Assign</th><th></th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    })
    .join("");

  const moveForm = `
    <div class="panel">
      <h3>Move between envelopes</h3>
      <form method="post" action="/envelopes/move" class="row">
        <label>From<select name="from_id" required>${selectOptions(envelopes, null)}</select></label>
        <label>To<select name="to_id" required>${selectOptions(envelopes, null)}</select></label>
        <label>Amount<input name="amount" required placeholder="0.00" /></label>
        <button type="submit">Move</button>
      </form>
    </div>`;

  const createForms = `
    <div class="two-col">
      <div class="panel">
        <h3>New envelope</h3>
        <form method="post" action="/envelopes" class="stack">
          <label>Name<input name="name" required /></label>
          <label>Group<select name="group_id">${selectOptions(
            groups.map((g) => ({ id: g.id, name: g.name })),
            groups[0]?.id
          )}</select></label>
          <label>Target amount (goal envelope)<input name="target_amount" placeholder="optional" /></label>
          <label>Target date<input type="date" name="target_date" /></label>
          <button type="submit">Create envelope</button>
        </form>
      </div>
      <div class="panel">
        <h3>New group</h3>
        <form method="post" action="/envelope-groups" class="stack">
          <label>Name<input name="name" required /></label>
          <button type="submit">Create group</button>
        </form>
      </div>
    </div>`;

  return layout(
    "Envelopes",
    `<h1>Envelopes</h1><p class="hint">Assign from Ready to Assign. Set a target to turn an envelope into a goal envelope.</p>${list}${moveForm}${createForms}`,
    { flash, active: "envelopes" }
  );
}

export function accountsPage({ accounts, flash }) {
  const rows = accounts
    .map(
      (a) => `<tr>
      <td><strong>${escapeHtml(a.name)}</strong>${a.archived ? ' <span class="pill">archived</span>' : ""}</td>
      <td class="num">${moneySpan(a.balance)}</td>
      <td class="muted">${escapeHtml(a.ofx_account_id || "—")}</td>
      <td>
        <details>
          <summary class="muted">Edit</summary>
          <form method="post" action="/accounts/${a.id}/update" class="stack" style="margin-top:0.5rem">
            <label>Name<input name="name" value="${escapeHtml(a.name)}" required /></label>
            <label>OFX account id<input name="ofx_account_id" value="${escapeHtml(a.ofx_account_id || "")}" /></label>
            <label><span><input type="checkbox" name="archived" value="1" ${a.archived ? "checked" : ""}/> Archived</span></label>
            <button type="submit">Save</button>
          </form>
        </details>
      </td>
    </tr>`
    )
    .join("");

  const body = `
    <h1>Accounts</h1>
    <p class="hint">Balances update from <a href="/import">QFX/OFX import</a>. Inter-account transfers are detected from bank memos when both accounts have matching OFX IDs.</p>
    <div class="panel">
      <table>
        <thead><tr><th>Account</th><th class="num">Balance</th><th>OFX ID</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="panel">
      <h3>New account</h3>
      <form method="post" action="/accounts" class="stack">
        <label>Name<input name="name" required /></label>
        <label>OFX account id<input name="ofx_account_id" placeholder="optional" /></label>
        <button type="submit">Create</button>
      </form>
    </div>`;

  return layout("Accounts", body, { flash, active: "accounts" });
}

export const TXN_PAGE_SIZE = 50;

function ledgerFilterQuery(filters) {
  const p = new URLSearchParams();
  if (filters.account_id) p.set("account_id", filters.account_id);
  if (filters.envelope_id) p.set("envelope_id", filters.envelope_id);
  if (filters.from) p.set("from", filters.from);
  if (filters.to) p.set("to", filters.to);
  if (filters.uncategorized) p.set("uncategorized", "1");
  const s = p.toString();
  return s ? `&${s}` : "";
}

export function transactionRowsHtml(transactions, envelopeOptionsHtml = "") {
  return transactions
    .map((t) => {
      const needsCat = t.kind === "expense" && !t.envelope_id;
      const cat = needsCat
        ? `<form method="post" action="/ledger/${t.id}/categorize" class="actions">
             <select name="envelope_id" required>${envelopeOptionsHtml}</select>
             <button type="submit">Save</button>
           </form>`
        : escapeHtml(
            t.envelope_name ||
              (t.kind === "income" && !t.envelope_id ? "Ready" : t.kind)
          );
      return `<tr>
        <td>${escapeHtml(t.date)}</td>
        <td>${escapeHtml(t.account_name || "—")}</td>
        <td>${escapeHtml(t.payee || "")}${t.memo ? `<div class="muted">${escapeHtml(t.memo)}</div>` : ""}
          <div class="muted" style="font-size:0.75rem">${escapeHtml(t.kind)}</div></td>
        <td>${cat}</td>
        <td class="num">${moneySpan(t.amount)}</td>
        <td>
          <form method="post" action="/ledger/${t.id}/delete" onsubmit="return confirm('Delete transaction?')">
            <button type="submit" class="danger">Delete</button>
          </form>
        </td>
      </tr>`;
    })
    .join("");
}

/** HTMX partial: table rows + optional infinite-scroll sentinel. */
export function ledgerRowsPartial({
  transactions,
  envelopes,
  filters,
  offset,
  hasMore,
}) {
  const envelopeOptionsHtml = selectOptions(envelopes, null, {
    empty: "Categorize…",
  });
  const rows = transactionRowsHtml(transactions, envelopeOptionsHtml);
  if (!rows && offset === 0) {
    return `<tr><td colspan="6" class="muted">No transactions</td></tr>`;
  }
  let htmlOut = rows;
  if (hasMore) {
    const next = offset + transactions.length;
    const q = ledgerFilterQuery(filters);
    htmlOut += `<tr class="load-more"
      hx-get="/ledger/rows?offset=${next}${q}"
      hx-trigger="intersect once"
      hx-swap="outerHTML">
      <td colspan="6" class="muted">Loading more…</td>
    </tr>`;
  }
  return htmlOut;
}

export function ledgerPage({ accounts, envelopes, filters, flash }) {
  const q = ledgerFilterQuery(filters);
  const body = `
    <h1>Ledger</h1>
    <p class="hint">Bank transactions come from <a href="/import">QFX/OFX import</a>. Categorize uncategorized outflows here. Scroll to load more.</p>
    <div class="panel">
      <form method="get" action="/ledger" class="row">
        <label>Account
          <select name="account_id">
            ${selectOptions(accounts, filters.account_id, { empty: "All accounts" })}
          </select>
        </label>
        <label>Envelope
          <select name="envelope_id">
            ${selectOptions(envelopes, filters.envelope_id, { empty: "All envelopes" })}
          </select>
        </label>
        <label>From<input type="date" name="from" value="${escapeHtml(filters.from || "")}" /></label>
        <label>To<input type="date" name="to" value="${escapeHtml(filters.to || "")}" /></label>
        <label><span><input type="checkbox" name="uncategorized" value="1" ${filters.uncategorized ? "checked" : ""}/> Uncategorized only</span></label>
        <button type="submit" class="secondary">Filter</button>
      </form>
    </div>

    <div class="panel">
      <table>
        <thead><tr><th>Date</th><th>Account</th><th>Payee</th><th>Envelope</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody id="txn-rows"
          hx-get="/ledger/rows?offset=0${q}"
          hx-trigger="load"
          hx-swap="innerHTML">
          <tr><td colspan="6" class="muted">Loading…</td></tr>
        </tbody>
      </table>
    </div>`;

  return layout("Ledger", body, { flash, active: "ledger" });
}

export function goalsPage({ goals, goalEnvelopes, envelopes, flash }) {
  const envGoals = goalEnvelopes.map(goalEnvelopeTableRow).join("");
  const standalone = goals.map(standaloneGoalTableRow).join("");

  const body = `
    <h1>Goals</h1>
    <p class="hint">Goal envelopes live with your budget. Standalone goals track long-term targets funded from Ready or a chosen envelope.</p>

    <div class="panel">
      <h3>Goal envelopes</h3>
      <table>
        <thead><tr><th>Goal</th><th class="num">Balance</th><th class="num">Target</th><th></th></tr></thead>
        <tbody>${envGoals || '<tr><td colspan="4" class="muted">None — set a target on an envelope</td></tr>'}</tbody>
      </table>
    </div>

    <div class="panel">
      <h3>Standalone goals</h3>
      <table>
        <thead><tr><th>Goal</th><th class="num">Funded</th><th class="num">Target</th><th></th></tr></thead>
        <tbody>${standalone || '<tr><td colspan="4" class="muted">No standalone goals</td></tr>'}</tbody>
      </table>
    </div>

    <div class="panel">
      <h3>New standalone goal</h3>
      <form method="post" action="/goals" class="stack">
        <label>Name<input name="name" required /></label>
        <label>Target amount<input name="target_amount" required /></label>
        <label>Target date<input type="date" name="target_date" /></label>
        <label>Fund from
          <select name="source_envelope_id">
            <option value="">Ready to Assign</option>
            ${selectOptions(envelopes, null)}
          </select>
        </label>
        <label>Auto-fund amount<input name="auto_amount" placeholder="optional" /></label>
        ${cadenceFields("", { cadence_kind: "monthly", cadence_interval: 1, next_date: todayISO() })}
        <p class="hint">Leave auto-fund amount empty to skip scheduled funding. Cadence/next date only apply when auto-fund is set.</p>
        <button type="submit">Create goal</button>
      </form>
    </div>`;

  return layout("Goals", body, { flash, active: "goals" });
}

export function schedulesPage({
  incomeSchedules,
  allowanceRules,
  accounts,
  envelopes,
  flash,
}) {
  const incomeRows = incomeSchedules
    .map(
      (s) => `<tr>
      <td><strong>${escapeHtml(s.name)}</strong>${!s.active ? ' <span class="pill">off</span>' : ""}
        <div class="muted">${escapeHtml(s.account_name)} · ${escapeHtml(s.cadence_kind)} / ${s.cadence_interval}</div></td>
      <td class="num">${moneySpan(s.amount)}</td>
      <td>${escapeHtml(s.next_date)}</td>
      <td>
        <form method="post" action="/schedules/income/${s.id}/toggle">
          <button type="submit" class="secondary">${s.active ? "Disable" : "Enable"}</button>
        </form>
        <form method="post" action="/schedules/income/${s.id}/delete" onsubmit="return confirm('Delete?')">
          <button type="submit" class="danger">Delete</button>
        </form>
      </td>
    </tr>`
    )
    .join("");

  const allowRows = allowanceRules
    .map(
      (r) => `<tr>
      <td><strong>${escapeHtml(r.envelope_name)}</strong>${!r.active ? ' <span class="pill">off</span>' : ""}
        <div class="muted">${escapeHtml(r.cadence_kind)} / ${r.cadence_interval}
          ${r.last_shortfall ? ` · shortfall ${formatMoney(r.last_shortfall)}` : ""}</div></td>
      <td class="num">${moneySpan(r.amount)}</td>
      <td>${escapeHtml(r.next_date)}</td>
      <td>
        <form method="post" action="/schedules/allowance/${r.id}/toggle">
          <button type="submit" class="secondary">${r.active ? "Disable" : "Enable"}</button>
        </form>
        <form method="post" action="/schedules/allowance/${r.id}/delete" onsubmit="return confirm('Delete?')">
          <button type="submit" class="danger">Delete</button>
        </form>
      </td>
    </tr>`
    )
    .join("");

  const body = `
    <h1>Schedules</h1>
    <p class="hint">Predictable income posts to Ready automatically. Allowances assign Ready → envelope when due (partial if Ready is short).</p>

    <div class="panel">
      <h3>Income schedules</h3>
      <table>
        <thead><tr><th>Name</th><th class="num">Amount</th><th>Next</th><th></th></tr></thead>
        <tbody>${incomeRows || '<tr><td colspan="4" class="muted">None</td></tr>'}</tbody>
      </table>
    </div>

    <div class="panel">
      <h3>New income schedule</h3>
      <form method="post" action="/schedules/income" class="stack">
        <label>Name<input name="name" required placeholder="Paycheck" /></label>
        <label>Amount<input name="amount" required /></label>
        <label>Account<select name="account_id" required>${selectOptions(accounts, accounts[0]?.id)}</select></label>
        <label>Payee<input name="payee" /></label>
        ${cadenceFields("", { cadence_kind: "biweekly", cadence_interval: 1, next_date: todayISO() })}
        <button type="submit">Add income schedule</button>
      </form>
    </div>

    <div class="panel">
      <h3>Envelope allowances</h3>
      <table>
        <thead><tr><th>Envelope</th><th class="num">Amount</th><th>Next</th><th></th></tr></thead>
        <tbody>${allowRows || '<tr><td colspan="4" class="muted">None</td></tr>'}</tbody>
      </table>
    </div>

    <div class="panel">
      <h3>New allowance</h3>
      <form method="post" action="/schedules/allowance" class="stack">
        <label>Envelope<select name="envelope_id" required>${selectOptions(envelopes, envelopes[0]?.id)}</select></label>
        <label>Amount<input name="amount" required /></label>
        ${cadenceFields("", { cadence_kind: "monthly", cadence_interval: 1, next_date: todayISO() })}
        <button type="submit">Add allowance</button>
      </form>
    </div>`;

  return layout("Schedules", body, { flash, active: "schedules" });
}

export function importPage({ accounts, imports, flash }) {
  const rows = imports
    .map(
      (i) => `<tr>
      <td>${escapeHtml(i.imported_at)}</td>
      <td>${escapeHtml(i.filename)}</td>
      <td>${escapeHtml(i.account_name || "—")}</td>
      <td class="num">${i.added}</td>
      <td class="num">${i.skipped}</td>
    </tr>`
    )
    .join("");

  const linked = accounts
    .filter((a) => a.ofx_account_id)
    .map(
      (a) =>
        `<li><strong>${escapeHtml(a.name)}</strong> ← ${escapeHtml(a.ofx_account_id)}</li>`
    )
    .join("");

  const body = `
    <h1>Import</h1>
    <p class="hint">Upload one or more QFX/OFX files. Each file is matched to an account by its OFX account ID. Bank transfers that mention another linked account number (e.g. “transfer to … account 3038552770”) are recorded as transfers — they do not change Ready to Assign. Other inflows go to Ready; other outflows stay uncategorized until you assign an envelope.</p>
    <div class="panel">
      <form method="post" action="/import" enctype="multipart/form-data" class="stack">
        <label>OFX / QFX files
          <input type="file" name="files" multiple accept=".ofx,.qfx,application/x-ofx,application/vnd.intu.qfx,text/plain" required />
        </label>
        <button type="submit">Import</button>
      </form>
      ${
        linked
          ? `<p class="hint" style="margin-top:1rem">Linked accounts:</p><ul class="muted">${linked}</ul>`
          : `<p class="hint" style="margin-top:1rem">No accounts have an OFX ID yet — set one on each account (Accounts page) before importing.</p>`
      }
    </div>
    <div class="panel">
      <h3>Recent imports</h3>
      <table>
        <thead><tr><th>When</th><th>File</th><th>Account</th><th class="num">Added</th><th class="num">Skipped</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">No imports yet</td></tr>'}</tbody>
      </table>
    </div>`;

  return layout("Import", body, { flash, active: "import" });
}

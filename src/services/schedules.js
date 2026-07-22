import { db } from "../db.js";
import { addDaysISO, todayISO } from "../money.js";
import { addIncome, assignToEnvelope } from "./budget.js";
import { fundGoal } from "./goals.js";

/**
 * Cadence kinds:
 * - daily: every `interval` days
 * - weekly: every `interval` weeks on cadence_day (0=Sun..6=Sat), next_date is source of truth
 * - biweekly: every 14 * interval days from next_date
 * - monthly: every `interval` months on cadence_day (DOM 1-28, or -1 = last day)
 * - yearly: every `interval` years on the same month/day as next_date
 */

export function advanceDate(fromISO, kind, interval = 1, cadenceDay = null) {
  const n = Math.max(1, Number(interval) || 1);
  const [y, m, d] = fromISO.split("-").map(Number);
  const dt = new Date(y, m - 1, d);

  switch (kind) {
    case "daily":
      return addDaysISO(fromISO, n);
    case "weekly":
      return addDaysISO(fromISO, 7 * n);
    case "biweekly":
      return addDaysISO(fromISO, 14 * n);
    case "monthly": {
      const dom = cadenceDay ?? d;
      let yy = y;
      let mm = m - 1 + n;
      yy += Math.floor(mm / 12);
      mm = ((mm % 12) + 12) % 12;
      if (dom === -1) {
        // last day of target month
        const last = new Date(yy, mm + 1, 0).getDate();
        return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
      }
      const last = new Date(yy, mm + 1, 0).getDate();
      const day = Math.min(dom, last);
      return `${yy}-${String(mm + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    case "yearly": {
      const yy = y + n;
      const last = new Date(yy, m, 0).getDate();
      const day = Math.min(d, last);
      return `${yy}-${String(m).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
    default:
      return addDaysISO(fromISO, n);
  }
}

export function listIncomeSchedules() {
  return db
    .query(
      `SELECT s.*, a.name AS account_name
       FROM income_schedules s
       JOIN accounts a ON a.id = s.account_id
       ORDER BY s.active DESC, s.next_date, s.name`
    )
    .all();
}

export function createIncomeSchedule({
  name,
  amount,
  account_id,
  payee,
  cadence_kind,
  cadence_interval = 1,
  cadence_day = null,
  next_date,
}) {
  return db
    .query(
      `INSERT INTO income_schedules
        (name, amount, account_id, payee, cadence_kind, cadence_interval, cadence_day, next_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      amount,
      account_id,
      payee || name,
      cadence_kind,
      cadence_interval,
      cadence_day,
      next_date
    ).lastInsertRowid;
}

export function updateIncomeSchedule(id, fields) {
  const row = db.query("SELECT * FROM income_schedules WHERE id = ?").get(id);
  if (!row) throw new Error("Schedule not found");
  db.query(
    `UPDATE income_schedules SET
      name = ?, amount = ?, account_id = ?, payee = ?,
      cadence_kind = ?, cadence_interval = ?, cadence_day = ?,
      next_date = ?, active = ?
     WHERE id = ?`
  ).run(
    fields.name ?? row.name,
    fields.amount ?? row.amount,
    fields.account_id ?? row.account_id,
    fields.payee ?? row.payee,
    fields.cadence_kind ?? row.cadence_kind,
    fields.cadence_interval ?? row.cadence_interval,
    fields.cadence_day !== undefined ? fields.cadence_day : row.cadence_day,
    fields.next_date ?? row.next_date,
    fields.active !== undefined ? (fields.active ? 1 : 0) : row.active,
    id
  );
}

export function deleteIncomeSchedule(id) {
  db.query("DELETE FROM income_schedules WHERE id = ?").run(id);
}

export function listAllowanceRules() {
  return db
    .query(
      `SELECT r.*, e.name AS envelope_name
       FROM allowance_rules r
       JOIN envelopes e ON e.id = r.envelope_id
       ORDER BY r.active DESC, r.next_date, e.name`
    )
    .all();
}

export function createAllowanceRule({
  envelope_id,
  amount,
  cadence_kind,
  cadence_interval = 1,
  cadence_day = null,
  next_date,
}) {
  return db
    .query(
      `INSERT INTO allowance_rules
        (envelope_id, amount, cadence_kind, cadence_interval, cadence_day, next_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      envelope_id,
      amount,
      cadence_kind,
      cadence_interval,
      cadence_day,
      next_date
    ).lastInsertRowid;
}

export function updateAllowanceRule(id, fields) {
  const row = db.query("SELECT * FROM allowance_rules WHERE id = ?").get(id);
  if (!row) throw new Error("Allowance rule not found");
  db.query(
    `UPDATE allowance_rules SET
      envelope_id = ?, amount = ?, cadence_kind = ?, cadence_interval = ?,
      cadence_day = ?, next_date = ?, active = ?
     WHERE id = ?`
  ).run(
    fields.envelope_id ?? row.envelope_id,
    fields.amount ?? row.amount,
    fields.cadence_kind ?? row.cadence_kind,
    fields.cadence_interval ?? row.cadence_interval,
    fields.cadence_day !== undefined ? fields.cadence_day : row.cadence_day,
    fields.next_date ?? row.next_date,
    fields.active !== undefined ? (fields.active ? 1 : 0) : row.active,
    id
  );
}

export function deleteAllowanceRule(id) {
  db.query("DELETE FROM allowance_rules WHERE id = ?").run(id);
}

function postDueIncome(today) {
  const due = db
    .query(
      "SELECT * FROM income_schedules WHERE active = 1 AND next_date <= ?"
    )
    .all(today);
  let count = 0;
  for (const s of due) {
    let next = s.next_date;
    // Catch up all missed periods
    while (next <= today) {
      addIncome({
        account_id: s.account_id,
        amount: s.amount,
        date: next,
        payee: s.payee || s.name,
        memo: `Scheduled: ${s.name}`,
      });
      next = advanceDate(next, s.cadence_kind, s.cadence_interval, s.cadence_day);
      count++;
      // safety: don't infinite loop
      if (count > 500) break;
    }
    db.query("UPDATE income_schedules SET next_date = ? WHERE id = ?").run(
      next,
      s.id
    );
  }
  return count;
}

function postDueAllowances(today) {
  const due = db
    .query(
      "SELECT * FROM allowance_rules WHERE active = 1 AND next_date <= ?"
    )
    .all(today);
  let count = 0;
  for (const r of due) {
    let next = r.next_date;
    let lastShortfall = 0;
    while (next <= today) {
      const ready = db
        .query("SELECT ready_to_assign FROM budget_meta WHERE id = 1")
        .get().ready_to_assign;
      const give = Math.min(r.amount, Math.max(0, ready));
      lastShortfall = r.amount - give;
      if (give > 0) {
        assignToEnvelope(r.envelope_id, give, {
          date: next,
          memo: "Allowance",
        });
      }
      next = advanceDate(next, r.cadence_kind, r.cadence_interval, r.cadence_day);
      count++;
      if (count > 500) break;
    }
    db.query(
      "UPDATE allowance_rules SET next_date = ?, last_shortfall = ? WHERE id = ?"
    ).run(next, lastShortfall, r.id);
  }
  return count;
}

function postDueGoalFunds(today) {
  const due = db
    .query(
      `SELECT * FROM goals
       WHERE active = 1 AND auto_amount IS NOT NULL AND auto_amount > 0
         AND next_date IS NOT NULL AND next_date <= ?`
    )
    .all(today);
  let count = 0;
  for (const g of due) {
    let next = g.next_date;
    while (next <= today) {
      try {
        fundGoal(g.id, g.auto_amount, {
          date: next,
          note: "Auto-fund",
          allowPartial: true,
        });
      } catch {
        // ignore if insufficient funds
      }
      next = advanceDate(
        next,
        g.cadence_kind || "monthly",
        g.cadence_interval || 1,
        g.cadence_day
      );
      count++;
      if (count > 500) break;
    }
    db.query("UPDATE goals SET next_date = ? WHERE id = ?").run(next, g.id);
  }
  return count;
}

/** Apply all due schedules. Called on each request. */
export function tick(now = todayISO()) {
  const income = postDueIncome(now);
  const allowances = postDueAllowances(now);
  const goals = postDueGoalFunds(now);
  return { income, allowances, goals, date: now };
}

import { db, adjustReady, getReady } from "../db.js";
import { todayISO } from "../money.js";
import { bumpEnvelope } from "./budget.js";

export function listGoals({ includeInactive = false } = {}) {
  if (includeInactive) {
    return db
      .query(
        `SELECT g.*, e.name AS source_envelope_name
         FROM goals g
         LEFT JOIN envelopes e ON e.id = g.source_envelope_id
         ORDER BY g.active DESC, g.target_date, g.name`
      )
      .all();
  }
  return db
    .query(
      `SELECT g.*, e.name AS source_envelope_name
       FROM goals g
       LEFT JOIN envelopes e ON e.id = g.source_envelope_id
       WHERE g.active = 1
       ORDER BY g.target_date, g.name`
    )
    .all();
}

export function createGoal({
  name,
  target_amount,
  target_date = null,
  source_envelope_id = null,
  auto_amount = null,
  cadence_kind = null,
  cadence_interval = 1,
  cadence_day = null,
  next_date = null,
}) {
  return db
    .query(
      `INSERT INTO goals
        (name, target_amount, target_date, source_envelope_id,
         auto_amount, cadence_kind, cadence_interval, cadence_day, next_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      name,
      target_amount,
      target_date || null,
      source_envelope_id || null,
      auto_amount,
      cadence_kind,
      cadence_interval,
      cadence_day,
      next_date || null
    ).lastInsertRowid;
}

export function deleteGoal(id) {
  db.query("DELETE FROM goal_contributions WHERE goal_id = ?").run(id);
  db.query("DELETE FROM goals WHERE id = ?").run(id);
}

/**
 * Fund a standalone goal from Ready (default) or a source envelope.
 * allowPartial: take what is available up to amount.
 */
export function fundGoal(
  goalId,
  amount,
  { date = todayISO(), note = null, allowPartial = false } = {}
) {
  if (amount <= 0) throw new Error("Fund amount must be positive");
  const goal = db.query("SELECT * FROM goals WHERE id = ?").get(goalId);
  if (!goal) throw new Error("Goal not found");

  let give = amount;
  if (goal.source_envelope_id) {
    const env = db
      .query("SELECT * FROM envelopes WHERE id = ?")
      .get(goal.source_envelope_id);
    if (!env) throw new Error("Source envelope not found");
    if (env.balance < give) {
      if (!allowPartial || env.balance <= 0) {
        if (allowPartial) return 0;
        throw new Error("Insufficient envelope balance");
      }
      give = env.balance;
    }
    bumpEnvelope(goal.source_envelope_id, -give);
  } else {
    const ready = getReady();
    if (ready < give) {
      if (!allowPartial || ready <= 0) {
        if (allowPartial) return 0;
        throw new Error("Insufficient Ready to Assign");
      }
      give = ready;
    }
    adjustReady(-give);
  }

  db.query("UPDATE goals SET funded = funded + ? WHERE id = ?").run(
    give,
    goalId
  );
  db.query(
    "INSERT INTO goal_contributions (goal_id, amount, date, note) VALUES (?, ?, ?, ?)"
  ).run(goalId, give, date, note);
  return give;
}

export function listContributions(goalId) {
  return db
    .query(
      `SELECT * FROM goal_contributions
       WHERE goal_id = ?
       ORDER BY date DESC, id DESC`
    )
    .all(goalId);
}

/** Goal envelopes = regular envelopes with a target_amount set. */
export function listGoalEnvelopes() {
  return db
    .query(
      `SELECT e.*, g.name AS group_name
       FROM envelopes e
       LEFT JOIN envelope_groups g ON g.id = e.group_id
       WHERE e.archived = 0 AND e.target_amount IS NOT NULL AND e.target_amount > 0
       ORDER BY e.target_date, e.name`
    )
    .all();
}

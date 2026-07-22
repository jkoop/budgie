import { db, adjustReady } from "../db.js";
import { todayISO } from "../money.js";

function bumpEnvelope(envelopeId, delta) {
  db.query("UPDATE envelopes SET balance = balance + ? WHERE id = ?").run(
    delta,
    envelopeId
  );
}

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

export function getGoal(id) {
  return db
    .query(
      `SELECT g.*, e.name AS source_envelope_name
       FROM goals g
       LEFT JOIN envelopes e ON e.id = g.source_envelope_id
       WHERE g.id = ?`
    )
    .get(id);
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

export function updateGoal(id, fields) {
  const row = db.query("SELECT * FROM goals WHERE id = ?").get(id);
  if (!row) throw new Error("Goal not found");
  db.query(
    `UPDATE goals SET
      name = ?, target_amount = ?, target_date = ?, source_envelope_id = ?,
      auto_amount = ?, cadence_kind = ?, cadence_interval = ?, cadence_day = ?,
      next_date = ?, active = ?
     WHERE id = ?`
  ).run(
    fields.name ?? row.name,
    fields.target_amount ?? row.target_amount,
    fields.target_date !== undefined ? fields.target_date || null : row.target_date,
    fields.source_envelope_id !== undefined
      ? fields.source_envelope_id || null
      : row.source_envelope_id,
    fields.auto_amount !== undefined ? fields.auto_amount : row.auto_amount,
    fields.cadence_kind !== undefined ? fields.cadence_kind : row.cadence_kind,
    fields.cadence_interval ?? row.cadence_interval,
    fields.cadence_day !== undefined ? fields.cadence_day : row.cadence_day,
    fields.next_date !== undefined ? fields.next_date || null : row.next_date,
    fields.active !== undefined ? (fields.active ? 1 : 0) : row.active,
    id
  );
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
    const ready = db
      .query("SELECT ready_to_assign FROM budget_meta WHERE id = 1")
      .get().ready_to_assign;
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

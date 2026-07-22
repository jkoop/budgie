import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";
import { runMigrations } from "./migrations.js";

const DB_PATH = process.env.BUDGIE_DB || join(import.meta.dir, "..", "data", "budgie.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

function seed() {
  const meta = db.query("SELECT id FROM budget_meta WHERE id = 1").get();
  if (!meta) {
    db.query("INSERT INTO budget_meta (id, ready_to_assign) VALUES (1, 0)").run();
  }

  const groupCount = db.query("SELECT COUNT(*) AS c FROM envelope_groups").get().c;
  if (groupCount === 0) {
    const insertGroup = db.query(
      "INSERT INTO envelope_groups (name, sort_order) VALUES (?, ?)"
    );
    insertGroup.run("Bills", 0);
    insertGroup.run("Everyday", 1);
    insertGroup.run("Savings", 2);

    const groups = db.query("SELECT id, name FROM envelope_groups").all();
    const byName = Object.fromEntries(groups.map((g) => [g.name, g.id]));
    const insertEnv = db.query(
      "INSERT INTO envelopes (name, group_id, sort_order) VALUES (?, ?, ?)"
    );
    insertEnv.run("Rent / Mortgage", byName.Bills, 0);
    insertEnv.run("Utilities", byName.Bills, 1);
    insertEnv.run("Groceries", byName.Everyday, 0);
    insertEnv.run("Transport", byName.Everyday, 1);
    insertEnv.run("Emergency Fund", byName.Savings, 0);

    db.query(
      "UPDATE envelopes SET target_amount = ?, target_date = date('now', '+12 months') WHERE name = ?"
    ).run(100000, "Emergency Fund");
  }

  const acctCount = db.query("SELECT COUNT(*) AS c FROM accounts").get().c;
  if (acctCount === 0) {
    db.query("INSERT INTO accounts (name, balance) VALUES (?, 0)").run("Chequing");
    db.query("INSERT INTO accounts (name, balance) VALUES (?, 0)").run("Savings");
  }
}

export function migrate() {
  runMigrations(db);
  seed();
}

export function getReady() {
  return db.query("SELECT ready_to_assign FROM budget_meta WHERE id = 1").get()
    .ready_to_assign;
}

export function setReady(cents) {
  db.query("UPDATE budget_meta SET ready_to_assign = ? WHERE id = 1").run(cents);
}

export function adjustReady(delta) {
  db.query(
    "UPDATE budget_meta SET ready_to_assign = ready_to_assign + ? WHERE id = 1"
  ).run(delta);
}

/** Wipe all rows and re-run migrate seeds. For tests only. */
export function resetDatabase() {
  db.exec("PRAGMA foreign_keys = OFF;");
  db.exec(`
    DELETE FROM goal_contributions;
    DELETE FROM goals;
    DELETE FROM allowance_rules;
    DELETE FROM income_schedules;
    DELETE FROM transactions;
    DELETE FROM imports;
    DELETE FROM envelopes;
    DELETE FROM envelope_groups;
    DELETE FROM accounts;
    DELETE FROM budget_meta;
  `);
  db.exec("PRAGMA foreign_keys = ON;");
  // Reset autoincrement sequences so ids stay predictable in tests
  try {
    db.exec(`
      DELETE FROM sqlite_sequence WHERE name IN (
        'accounts','envelopes','envelope_groups','transactions','imports',
        'income_schedules','allowance_rules','goals','goal_contributions'
      );
    `);
  } catch {
    // sqlite_sequence may not exist yet
  }
  migrate();
}

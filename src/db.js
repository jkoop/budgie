import { Database } from "bun:sqlite";
import { mkdirSync } from "fs";
import { dirname, join } from "path";

const DB_PATH = process.env.BUDGIE_DB || join(import.meta.dir, "..", "data", "budgie.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new Database(DB_PATH, { create: true });
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS budget_meta (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      ready_to_assign INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      ofx_account_id TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS envelope_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS envelopes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      group_id INTEGER REFERENCES envelope_groups(id) ON DELETE SET NULL,
      balance INTEGER NOT NULL DEFAULT 0,
      target_amount INTEGER,
      target_date TEXT,
      archived INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount INTEGER NOT NULL,
      payee TEXT,
      memo TEXT,
      account_id INTEGER REFERENCES accounts(id) ON DELETE CASCADE,
      envelope_id INTEGER REFERENCES envelopes(id) ON DELETE SET NULL,
      kind TEXT NOT NULL DEFAULT 'expense',
      transfer_pair_id INTEGER,
      import_fitid TEXT,
      import_id INTEGER,
      cleared INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(account_id, import_fitid)
    );

    CREATE TABLE IF NOT EXISTS income_schedules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      amount INTEGER NOT NULL,
      account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      payee TEXT,
      cadence_kind TEXT NOT NULL,
      cadence_interval INTEGER NOT NULL DEFAULT 1,
      cadence_day INTEGER,
      next_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS allowance_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      envelope_id INTEGER NOT NULL REFERENCES envelopes(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      cadence_kind TEXT NOT NULL,
      cadence_interval INTEGER NOT NULL DEFAULT 1,
      cadence_day INTEGER,
      next_date TEXT NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      last_shortfall INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      target_amount INTEGER NOT NULL,
      target_date TEXT,
      funded INTEGER NOT NULL DEFAULT 0,
      source_envelope_id INTEGER REFERENCES envelopes(id) ON DELETE SET NULL,
      auto_amount INTEGER,
      cadence_kind TEXT,
      cadence_interval INTEGER DEFAULT 1,
      cadence_day INTEGER,
      next_date TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS goal_contributions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      goal_id INTEGER NOT NULL REFERENCES goals(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      date TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      added INTEGER NOT NULL DEFAULT 0,
      skipped INTEGER NOT NULL DEFAULT 0,
      account_id INTEGER REFERENCES accounts(id) ON DELETE SET NULL
    );
  `);

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
    db.query("INSERT INTO accounts (name, balance) VALUES (?, 0)").run("Checking");
    db.query("INSERT INTO accounts (name, balance) VALUES (?, 0)").run("Savings");
  }
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

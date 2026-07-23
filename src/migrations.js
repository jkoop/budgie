/** @typedef {{ version: number; name: string; up: (db: import("bun:sqlite").Database) => void }} Migration */

/** @type {Migration[]} */
export const migrations = [
  {
    version: 1,
    name: "initial_schema",
    up(db) {
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

        CREATE INDEX IF NOT EXISTS idx_txn_date_id ON transactions(date DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_txn_account_date ON transactions(account_id, date DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_txn_envelope ON transactions(envelope_id);
        CREATE INDEX IF NOT EXISTS idx_txn_uncategorized ON transactions(kind, envelope_id);
        CREATE INDEX IF NOT EXISTS idx_income_due ON income_schedules(active, next_date);
        CREATE INDEX IF NOT EXISTS idx_allowance_due ON allowance_rules(active, next_date);
        CREATE INDEX IF NOT EXISTS idx_goals_autofund ON goals(active, next_date);
      `);
    },
  },
  {
    version: 2,
    name: "account_opening_balance",
    up(db) {
      db.exec(`
        ALTER TABLE accounts ADD COLUMN opening_balance INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE accounts ADD COLUMN opening_balance_date TEXT;
      `);
    },
  },
];

export function getUserVersion(db) {
  return db.query("PRAGMA user_version").get().user_version;
}

export function runMigrations(db) {
  let current = getUserVersion(db);
  for (const m of migrations) {
    if (m.version <= current) continue;
    if (m.version !== current + 1) {
      throw new Error(
        `Missing migration: database is at version ${current}, next expected ${current + 1}, found ${m.version} (${m.name})`
      );
    }
    db.transaction(() => {
      m.up(db);
      db.exec(`PRAGMA user_version = ${m.version}`);
    })();
    current = m.version;
  }
}

export const latestVersion = migrations.length
  ? migrations[migrations.length - 1].version
  : 0;

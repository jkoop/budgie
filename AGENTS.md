# Agent notes — Budgie

Single-user YNAB-style envelope budgeting. Bun + SQLite, zero npm deps, no build step, no auth/TLS.

## Layout

| Path | Role |
|------|------|
| `src/index.js` | Entry: `migrate()`, Bun server, **all routes inline** |
| `src/http.js` | Flash cookies, 303 redirects, body parsing, static files |
| `src/db.js` | SQLite open/migrate/seed, `ready_to_assign`, `resetDatabase()` |
| `src/migrations.js` | Versioned schema migrations (`PRAGMA user_version`) |
| `src/money.js` | Cents ↔ dollars, `todayISO()`, `escapeHtml()` |
| `src/services/` | Domain logic + SQL (`budget`, `schedules`, `goals`, `ofx`) |
| `src/views/` | HTML strings: `layout.js` shell, `pages.js` page bodies |
| `public/` | Static CSS (`/public/...`) |
| `test/` | Bun tests; `preload.js` points `BUDGIE_DB` at a temp file |
| `data/` | Host SQLite (`budgie.db`, gitignored) |

**Layers:** `index.js` matches URLs → services mutate DB → views render HTML. No JSON API. No separate router package.

## Request flow

1. `GET /public/*` → static file (path-traversal guarded).
2. Most requests call `schedules.tick(todayISO())` (debounced 2s; **skipped** for `/ledger/rows`).
3. Read flash cookie → GET renders page, or POST runs action then `redirect(303)` with flash.
4. Thrown errors become error-flash redirects (not 4xx/5xx HTML).

**POST → Redirect (PRG).** Always `redirect(path, { type, message })`. Pass `{ clearFlash: clearHeader }` into `html()` on GETs or the flash cookie sticks.

## Money & dates

- **All DB money is integer cents.** Convert at the HTTP boundary with `dollarsToCents()`. Never store dollar floats in SQL.
- Expenses are stored **negative**. `addExpense` accepts a positive amount and negates it.
- Form value attributes use `(cents / 100).toFixed(2)`; display uses `formatMoney` / `moneySpan`.
- Dates are `YYYY-MM-DD` strings. `todayISO()` is **local** timezone. ISO string compare works for schedules.

## Domain model (short)

```
OFX import → account ±
           → credit → Ready +
           → debit  → uncategorized (account only until categorized)
           → transfer → paired legs, no Ready/envelope impact

Assign: Ready → envelope
Move:   envelope ↔ envelope (no Ready)
Cover:  overspent envelope ← Ready (or another envelope)
```

- **Ready to Assign** lives in `budget_meta.ready_to_assign` (stored, not derived).
- Account total can diverge from Ready + envelopes while expenses stay uncategorized — that is intentional.
- **No manual “add transaction” UI.** Bank activity enters only via OFX/QFX import. Ledger POSTs are categorize/delete.
- Before import: set each account’s `ofx_account_id` (Accounts page) to match the file’s `ACCTID`.
- FITID dedupe: `UNIQUE(account_id, import_fitid)` — re-imports skip quietly.
- **Goal envelopes** = envelopes with `target_amount`. **Standalone goals** = `goals` table (separate `funded`).

## Schedules tick

Visiting almost any page can mutate the DB (income, allowances, auto-fund goals). Catch-up fires every missed period while `next_date <= today` (capped at 500). Allowances are **partial** (won’t drive Ready negative; shortfall recorded). Scheduled income is **full** amount.

## Migrations

Schema is versioned with SQLite **`PRAGMA user_version`** (not a custom table).

| Piece | Location |
|-------|----------|
| Migration list + runner | `src/migrations.js` — `migrations[]`, `runMigrations(db)`, `getUserVersion(db)` |
| Orchestration + seeds | `src/db.js` — `migrate()` = `runMigrations()` then `seed()` |

**Rules:**

- Each migration has sequential `version` (1, 2, 3…), `name`, and `up(db)`. Gaps throw.
- `up` runs **once** per database inside a transaction; then `user_version` is set.
- **Schema only in migrations** — DDL, indexes, `ALTER TABLE`. No default rows.
- **Seeds in `seed()`** — idempotent inserts when tables are empty (`budget_meta`, envelope groups, starter accounts). `resetDatabase()` wipes rows and re-runs `migrate()` so seeds repopulate; it does **not** reset `user_version`.
- Existing DBs at `user_version = 0` upgrade safely on next startup (migration 1 still uses `CREATE IF NOT EXISTS`).
- Do **not** put ad-hoc `CREATE TABLE` in `migrate()` — add a new numbered migration instead.

```js
// src/migrations.js — example migration 2
{
  version: 2,
  name: "add_notes_column",
  up(db) {
    db.exec("ALTER TABLE accounts ADD COLUMN notes TEXT;");
  },
},
```

## HTML / forms

- Full pages: `layout(title, body, { flash, active })`. HTMX partials (`ledgerRowsPartial`) — **no** layout.
- Escape user text with `escapeHtml`. Cadence UI: `cadenceFields()` + `parseCadenceFields(data)`.
- Checkboxes: `value="1"`; unchecked = field absent → treat as false.
- Import: `multipart/form-data`, `name="files"` (multiple).
- Ledger infinite scroll: `TXN_PAGE_SIZE = 50`, fetch `limit+1` for `hasMore`; HTMX from CDN in `layout.js`.

## Adding a feature

1. Add a numbered migration in `src/migrations.js` (`up` runs once per DB; bump `version` sequentially). Seed/default rows stay in `seed()` in `db.js`.
2. Logic in the right service (keep SQL out of `index.js` / views).
3. Route + `dollarsToCents` / flash redirect in `index.js`.
4. Page/partial in `views/pages.js`; nav key in `layout.js` if needed.
5. Tests next to existing suites; call `useCleanDb()` for DB tests.

## Tests

```bash
bun test
```

`bunfig.toml` preloads `test/preload.js` so tests never touch `data/budgie.db`. Pattern:

```js
import { useCleanDb, accountByName } from "./helpers.js";
useCleanDb();
import { ... } from "../src/services/...";
```

OFX fixtures use **cents** in `ofxFile({ amount: -1234 })` → TRNAMT `-12.34`. There are no full `Bun.serve` integration tests — hit services/views/http helpers directly. `resetDatabase()` is for tests only.

## Env / Docker

| Variable | Default | Notes |
|----------|---------|--------|
| `PORT` | `3000` | Host publish override: `PORT=8080 docker compose up` |
| `HOST` | `0.0.0.0` | Trusted networks only |
| `BUDGIE_DB` | `data/budgie.db` | Container: `/data/budgie.db` via `./data` mount |

## Gotchas

1. **Cents vs dollars** — 100× bugs if services take form strings without `dollarsToCents`.
2. **Tick side effects** — don’t assume a GET is read-only; don’t run tick on `/ledger/rows`.
3. **Backdated `next_date`** — can apply many periods in one tick.
4. **Flash must be cleared** — forget `clearFlash` and messages repeat.
5. **Import without OFX account ID** — fails until Accounts are configured.
6. **Do not add npm packages** unless asked; prefer Bun builtins (`bun:sqlite`, etc.).
7. **No multi-user / auth** — never invent tenancy or sessions.
8. **`.dockerignore` excludes `test/`** — image is runtime-only.
9. **Migrations vs seeds** — schema changes go in `src/migrations.js`; default rows stay in `seed()`. Never rely on re-running migration `up` to fix missing seed data.

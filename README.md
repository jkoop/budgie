# Budgie

Single-user, YNAB-style envelope budgeting for localhost / LAN. Built with Bun and SQLite.

## Features

- **Ready to Assign** pool — income lands here; you assign into envelopes
- **Full ledger** — income, expenses, transfers, categorization
- **Envelope allowances** — periodic auto-assign on arbitrary cadences
- **Scheduled income** — predictable paychecks (plus ad-hoc income anytime)
- **Goals** — goal envelopes (target on an envelope) and standalone goals with optional auto-fund
- **QFX/OFX import** — bank file upload with FITID dedupe

No TLS and no login — bind only on trusted networks.

## Requirements

- [Bun](https://bun.sh) 1.1+

## Run

```bash
cd budgie
bun start
```

Or with auto-reload:

```bash
bun run dev
```

Run the test suite:

```bash
bun test
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Environment

| Variable     | Default           | Description        |
|-------------|-------------------|--------------------|
| `PORT`      | `3000`            | HTTP port          |
| `HOST`      | `0.0.0.0`         | Bind address       |
| `BUDGIE_DB` | `data/budgie.db`  | SQLite database path |

## Quick start

1. Import `.qfx`/`.ofx` files (Import) — bank transactions only enter this way.
2. Assign Ready → envelopes on the Dashboard or Envelopes page.
3. Categorize uncategorized outflows in the Ledger.
4. Set envelope targets for goal envelopes, or create standalone goals under Goals.

## Data

SQLite file lives in `data/budgie.db` (created on first run, gitignored). Seed data includes Checking/Savings accounts and a few starter envelopes.

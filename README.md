# Budgie

Single-user, YNAB-style envelope budgeting for localhost / LAN. Built with Bun and SQLite.

## Features

- **Ready to Assign** pool — income lands here; you assign into envelopes
- **Full ledger** — income, expenses, transfers, categorization
- **Envelope allowances** — periodic auto-assign on arbitrary cadences
- **Scheduled income** — predictable paycheques (plus ad-hoc income anytime)
- **Goals** — goal envelopes (target on an envelope) and standalone goals with optional auto-fund
- **QFX/OFX import** — bank file upload with FITID dedupe

No TLS and no login — bind only on trusted networks.

## Quick start

### Docker

```bash
docker compose up -d --build
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000). SQLite data persists in `./data`.

```bash
docker compose down    # stop
docker compose logs -f # follow logs
```

### Bun (local)

Requires [Bun](https://bun.sh) 1.1+.

```bash
bun start
```

Or with auto-reload:

```bash
bun run dev
```

Open [http://127.0.0.1:3000](http://127.0.0.1:3000).

### First steps in the app

1. Import `.qfx`/`.ofx` files (Import) — bank transactions only enter this way.
2. Assign Ready → envelopes on the Dashboard or Envelopes page.
3. Categorize uncategorized outflows in the Ledger.
4. Set envelope targets for goal envelopes, or create standalone goals under Goals.

## Environment

| Variable     | Default           | Description        |
|-------------|-------------------|--------------------|
| `PORT`      | `3000`            | HTTP port          |
| `HOST`      | `0.0.0.0`         | Bind address       |
| `BUDGIE_DB` | `data/budgie.db`  | SQLite database path |

With Docker Compose, the database path inside the container is `/data/budgie.db` (mounted from `./data` on the host). Override the published port with `PORT=8080 docker compose up -d`.

## Data

SQLite file lives in `data/budgie.db` (created on first run, gitignored). Seed data includes Chequing/Savings accounts and a few starter envelopes.

## Tests

```bash
bun test
```

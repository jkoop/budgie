import { db, adjustReady, getReady } from "../db.js";
import { todayISO } from "../money.js";

function bumpAccount(accountId, delta) {
  db.query("UPDATE accounts SET balance = balance + ? WHERE id = ?").run(
    delta,
    accountId
  );
}

export function bumpEnvelope(envelopeId, delta) {
  db.query("UPDATE envelopes SET balance = balance + ? WHERE id = ?").run(
    delta,
    envelopeId
  );
}

export function listAccounts({ includeArchived = false } = {}) {
  if (includeArchived) {
    return db.query("SELECT * FROM accounts ORDER BY archived, name").all();
  }
  return db
    .query("SELECT * FROM accounts WHERE archived = 0 ORDER BY name")
    .all();
}

export function listGroups() {
  return db
    .query("SELECT * FROM envelope_groups ORDER BY sort_order, name")
    .all();
}

export function listEnvelopes({ includeArchived = false } = {}) {
  const rows = includeArchived
    ? db
        .query(
          `SELECT e.*, g.name AS group_name
           FROM envelopes e
           LEFT JOIN envelope_groups g ON g.id = e.group_id
           ORDER BY e.archived, g.sort_order, e.sort_order, e.name`
        )
        .all()
    : db
        .query(
          `SELECT e.*, g.name AS group_name
           FROM envelopes e
           LEFT JOIN envelope_groups g ON g.id = e.group_id
           WHERE e.archived = 0
           ORDER BY g.sort_order, e.sort_order, e.name`
        )
        .all();
  return rows;
}

export function envelopesByGroup() {
  const groups = listGroups();
  const envelopes = listEnvelopes();
  return groups.map((g) => ({
    ...g,
    envelopes: envelopes.filter((e) => e.group_id === g.id),
  }));
}

export function createAccount(name, ofxAccountId = null) {
  const r = db
    .query("INSERT INTO accounts (name, ofx_account_id) VALUES (?, ?)")
    .run(name, ofxAccountId || null);
  return r.lastInsertRowid;
}

export function updateAccount(id, { name, ofx_account_id, archived }) {
  const row = db.query("SELECT * FROM accounts WHERE id = ?").get(id);
  if (!row) throw new Error("Account not found");
  db.query(
    "UPDATE accounts SET name = ?, ofx_account_id = ?, archived = ? WHERE id = ?"
  ).run(
    name ?? row.name,
    ofx_account_id !== undefined ? ofx_account_id || null : row.ofx_account_id,
    archived !== undefined ? (archived ? 1 : 0) : row.archived,
    id
  );
}

export function createGroup(name) {
  const max = db
    .query("SELECT COALESCE(MAX(sort_order), -1) AS m FROM envelope_groups")
    .get().m;
  return db
    .query("INSERT INTO envelope_groups (name, sort_order) VALUES (?, ?)")
    .run(name, max + 1).lastInsertRowid;
}

export function createEnvelope({
  name,
  group_id,
  target_amount = null,
  target_date = null,
}) {
  const max = db
    .query(
      "SELECT COALESCE(MAX(sort_order), -1) AS m FROM envelopes WHERE group_id IS ?"
    )
    .get(group_id ?? null).m;
  return db
    .query(
      `INSERT INTO envelopes (name, group_id, target_amount, target_date, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(
      name,
      group_id || null,
      target_amount,
      target_date || null,
      max + 1
    ).lastInsertRowid;
}

export function updateEnvelope(
  id,
  { name, group_id, target_amount, target_date, archived }
) {
  const row = db.query("SELECT * FROM envelopes WHERE id = ?").get(id);
  if (!row) throw new Error("Envelope not found");
  db.query(
    `UPDATE envelopes SET
      name = ?,
      group_id = ?,
      target_amount = ?,
      target_date = ?,
      archived = ?
     WHERE id = ?`
  ).run(
    name ?? row.name,
    group_id !== undefined ? group_id || null : row.group_id,
    target_amount !== undefined ? target_amount : row.target_amount,
    target_date !== undefined ? target_date || null : row.target_date,
    archived !== undefined ? (archived ? 1 : 0) : row.archived,
    id
  );
}

/** Income: account up, Ready up. */
export function addIncome({
  account_id,
  amount,
  date = todayISO(),
  payee = null,
  memo = null,
  cleared = 1,
  import_fitid = null,
  import_id = null,
}) {
  if (amount <= 0) throw new Error("Income amount must be positive");
  const r = db
    .query(
      `INSERT INTO transactions
        (date, amount, payee, memo, account_id, envelope_id, kind, import_fitid, import_id, cleared)
       VALUES (?, ?, ?, ?, ?, NULL, 'income', ?, ?, ?)`
    )
    .run(
      date,
      amount,
      payee,
      memo,
      account_id,
      import_fitid,
      import_id,
      cleared ? 1 : 0
    );
  bumpAccount(account_id, amount);
  adjustReady(amount);
  return r.lastInsertRowid;
}

/** Expense: account down, envelope down (if categorized). */
export function addExpense({
  account_id,
  envelope_id,
  amount,
  date = todayISO(),
  payee = null,
  memo = null,
  cleared = 1,
  import_fitid = null,
  import_id = null,
}) {
  // amount should be negative for expenses in the ledger
  const signed = amount > 0 ? -amount : amount;
  if (signed >= 0) throw new Error("Expense amount must be negative");
  const r = db
    .query(
      `INSERT INTO transactions
        (date, amount, payee, memo, account_id, envelope_id, kind, import_fitid, import_id, cleared)
       VALUES (?, ?, ?, ?, ?, ?, 'expense', ?, ?, ?)`
    )
    .run(
      date,
      signed,
      payee,
      memo,
      account_id,
      envelope_id || null,
      import_fitid,
      import_id,
      cleared ? 1 : 0
    );
  bumpAccount(account_id, signed);
  if (envelope_id) bumpEnvelope(envelope_id, signed);
  return r.lastInsertRowid;
}

/** Assign Ready → envelope. */
export function assignToEnvelope(envelope_id, amount, { date = todayISO(), memo = null } = {}) {
  if (amount === 0) return;
  const env = db.query("SELECT id FROM envelopes WHERE id = ?").get(envelope_id);
  if (!env) throw new Error("Envelope not found");
  db.query(
    `INSERT INTO transactions
      (date, amount, payee, memo, account_id, envelope_id, kind, cleared)
     VALUES (?, ?, 'Assignment', ?, NULL, ?, 'assign', 1)`
  ).run(date, amount, memo, envelope_id);
  adjustReady(-amount);
  bumpEnvelope(envelope_id, amount);
}

/** Move between envelopes (no Ready impact). */
export function moveBetweenEnvelopes(from_id, to_id, amount, { date = todayISO() } = {}) {
  if (amount <= 0) throw new Error("Move amount must be positive");
  if (from_id === to_id) throw new Error("Cannot move to the same envelope");
  const from = db.query("SELECT id FROM envelopes WHERE id = ?").get(from_id);
  const to = db.query("SELECT id FROM envelopes WHERE id = ?").get(to_id);
  if (!from || !to) throw new Error("Envelope not found");
  db.query(
    `INSERT INTO transactions
      (date, amount, payee, memo, account_id, envelope_id, kind, cleared)
     VALUES (?, ?, 'Move', 'Move out', NULL, ?, 'move', 1)`
  ).run(date, -amount, from_id);
  db.query(
    `INSERT INTO transactions
      (date, amount, payee, memo, account_id, envelope_id, kind, cleared)
     VALUES (?, ?, 'Move', 'Move in', NULL, ?, 'move', 1)`
  ).run(date, amount, to_id);
  bumpEnvelope(from_id, -amount);
  bumpEnvelope(to_id, amount);
}

/** Cover overspend: move from Ready or another envelope into an overspent envelope. */
export function coverOverspend(envelope_id, from_envelope_id = null) {
  const env = db.query("SELECT * FROM envelopes WHERE id = ?").get(envelope_id);
  if (!env) throw new Error("Envelope not found");
  if (env.balance >= 0) throw new Error("Envelope is not overspent");
  const need = -env.balance;
  if (from_envelope_id) {
    moveBetweenEnvelopes(from_envelope_id, envelope_id, need);
  } else {
    assignToEnvelope(envelope_id, need, { memo: "Cover overspend" });
  }
}

/** Transfer between accounts — no Ready/envelope impact. */
export function transferAccounts(
  from_id,
  to_id,
  amount,
  {
    date = todayISO(),
    memo = null,
    payee = "Transfer",
    from_fitid = null,
    to_fitid = null,
    import_id = null,
  } = {}
) {
  if (amount <= 0) throw new Error("Transfer amount must be positive");
  if (from_id === to_id) throw new Error("Cannot transfer to the same account");
  const out = db
    .query(
      `INSERT INTO transactions
        (date, amount, payee, memo, account_id, envelope_id, kind,
         import_fitid, import_id, cleared)
       VALUES (?, ?, ?, ?, ?, NULL, 'transfer', ?, ?, 1)`
    )
    .run(date, -amount, payee, memo, from_id, from_fitid, import_id);
  const outId = out.lastInsertRowid;
  const inn = db
    .query(
      `INSERT INTO transactions
        (date, amount, payee, memo, account_id, envelope_id, kind,
         transfer_pair_id, import_fitid, import_id, cleared)
       VALUES (?, ?, ?, ?, ?, NULL, 'transfer', ?, ?, ?, 1)`
    )
    .run(date, amount, payee, memo, to_id, outId, to_fitid, import_id);
  db.query("UPDATE transactions SET transfer_pair_id = ? WHERE id = ?").run(
    inn.lastInsertRowid,
    outId
  );
  bumpAccount(from_id, -amount);
  bumpAccount(to_id, amount);
  return { outId, inId: inn.lastInsertRowid };
}

/** Find an imported transfer leg waiting for the other account's FITID. */
function findOpenTransferLeg(accountId, amount, date, otherAccountId) {
  return db
    .query(
      `SELECT t.* FROM transactions t
       JOIN transactions p ON p.id = t.transfer_pair_id
       WHERE t.account_id = ?
         AND t.kind = 'transfer'
         AND t.amount = ?
         AND t.date = ?
         AND t.import_fitid IS NULL
         AND p.account_id = ?
       ORDER BY t.id
       LIMIT 1`
    )
    .get(accountId, amount, date, otherAccountId);
}

/**
 * Detect a counterparty OFX account id in payee/memo text.
 * Matches Tangerine-style: "Completed transfer to … account 3038552770"
 * @param {string[]|null} linkedOfxIds optional cache of known OFX account ids
 */
export function detectTransferCounterparty(
  payee,
  memo,
  trntype = null,
  linkedOfxIds = null
) {
  const text = `${payee || ""} ${memo || ""}`;
  const looksLikeTransfer =
    /transfer|internet\s+withdrawal|internet\s+deposit|withdrawal\s+to|deposit\s+from|\bxfer\b/i.test(
      text
    ) ||
    (trntype && /^xfer$/i.test(trntype));
  if (!looksLikeTransfer) return null;

  const accountMatch = text.match(/account\s+(\d{4,})/i);
  if (accountMatch) return accountMatch[1];

  const linked =
    linkedOfxIds ||
    db
      .query(
        "SELECT ofx_account_id FROM accounts WHERE ofx_account_id IS NOT NULL AND ofx_account_id != ''"
      )
      .all()
      .map((row) => String(row.ofx_account_id));
  for (const id of linked) {
    if (id && text.includes(id)) return id;
  }
  return null;
}

function findAccountByOfxId(ofxId) {
  if (!ofxId) return null;
  return db
    .query("SELECT * FROM accounts WHERE ofx_account_id = ?")
    .get(ofxId);
}

export function categorizeTransaction(txnId, envelope_id) {
  const txn = db.query("SELECT * FROM transactions WHERE id = ?").get(txnId);
  if (!txn) throw new Error("Transaction not found");
  if (txn.kind === "assign" || txn.kind === "transfer" || txn.kind === "move") {
    throw new Error("Cannot categorize this transaction type");
  }
  if (!envelope_id) throw new Error("Envelope required");

  // Undo prior envelope / Ready effects, then re-apply to the new envelope.
  if (txn.amount > 0) {
    // Inflow currently in Ready (typical income) or already routed to an envelope.
    if (txn.envelope_id) {
      bumpEnvelope(txn.envelope_id, -txn.amount);
    } else {
      adjustReady(-txn.amount);
    }
    bumpEnvelope(envelope_id, txn.amount);
    db.query(
      "UPDATE transactions SET envelope_id = ?, kind = 'income' WHERE id = ?"
    ).run(envelope_id, txnId);
    return;
  }

  // Expense: remove old envelope impact if any, apply to new envelope.
  if (txn.envelope_id) {
    bumpEnvelope(txn.envelope_id, -txn.amount);
  }
  bumpEnvelope(envelope_id, txn.amount);
  db.query(
    "UPDATE transactions SET envelope_id = ?, kind = 'expense' WHERE id = ?"
  ).run(envelope_id, txnId);
}

/**
 * Import a raw bank txn.
 * Inter-account transfers (matched via memo account # → ofx_account_id) skip Ready.
 * Returns { skipped, transfer }.
 */
export function importBankTxn({
  account_id,
  amount,
  date,
  payee,
  memo,
  fitid,
  import_id,
  trntype = null,
  linkedOfxIds = null,
}) {
  const existing = db
    .query(
      "SELECT id FROM transactions WHERE account_id = ? AND import_fitid = ?"
    )
    .get(account_id, fitid);
  if (existing) return { skipped: true, transfer: false };
  if (!amount) return { skipped: true, transfer: false };

  const counterpartyOfx = detectTransferCounterparty(
    payee,
    memo,
    trntype,
    linkedOfxIds
  );
  if (counterpartyOfx) {
    const other = findAccountByOfxId(counterpartyOfx);
    if (other && other.id !== account_id) {
      const abs = Math.abs(amount);
      // Outflow from this account → transfer to other; inflow → from other
      const fromId = amount < 0 ? account_id : other.id;
      const toId = amount < 0 ? other.id : account_id;
      const thisSigned = amount;

      const open = findOpenTransferLeg(
        account_id,
        thisSigned,
        date,
        other.id
      );
      if (open) {
        db.query(
          `UPDATE transactions
           SET import_fitid = ?, import_id = ?,
               payee = COALESCE(?, payee),
               memo = COALESCE(?, memo)
           WHERE id = ?`
        ).run(fitid, import_id, payee, memo, open.id);
        return { skipped: false, transfer: true, linked: true };
      }

      transferAccounts(fromId, toId, abs, {
        date,
        payee: payee || "Transfer",
        memo,
        from_fitid: amount < 0 ? fitid : null,
        to_fitid: amount > 0 ? fitid : null,
        import_id,
      });
      return { skipped: false, transfer: true, linked: false };
    }
  }

  if (amount > 0) {
    addIncome({
      account_id,
      amount,
      date,
      payee,
      memo,
      import_fitid: fitid,
      import_id,
      cleared: 1,
    });
  } else {
    addExpense({
      account_id,
      envelope_id: null,
      amount,
      date,
      payee,
      memo,
      import_fitid: fitid,
      import_id,
      cleared: 1,
    });
  }
  return { skipped: false, transfer: false };
}

const TRANSFER_LINK_MAX_DAYS = 7;

function isTransferLinkable(txn) {
  return (
    txn &&
    (txn.kind === "income" || txn.kind === "expense") &&
    txn.envelope_id == null
  );
}

function daysApart(isoA, isoB) {
  const a = new Date(`${isoA}T00:00:00`);
  const b = new Date(`${isoB}T00:00:00`);
  return Math.abs(a - b) / 86400000;
}

function reverseLinkableTransactionEffects(txn) {
  if (txn.kind === "income") {
    bumpAccount(txn.account_id, -txn.amount);
    adjustReady(-txn.amount);
  } else if (txn.kind === "expense") {
    bumpAccount(txn.account_id, -txn.amount);
  } else {
    throw new Error("Cannot link this transaction type");
  }
}

/** Match imported income/expense legs that can be linked as a transfer. */
export function listTransferLinkCandidates(txnId) {
  const txn = db.query("SELECT * FROM transactions WHERE id = ?").get(txnId);
  if (!isTransferLinkable(txn)) return [];
  return db
    .query(
      `SELECT t.*, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.id != ?
         AND t.account_id != ?
         AND t.amount = ?
         AND t.kind IN ('income', 'expense')
         AND t.envelope_id IS NULL
       ORDER BY t.date DESC, t.id DESC`
    )
    .all(txnId, txn.account_id, -txn.amount)
    .filter((c) => daysApart(c.date, txn.date) <= TRANSFER_LINK_MAX_DAYS)
    .slice(0, 15);
}

/** Build candidate lists for a page of ledger rows (one pool query). */
export function transferLinkCandidatesByTxnId(transactions) {
  const linkable = transactions.filter(isTransferLinkable);
  if (!linkable.length) return new Map();

  const pool = db
    .query(
      `SELECT t.*, a.name AS account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       WHERE t.kind IN ('income', 'expense') AND t.envelope_id IS NULL`
    )
    .all();

  const map = new Map();
  for (const txn of linkable) {
    const matches = pool
      .filter(
        (c) =>
          c.id !== txn.id &&
          c.account_id !== txn.account_id &&
          c.amount === -txn.amount &&
          daysApart(c.date, txn.date) <= TRANSFER_LINK_MAX_DAYS
      )
      .slice(0, 15);
    if (matches.length) map.set(txn.id, matches);
  }
  return map;
}

/**
 * Convert two offsetting imported legs into a linked transfer pair.
 * Undoes Ready/envelope effects from income/expense, then re-applies account-only bumps.
 */
export function linkTransactionsAsTransfer(txnId, otherTxnId) {
  if (txnId === otherTxnId) {
    throw new Error("Cannot link a transaction to itself");
  }
  const a = db.query("SELECT * FROM transactions WHERE id = ?").get(txnId);
  const b = db.query("SELECT * FROM transactions WHERE id = ?").get(otherTxnId);
  if (!a || !b) throw new Error("Transaction not found");
  if (!isTransferLinkable(a) || !isTransferLinkable(b)) {
    throw new Error("Only uncategorized income or expense can be linked");
  }
  if (a.account_id === b.account_id) {
    throw new Error("Transfers must be between different accounts");
  }
  if (a.amount + b.amount !== 0) {
    throw new Error("Amounts must offset");
  }
  if (daysApart(a.date, b.date) > TRANSFER_LINK_MAX_DAYS) {
    throw new Error("Transaction dates are too far apart");
  }

  const out = a.amount < 0 ? a : b;
  const inn = a.amount > 0 ? a : b;

  reverseLinkableTransactionEffects(out);
  reverseLinkableTransactionEffects(inn);

  db.query(
    "UPDATE transactions SET kind = 'transfer', envelope_id = NULL WHERE id IN (?, ?)"
  ).run(out.id, inn.id);
  db.query("UPDATE transactions SET transfer_pair_id = ? WHERE id = ?").run(
    inn.id,
    out.id
  );
  db.query("UPDATE transactions SET transfer_pair_id = ? WHERE id = ?").run(
    out.id,
    inn.id
  );

  bumpAccount(out.account_id, out.amount);
  bumpAccount(inn.account_id, inn.amount);
}

/** Single ledger row (same shape as listTransactions). */
export function getLedgerTransaction(id) {
  return db
    .query(
      `SELECT t.*, a.name AS account_name, e.name AS envelope_name,
              tpa.name AS transfer_account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN envelopes e ON e.id = t.envelope_id
       LEFT JOIN transactions tp ON tp.id = t.transfer_pair_id
       LEFT JOIN accounts tpa ON tpa.id = tp.account_id
       WHERE t.id = ?`
    )
    .get(id);
}

export function listTransactions({
  account_id,
  envelope_id,
  uncategorized,
  from,
  to,
  limit = 200,
  offset = 0,
} = {}) {
  const clauses = [];
  const params = [];
  if (account_id) {
    clauses.push("t.account_id = ?");
    params.push(account_id);
  }
  if (envelope_id) {
    clauses.push("t.envelope_id = ?");
    params.push(envelope_id);
  }
  if (uncategorized) {
    clauses.push("t.kind = 'expense' AND t.envelope_id IS NULL");
  }
  if (from) {
    clauses.push("t.date >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("t.date <= ?");
    params.push(to);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit, offset);
  return db
    .query(
      `SELECT t.*, a.name AS account_name, e.name AS envelope_name,
              tpa.name AS transfer_account_name
       FROM transactions t
       LEFT JOIN accounts a ON a.id = t.account_id
       LEFT JOIN envelopes e ON e.id = t.envelope_id
       LEFT JOIN transactions tp ON tp.id = t.transfer_pair_id
       LEFT JOIN accounts tpa ON tpa.id = tp.account_id
       ${where}
       ORDER BY t.date DESC, t.id DESC
       LIMIT ? OFFSET ?`
    )
    .all(...params);
}

export function deleteTransaction(id) {
  const txn = db.query("SELECT * FROM transactions WHERE id = ?").get(id);
  if (!txn) throw new Error("Transaction not found");

  if (txn.kind === "transfer" && txn.transfer_pair_id) {
    const pair = db
      .query("SELECT * FROM transactions WHERE id = ?")
      .get(txn.transfer_pair_id);
    if (pair) {
      bumpAccount(pair.account_id, -pair.amount);
      db.query("DELETE FROM transactions WHERE id = ?").run(pair.id);
    }
  }

  if (txn.kind === "income") {
    bumpAccount(txn.account_id, -txn.amount);
    if (txn.envelope_id) {
      bumpEnvelope(txn.envelope_id, -txn.amount);
    } else {
      adjustReady(-txn.amount);
    }
  } else if (txn.kind === "expense") {
    bumpAccount(txn.account_id, -txn.amount);
    if (txn.envelope_id) bumpEnvelope(txn.envelope_id, -txn.amount);
  } else if (txn.kind === "assign") {
    adjustReady(txn.amount);
    bumpEnvelope(txn.envelope_id, -txn.amount);
  } else if (txn.kind === "move") {
    bumpEnvelope(txn.envelope_id, -txn.amount);
  } else if (txn.kind === "transfer") {
    bumpAccount(txn.account_id, -txn.amount);
  }

  db.query("DELETE FROM transactions WHERE id = ?").run(id);
}

/** Snap Ready to cash in accounts not held in envelopes (after OFX import). */
export function reconcileReadyFromAccounts() {
  const accountTotal = db
    .query("SELECT COALESCE(SUM(balance), 0) AS s FROM accounts WHERE archived = 0")
    .get().s;
  const envelopeTotal = db
    .query(
      "SELECT COALESCE(SUM(balance), 0) AS s FROM envelopes WHERE archived = 0"
    )
    .get().s;
  const ready = accountTotal - envelopeTotal;
  db.query("UPDATE budget_meta SET ready_to_assign = ? WHERE id = 1").run(ready);
  return ready;
}

export function dashboardStats() {
  const ready = getReady();
  const accountTotal = db
    .query("SELECT COALESCE(SUM(balance), 0) AS s FROM accounts WHERE archived = 0")
    .get().s;
  const envelopeTotal = db
    .query(
      "SELECT COALESCE(SUM(balance), 0) AS s FROM envelopes WHERE archived = 0"
    )
    .get().s;
  const uncategorized = db
    .query(
      "SELECT COUNT(*) AS c FROM transactions WHERE kind = 'expense' AND envelope_id IS NULL"
    )
    .get().c;
  return { ready, accountTotal, envelopeTotal, uncategorized };
}

export { getReady };

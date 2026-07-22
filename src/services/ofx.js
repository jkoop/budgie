import { db } from "../db.js";
import { importBankTxn } from "./budget.js";

/**
 * Minimal SGML/XML OFX/QFX parser for bank statement transactions.
 * Handles common bank export quirks (SGML tags without closers).
 */

function stripHeaders(text) {
  const idx = text.search(/<OFX>/i);
  if (idx === -1) return text;
  return text.slice(idx);
}

function tagValue(block, tag) {
  // Prefer closed XML form
  const closed = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i");
  const m1 = block.match(closed);
  if (m1) return m1[1].trim();

  // SGML: value on same line as the tag
  const sgml = new RegExp(`<${tag}>([^\\r\\n<]*)`, "i");
  const m2 = block.match(sgml);
  if (m2) {
    const sameLine = m2[1].trim();
    if (sameLine) return sameLine;
    // Common Quicken/bank quirk: value alone on the following line
    const after = block.slice(m2.index + m2[0].length);
    const next = after.match(/^\s*([^<\r\n]+)/);
    if (next) return next[1].trim();
  }
  return null;
}

function parseOfxDate(raw) {
  if (!raw) return null;
  // YYYYMMDD or YYYYMMDDHHMMSS[.XXX][±tz]
  const m = String(raw).match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function parseAmount(raw) {
  if (raw == null || raw === "") return null;
  let s = String(raw).trim().replace(/[$,\s]/g, "");
  if (!s) return null;

  // Trailing sign: 12.34- / 12.34+
  let neg = false;
  if (/[-]$/.test(s)) {
    neg = true;
    s = s.slice(0, -1);
  } else if (/[+]$/.test(s)) {
    s = s.slice(0, -1);
  }
  // Parentheses: (12.34)
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("+")) s = s.slice(1);
  if (s.startsWith("-")) {
    neg = !neg;
    s = s.slice(1);
  }

  const n = Number.parseFloat(s);
  if (Number.isNaN(n)) return null;
  const cents = Math.round(n * 100);
  return neg ? -cents : cents;
}

export function parseOfx(text) {
  const body = stripHeaders(text);
  const accountId =
    tagValue(body, "ACCTID") ||
    tagValue(body, "ACCOUNTID") ||
    null;

  const bankId = tagValue(body, "BANKID");
  const acctType = tagValue(body, "ACCTTYPE");

  const txns = [];
  const blocks = [];

  // Collect STMTTRN blocks — closed XML or unclosed SGML
  if (/<\/STMTTRN>/i.test(body)) {
    const parts = body.split(/<STMTTRN>/i).slice(1);
    for (const part of parts) {
      const end = part.search(/<\/STMTTRN>/i);
      blocks.push(end === -1 ? part : part.slice(0, end));
    }
  } else {
    const parts = body.split(/<STMTTRN>/i).slice(1);
    for (const part of parts) {
      const end = part.search(/<(STMTTRN|\/BANKTRANLIST|\/STMTRS|\/OFX)/i);
      blocks.push(end === -1 ? part : part.slice(0, end));
    }
  }

  for (const block of blocks) {
    const fitid = tagValue(block, "FITID");
    const amount = parseAmount(tagValue(block, "TRNAMT"));
    const date =
      parseOfxDate(tagValue(block, "DTPOSTED")) ||
      parseOfxDate(tagValue(block, "DTUSER"));
    const payee =
      tagValue(block, "NAME") ||
      tagValue(block, "PAYEE") ||
      tagValue(block, "MEMO") ||
      "Imported";
    const memo = tagValue(block, "MEMO");
    const trntype = tagValue(block, "TRNTYPE");
    if (!fitid || !date || amount == null || amount === 0) continue;
    txns.push({ fitid, amount, date, payee, memo, trntype });
  }

  return {
    accountId,
    bankId,
    acctType,
    transactions: txns,
  };
}

function resolveAccount(ofxAccountId, preferredAccountId) {
  if (!ofxAccountId) {
    throw new Error("OFX/QFX file has no account ID (ACCTID)");
  }

  if (preferredAccountId) {
    const account = db
      .query("SELECT * FROM accounts WHERE id = ?")
      .get(preferredAccountId);
    if (!account) throw new Error("Account not found");

    if (account.ofx_account_id && account.ofx_account_id !== ofxAccountId) {
      throw new Error(
        `File is for OFX account ${ofxAccountId}, but “${account.name}” is linked to ${account.ofx_account_id}`
      );
    }

    if (!account.ofx_account_id) {
      const taken = db
        .query(
          "SELECT * FROM accounts WHERE ofx_account_id = ? AND id != ?"
        )
        .get(ofxAccountId, account.id);
      if (taken) {
        throw new Error(
          `File OFX account ${ofxAccountId} is already linked to “${taken.name}”`
        );
      }
      db.query("UPDATE accounts SET ofx_account_id = ? WHERE id = ?").run(
        ofxAccountId,
        account.id
      );
      account.ofx_account_id = ofxAccountId;
    }

    return account;
  }

  const byOfx = db
    .query("SELECT * FROM accounts WHERE ofx_account_id = ?")
    .get(ofxAccountId);
  if (!byOfx) {
    throw new Error(
      `No account linked to OFX ID ${ofxAccountId}. Choose the matching account (or set its OFX account id first).`
    );
  }
  return byOfx;
}

export function importOfxFile(filename, text, preferredAccountId = null) {
  const parsed = parseOfx(text);
  const account = resolveAccount(parsed.accountId, preferredAccountId);

  const imp = db
    .query(
      "INSERT INTO imports (filename, added, skipped, account_id) VALUES (?, 0, 0, ?)"
    )
    .run(filename, account.id);
  const importId = imp.lastInsertRowid;

  let added = 0;
  let skipped = 0;
  let errors = 0;
  let transfers = 0;
  for (const t of parsed.transactions) {
    try {
      const result = importBankTxn({
        account_id: account.id,
        amount: t.amount,
        date: t.date,
        payee: t.payee,
        memo: t.memo,
        fitid: t.fitid,
        import_id: importId,
        trntype: t.trntype,
      });
      if (result.skipped) skipped++;
      else {
        added++;
        if (result.transfer) transfers++;
      }
    } catch (err) {
      errors++;
      console.error(`OFX import skipped FITID ${t.fitid}:`, err.message);
    }
  }

  db.query("UPDATE imports SET added = ?, skipped = ? WHERE id = ?").run(
    added,
    skipped + errors,
    importId
  );

  return {
    importId,
    account,
    ofxAccountId: parsed.accountId,
    added,
    skipped,
    errors,
    transfers,
    total: parsed.transactions.length,
  };
}

export function listImports() {
  return db
    .query(
      `SELECT i.*, a.name AS account_name
       FROM imports i
       LEFT JOIN accounts a ON a.id = i.account_id
       ORDER BY i.imported_at DESC
       LIMIT 50`
    )
    .all();
}

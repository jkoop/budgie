import { dollarsToCents } from "../money.js";
import { db } from "../db.js";
import { importBankTxn, reconcileReadyFromAccounts, applyOpeningBalanceFromLedger } from "./budget.js";

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
  if (raw == null || String(raw).trim() === "") return null;
  return dollarsToCents(raw);
}

function parseLedgerBal(body) {
  const m = body.match(/<LEDGERBAL>[\s\S]*?(?:<\/LEDGERBAL>|(?=<\/\w))/i);
  if (!m) return null;
  const block = m[0];
  const amount = parseAmount(tagValue(block, "BALAMT"));
  const date = parseOfxDate(tagValue(block, "DTASOF"));
  if (amount == null) return null;
  return { amount, date };
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
    ledgerBal: parseLedgerBal(body),
    transactions: txns,
  };
}

function resolveAccount(ofxAccountId) {
  if (!ofxAccountId) {
    throw new Error("OFX/QFX file has no account ID (ACCTID)");
  }

  const byOfx = db
    .query("SELECT * FROM accounts WHERE ofx_account_id = ?")
    .get(ofxAccountId);
  if (!byOfx) {
    throw new Error(
      `No account linked to OFX ID ${ofxAccountId}. Set the account’s OFX account id on the Accounts page first.`
    );
  }
  return byOfx;
}

export function importOfxFile(filename, text) {
  const parsed = parseOfx(text);
  const account = resolveAccount(parsed.accountId);

  const linkedOfxIds = db
    .query(
      "SELECT ofx_account_id FROM accounts WHERE ofx_account_id IS NOT NULL AND ofx_account_id != ''"
    )
    .all()
    .map((row) => String(row.ofx_account_id));

  return db.transaction(() => {
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
          linkedOfxIds,
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

    reconcileReadyFromAccounts();

    if (parsed.ledgerBal) {
      applyOpeningBalanceFromLedger(account.id, parsed.ledgerBal);
      reconcileReadyFromAccounts();
    }

    return {
      importId,
      account,
      ofxAccountId: parsed.accountId,
      added,
      skipped,
      errors,
      transfers,
      total: parsed.transactions.length,
      ledgerBal: parsed.ledgerBal,
    };
  })();
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

import { beforeEach } from "bun:test";
import { migrate, resetDatabase, db, getReady } from "../src/db.js";

migrate();

/** Call once at the top of each test file that uses the DB. */
export function useCleanDb() {
  beforeEach(() => {
    resetDatabase();
  });
}

export function accountByName(name) {
  return db.query("SELECT * FROM accounts WHERE name = ?").get(name);
}

export function envelopeByName(name) {
  return db.query("SELECT * FROM envelopes WHERE name = ?").get(name);
}

export function setOfxIds(map) {
  for (const [name, ofxId] of Object.entries(map)) {
    db.query("UPDATE accounts SET ofx_account_id = ? WHERE name = ?").run(
      ofxId,
      name
    );
  }
}

export function ofxFile({ accountId, transactions, ledgerBal }) {
  const txns = transactions
    .map(
      (t) => `<STMTTRN>
<TRNTYPE>${t.trntype || (t.amount < 0 ? "DEBIT" : "CREDIT")}
<DTPOSTED>${t.date.replace(/-/g, "")}120000.000
<TRNAMT>${(t.amount / 100).toFixed(2)}
<FITID>${t.fitid}
<NAME>${t.payee || "Payee"}
${t.memo != null ? `<MEMO>${t.memo}` : ""}
</STMTTRN>`
    )
    .join("");

  const ledger =
    ledgerBal != null
      ? `<LEDGERBAL>
<BALAMT>${(ledgerBal.amount / 100).toFixed(2)}
<DTASOF>${(ledgerBal.date || "2026-07-01").replace(/-/g, "")}
</LEDGERBAL>`
      : "";

  return `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
<BANKMSGSRSV1>
<STMTTRNRS>
<STMTRS>
<BANKACCTFROM>
<BANKID>000000000
<ACCTID>${accountId}
<ACCTTYPE>CHECKING
</BANKACCTFROM>
${ledger}
<BANKTRANLIST>
${txns}
</BANKTRANLIST>
</STMTRS>
</STMTTRNRS>
</BANKMSGSRSV1>
</OFX>`;
}

export { db, getReady, resetDatabase };

import { describe, expect, test } from "bun:test";
import {
  accountByName,
  envelopeByName,
  getReady,
  ofxFile,
  setOfxIds,
  db,
  useCleanDb,
} from "./helpers.js";

useCleanDb();
import { parseOfx, importOfxFile } from "../src/services/ofx.js";
import {
  detectTransferCounterparty,
  categorizeTransaction,
  listTransactions,
} from "../src/services/budget.js";
import { updateAccount } from "../src/services/budget.js";

describe("parseOfx", () => {
  test("parses SGML with same-line amounts", () => {
    const text = ofxFile({
      accountId: "111",
      transactions: [
        {
          fitid: "A1",
          amount: -1234,
          date: "2026-07-15",
          payee: "Coffee",
          memo: "Latte",
        },
        {
          fitid: "A2",
          amount: 5000,
          date: "2026-07-10",
          payee: "Refund",
        },
      ],
    });
    const parsed = parseOfx(text);
    expect(parsed.accountId).toBe("111");
    expect(parsed.transactions).toHaveLength(2);
    expect(parsed.transactions[0].amount).toBe(-1234);
    expect(parsed.transactions[1].amount).toBe(5000);
  });

  test("parses amounts on the following line", () => {
    const text = `<OFX>
<BANKACCTFROM>
<ACCTID>999
</BANKACCTFROM>
<BANKTRANLIST>
<STMTTRN>
<DTPOSTED>20260715
<TRNAMT>
-12.34
<FITID>NL1
<NAME>Shop
</STMTTRN>
</BANKTRANLIST>
</OFX>`;
    const parsed = parseOfx(text);
    expect(parsed.transactions[0].amount).toBe(-1234);
  });

  test("parses trailing-minus amounts", () => {
    const text = `<OFX>
<ACCTID>1
<STMTTRN>
<DTPOSTED>20260715
<TRNAMT>9.99-
<FITID>T1
<NAME>X
</STMTTRN>
</OFX>`;
    expect(parseOfx(text).transactions[0].amount).toBe(-999);
  });

  test("skips zero / missing amount rows", () => {
    const text = `<OFX>
<ACCTID>1
<STMTTRN>
<DTPOSTED>20260715
<TRNAMT>0.00
<FITID>Z1
<NAME>Zero
</STMTTRN>
</OFX>`;
    expect(parseOfx(text).transactions).toHaveLength(0);
  });
});

describe("detectTransferCounterparty", () => {
  test("extracts Tangerine-style account numbers", () => {
    expect(
      detectTransferCounterparty(
        "Internet Withdrawal to Tangerine",
        "Completed transfer to Tangerine SAV account 3038552770 ~ Internet Withdrawal"
      )
    ).toBe("3038552770");
  });

  test("returns null for ordinary spend", () => {
    expect(
      detectTransferCounterparty("COFFEE SHOP", "Latte")
    ).toBeNull();
  });
});

describe("importOfxFile", () => {
  test("auto-matches account by OFX id", () => {
    setOfxIds({ Checking: "111", Savings: "222" });
    const text = ofxFile({
      accountId: "222",
      transactions: [
        { fitid: "S1", amount: 2500, date: "2026-07-01", payee: "In" },
      ],
    });
    const result = importOfxFile("s.ofx", text, null);
    expect(result.account.name).toBe("Savings");
    expect(result.added).toBe(1);
    expect(accountByName("Savings").balance).toBe(2500);
    expect(getReady()).toBe(2500);
  });

  test("rejects account mismatch", () => {
    setOfxIds({ Checking: "111", Savings: "222" });
    const text = ofxFile({
      accountId: "111",
      transactions: [
        { fitid: "C1", amount: -100, date: "2026-07-01", payee: "X" },
      ],
    });
    expect(() =>
      importOfxFile("c.ofx", text, accountByName("Savings").id)
    ).toThrow(/linked to 222/);
  });

  test("rejects unknown OFX id on auto-match", () => {
    setOfxIds({ Checking: "111" });
    const text = ofxFile({
      accountId: "999",
      transactions: [
        { fitid: "X1", amount: -100, date: "2026-07-01", payee: "X" },
      ],
    });
    expect(() => importOfxFile("x.ofx", text, null)).toThrow(
      /No account linked/
    );
  });

  test("dedupes on re-import", () => {
    setOfxIds({ Checking: "111" });
    const text = ofxFile({
      accountId: "111",
      transactions: [
        { fitid: "D1", amount: -500, date: "2026-07-01", payee: "Shop" },
      ],
    });
    expect(importOfxFile("a.ofx", text, null).added).toBe(1);
    const again = importOfxFile("a.ofx", text, null);
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(1);
  });

  test("inflows go to Ready; outflows stay uncategorized", () => {
    setOfxIds({ Checking: "111" });
    const text = ofxFile({
      accountId: "111",
      transactions: [
        { fitid: "I1", amount: 10000, date: "2026-07-01", payee: "Pay" },
        { fitid: "E1", amount: -2500, date: "2026-07-02", payee: "Shop" },
      ],
    });
    importOfxFile("mix.ofx", text, null);
    expect(getReady()).toBe(10000);
    const uncat = listTransactions({ uncategorized: true });
    expect(uncat).toHaveLength(1);
    expect(uncat[0].payee).toBe("Shop");
  });

  test("recognizes inter-account transfers without touching Ready", () => {
    setOfxIds({ Checking: "4016809895", Savings: "3038552770" });
    const text = ofxFile({
      accountId: "4016809895",
      transactions: [
        {
          fitid: "13",
          amount: -170000,
          date: "2022-09-23",
          payee: "Internet Withdrawal to Tangerine",
          memo: "Completed transfer to Tangerine SAV account 3038552770 ~ Internet Withdrawal",
        },
        {
          fitid: "99",
          amount: -2500,
          date: "2022-09-23",
          payee: "COFFEE",
          memo: "Latte",
        },
      ],
    });
    const result = importOfxFile("xfer.ofx", text, null);
    expect(result.transfers).toBe(1);
    expect(result.added).toBe(2);
    expect(getReady()).toBe(0);
    expect(accountByName("Checking").balance).toBe(-172500);
    expect(accountByName("Savings").balance).toBe(170000);

    const xfer = db
      .query("SELECT * FROM transactions WHERE kind = 'transfer' ORDER BY id")
      .all();
    expect(xfer).toHaveLength(2);
    expect(xfer[0].amount).toBe(-170000);
    expect(xfer[1].amount).toBe(170000);
  });

  test("links opposite transfer leg on second-account import", () => {
    setOfxIds({ Checking: "4016809895", Savings: "3038552770" });
    const out = ofxFile({
      accountId: "4016809895",
      transactions: [
        {
          fitid: "OUT1",
          amount: -50000,
          date: "2026-07-01",
          payee: "Internet Withdrawal to Tangerine",
          memo: "Completed transfer to Tangerine SAV account 3038552770 ~ Internet Withdrawal",
        },
      ],
    });
    importOfxFile("out.ofx", out, null);

    const inn = ofxFile({
      accountId: "3038552770",
      transactions: [
        {
          fitid: "IN1",
          amount: 50000,
          date: "2026-07-01",
          payee: "Internet Deposit from Tangerine",
          memo: "Completed transfer from Tangerine DDA account 4016809895 ~ Internet Deposit",
        },
      ],
    });
    const result = importOfxFile("in.ofx", inn, null);
    expect(result.transfers).toBe(1);
    expect(accountByName("Checking").balance).toBe(-50000);
    expect(accountByName("Savings").balance).toBe(50000);
    expect(getReady()).toBe(0);

    const legs = db
      .query(
        "SELECT import_fitid FROM transactions WHERE kind = 'transfer' ORDER BY id"
      )
      .all();
    expect(legs.map((l) => l.import_fitid)).toEqual(["OUT1", "IN1"]);
  });

  test("binds OFX id when importing into account that has none yet", () => {
    // Checking has no ofx id after reset
    updateAccount(accountByName("Checking").id, { ofx_account_id: null });
    updateAccount(accountByName("Savings").id, { ofx_account_id: "222" });
    const text = ofxFile({
      accountId: "555",
      transactions: [
        { fitid: "B1", amount: 100, date: "2026-07-01", payee: "X" },
      ],
    });
    importOfxFile("bind.ofx", text, accountByName("Checking").id);
    expect(accountByName("Checking").ofx_account_id).toBe("555");
  });

  test("categorize after import", () => {
    setOfxIds({ Checking: "111" });
    const text = ofxFile({
      accountId: "111",
      transactions: [
        { fitid: "C1", amount: -4000, date: "2026-07-01", payee: "Store" },
      ],
    });
    importOfxFile("e.ofx", text, null);
    const txn = listTransactions({ uncategorized: true })[0];
    categorizeTransaction(txn.id, envelopeByName("Groceries").id);
    expect(envelopeByName("Groceries").balance).toBe(-4000);
    expect(listTransactions({ uncategorized: true })).toHaveLength(0);
  });
});

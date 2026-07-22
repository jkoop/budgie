import { describe, expect, test } from "bun:test";
import {
  accountByName,
  envelopeByName,
  getReady,
  db,
  useCleanDb,
} from "./helpers.js";

useCleanDb();
import {
  addExpense,
  addIncome,
  assignToEnvelope,
  categorizeTransaction,
  coverOverspend,
  deleteTransaction,
  importBankTxn,
  listTransactions,
  moveBetweenEnvelopes,
  transferAccounts,
  updateEnvelope,
} from "../src/services/budget.js";

describe("YNAB core flow", () => {
  test("income increases Ready and account balance", () => {
    const checking = accountByName("Checking");
    addIncome({
      account_id: checking.id,
      amount: 250000,
      date: "2026-07-01",
      payee: "Employer",
    });
    expect(getReady()).toBe(250000);
    expect(accountByName("Checking").balance).toBe(250000);
  });

  test("assign moves Ready into an envelope", () => {
    const checking = accountByName("Checking");
    const groceries = envelopeByName("Groceries");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    assignToEnvelope(groceries.id, 4000);
    expect(getReady()).toBe(6000);
    expect(envelopeByName("Groceries").balance).toBe(4000);
  });

  test("expense decreases account and envelope", () => {
    const checking = accountByName("Checking");
    const groceries = envelopeByName("Groceries");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    assignToEnvelope(groceries.id, 5000);
    addExpense({
      account_id: checking.id,
      envelope_id: groceries.id,
      amount: 1250,
      date: "2026-07-02",
      payee: "Store",
    });
    expect(accountByName("Checking").balance).toBe(8750);
    expect(envelopeByName("Groceries").balance).toBe(3750);
    expect(getReady()).toBe(5000);
  });

  test("uncategorized expense hits account but not envelopes or Ready", () => {
    const checking = accountByName("Checking");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    addExpense({
      account_id: checking.id,
      envelope_id: null,
      amount: 2000,
      date: "2026-07-02",
    });
    expect(accountByName("Checking").balance).toBe(8000);
    expect(getReady()).toBe(10000);
    expect(envelopeByName("Groceries").balance).toBe(0);
  });

  test("categorize routes uncategorized expense into envelope", () => {
    const checking = accountByName("Checking");
    const groceries = envelopeByName("Groceries");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    const id = addExpense({
      account_id: checking.id,
      envelope_id: null,
      amount: 2000,
      date: "2026-07-02",
    });
    categorizeTransaction(id, groceries.id);
    expect(envelopeByName("Groceries").balance).toBe(-2000);
    const txn = db.query("SELECT * FROM transactions WHERE id = ?").get(id);
    expect(txn.envelope_id).toBe(groceries.id);
  });

  test("categorize income into envelope moves from Ready", () => {
    const checking = accountByName("Checking");
    const emergency = envelopeByName("Emergency Fund");
    const id = addIncome({
      account_id: checking.id,
      amount: 5000,
      date: "2026-07-01",
    });
    categorizeTransaction(id, emergency.id);
    expect(getReady()).toBe(0);
    expect(envelopeByName("Emergency Fund").balance).toBe(5000);
  });

  test("move between envelopes does not touch Ready", () => {
    const checking = accountByName("Checking");
    const groceries = envelopeByName("Groceries");
    const transport = envelopeByName("Transport");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    assignToEnvelope(groceries.id, 6000);
    moveBetweenEnvelopes(groceries.id, transport.id, 2000);
    expect(getReady()).toBe(4000);
    expect(envelopeByName("Groceries").balance).toBe(4000);
    expect(envelopeByName("Transport").balance).toBe(2000);
  });

  test("cover overspend pulls from Ready", () => {
    const checking = accountByName("Checking");
    const groceries = envelopeByName("Groceries");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    assignToEnvelope(groceries.id, 1000);
    addExpense({
      account_id: checking.id,
      envelope_id: groceries.id,
      amount: 2500,
      date: "2026-07-02",
    });
    expect(envelopeByName("Groceries").balance).toBe(-1500);
    coverOverspend(groceries.id);
    expect(envelopeByName("Groceries").balance).toBe(0);
    expect(getReady()).toBe(7500);
  });

  test("account transfer does not affect Ready or envelopes", () => {
    const checking = accountByName("Checking");
    const savings = accountByName("Savings");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    const ready = getReady();
    transferAccounts(checking.id, savings.id, 3000, { date: "2026-07-02" });
    expect(getReady()).toBe(ready);
    expect(accountByName("Checking").balance).toBe(7000);
    expect(accountByName("Savings").balance).toBe(3000);
  });

  test("delete income reverses Ready and account", () => {
    const checking = accountByName("Checking");
    const id = addIncome({
      account_id: checking.id,
      amount: 5000,
      date: "2026-07-01",
    });
    deleteTransaction(id);
    expect(getReady()).toBe(0);
    expect(accountByName("Checking").balance).toBe(0);
  });

  test("listTransactions supports filters and pagination", () => {
    const checking = accountByName("Checking");
    const groceries = envelopeByName("Groceries");
    addIncome({ account_id: checking.id, amount: 10000, date: "2026-07-01" });
    assignToEnvelope(groceries.id, 5000);
    addExpense({
      account_id: checking.id,
      envelope_id: groceries.id,
      amount: 100,
      date: "2026-07-02",
    });
    addExpense({
      account_id: checking.id,
      envelope_id: null,
      amount: 50,
      date: "2026-07-03",
    });

    expect(listTransactions({ limit: 1 }).length).toBe(1);
    expect(listTransactions({ offset: 1, limit: 10 }).length).toBeGreaterThan(0);
    expect(
      listTransactions({ uncategorized: true }).every(
        (t) => t.kind === "expense" && t.envelope_id == null
      )
    ).toBe(true);
    expect(
      listTransactions({ envelope_id: groceries.id }).every(
        (t) => t.envelope_id === groceries.id || t.kind === "assign"
      )
    ).toBe(true);
  });

  test("goal envelope target fields", () => {
    const emergency = envelopeByName("Emergency Fund");
    expect(emergency.target_amount).toBe(100000);
    updateEnvelope(emergency.id, {
      target_amount: 200000,
      target_date: "2027-01-01",
    });
    expect(envelopeByName("Emergency Fund").target_amount).toBe(200000);
  });
});

describe("importBankTxn basics", () => {
  test("dedupes by FITID", () => {
    const checking = accountByName("Checking");
    const a = importBankTxn({
      account_id: checking.id,
      amount: 1000,
      date: "2026-07-01",
      payee: "A",
      memo: null,
      fitid: "F1",
      import_id: null,
    });
    const b = importBankTxn({
      account_id: checking.id,
      amount: 1000,
      date: "2026-07-01",
      payee: "A",
      memo: null,
      fitid: "F1",
      import_id: null,
    });
    expect(a.skipped).toBe(false);
    expect(b.skipped).toBe(true);
    expect(getReady()).toBe(1000);
  });

  test("skips zero amounts", () => {
    const r = importBankTxn({
      account_id: accountByName("Checking").id,
      amount: 0,
      date: "2026-07-01",
      payee: "Z",
      memo: null,
      fitid: "Z0",
      import_id: null,
    });
    expect(r.skipped).toBe(true);
  });
});

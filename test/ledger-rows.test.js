import { describe, expect, test } from "bun:test";
import { accountByName, useCleanDb } from "./helpers.js";
import {
  importBankTxn,
  listEnvelopes,
  listTransactions,
} from "../src/services/budget.js";
import { selectOptions } from "../src/views/layout.js";
import {
  ledgerRowsPartial,
  TXN_PAGE_SIZE,
  transactionRowsHtml,
} from "../src/views/pages.js";

useCleanDb();

describe("ledger HTMX chunks", () => {
  test("transactionRowsHtml renders categorize controls for uncategorized", () => {
    importBankTxn({
      account_id: accountByName("Checking").id,
      amount: -100,
      date: "2026-07-01",
      payee: "Shop",
      memo: null,
      fitid: "U1",
      import_id: null,
    });
    const txns = listTransactions({ uncategorized: true });
    const opts = selectOptions(listEnvelopes(), null, { empty: "Categorize…" });
    const html = transactionRowsHtml(txns, opts);
    expect(html).toContain("Categorize");
    expect(html).toContain("/ledger/");
    expect(html).toContain("Shop");
  });

  test("ledgerRowsPartial builds envelope options once", () => {
    const checking = accountByName("Checking");
    importBankTxn({
      account_id: checking.id,
      amount: -100,
      date: "2026-07-01",
      payee: "A",
      memo: null,
      fitid: "A1",
      import_id: null,
    });
    importBankTxn({
      account_id: checking.id,
      amount: -200,
      date: "2026-07-01",
      payee: "B",
      memo: null,
      fitid: "B1",
      import_id: null,
    });
    const page = listTransactions({ uncategorized: true });
    const html = ledgerRowsPartial({
      transactions: page,
      envelopes: listEnvelopes(),
      filters: {},
      offset: 0,
      hasMore: false,
    });
    expect(html.split("Categorize…").length - 1).toBe(2);
    expect(html).toContain("A");
    expect(html).toContain("B");
  });

  test("ledgerRowsPartial includes load-more sentinel when more remain", () => {
    const checking = accountByName("Checking");
    for (let i = 0; i < TXN_PAGE_SIZE + 5; i++) {
      importBankTxn({
        account_id: checking.id,
        amount: -100 - i,
        date: "2026-07-01",
        payee: `P${i}`,
        memo: null,
        fitid: `FIT-${i}`,
        import_id: null,
      });
    }
    const page = listTransactions({ limit: TXN_PAGE_SIZE, offset: 0 });
    const html = ledgerRowsPartial({
      transactions: page,
      envelopes: listEnvelopes(),
      filters: {},
      offset: 0,
      hasMore: true,
    });
    expect(html).toContain("load-more");
    expect(html).toContain(`offset=${TXN_PAGE_SIZE}`);
    expect(html).toContain('hx-trigger="intersect once"');
  });

  test("ledgerRowsPartial omits sentinel on last page", () => {
    importBankTxn({
      account_id: accountByName("Checking").id,
      amount: -50,
      date: "2026-07-01",
      payee: "One",
      memo: null,
      fitid: "ONLY",
      import_id: null,
    });
    const page = listTransactions({ limit: TXN_PAGE_SIZE, offset: 0 });
    const html = ledgerRowsPartial({
      transactions: page,
      envelopes: listEnvelopes(),
      filters: {},
      offset: 0,
      hasMore: false,
    });
    expect(html).not.toContain("load-more");
    expect(html).toContain("One");
  });

  test("empty first page shows placeholder", () => {
    const html = ledgerRowsPartial({
      transactions: [],
      envelopes: listEnvelopes(),
      filters: {},
      offset: 0,
      hasMore: false,
    });
    expect(html).toContain("No transactions");
  });
});

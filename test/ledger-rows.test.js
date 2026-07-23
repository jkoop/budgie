import { describe, expect, test } from "bun:test";
import { accountByName, useCleanDb } from "./helpers.js";
import {
  importBankTxn,
  listEnvelopes,
  listTransactions,
  transferLinkCandidatesByTxnId,
} from "../src/services/budget.js";
import { selectOptions } from "../src/views/layout.js";
import {
  ledgerRowsPartial,
  ledgerTransferLinkHtmxRows,
  TXN_PAGE_SIZE,
  transactionRowsHtml,
} from "../src/views/pages.js";
import {
  getLedgerTransaction,
  linkTransactionsAsTransfer,
} from "../src/services/budget.js";

useCleanDb();

describe("ledger HTMX chunks", () => {
  test("transactionRowsHtml renders transfer link controls for matching legs", () => {
    const checking = accountByName("Chequing");
    const savings = accountByName("Savings");
    importBankTxn({
      account_id: checking.id,
      amount: -3000,
      date: "2026-07-01",
      payee: "Withdrawal",
      memo: null,
      fitid: "L1",
      import_id: null,
    });
    importBankTxn({
      account_id: savings.id,
      amount: 3000,
      date: "2026-07-01",
      payee: "Deposit",
      memo: null,
      fitid: "L2",
      import_id: null,
    });
    const txns = listTransactions({ limit: 10 });
    const byId = transferLinkCandidatesByTxnId(txns);
    const html = transactionRowsHtml(txns, "", byId);
    expect(html).toContain("Link as transfer");
    expect(html).toContain("/link-transfer");
    expect(html).toContain('hx-post="/ledger/');
    expect(html).toContain('hx-target="closest tr"');
    expect(html).toContain("Deposit");
  });

  test("linked transfers show transfer label without link form", () => {
    const checking = accountByName("Chequing");
    const savings = accountByName("Savings");
    importBankTxn({
      account_id: checking.id,
      amount: -3000,
      date: "2026-07-01",
      payee: "Withdrawal",
      memo: null,
      fitid: "L3",
      import_id: null,
    });
    importBankTxn({
      account_id: savings.id,
      amount: 3000,
      date: "2026-07-01",
      payee: "Deposit",
      memo: null,
      fitid: "L4",
      import_id: null,
    });
    const out = listTransactions({ account_id: checking.id })[0];
    const inn = listTransactions({ account_id: savings.id })[0];
    linkTransactionsAsTransfer(out.id, inn.id);

    const txns = listTransactions({ limit: 10 });
    const html = transactionRowsHtml(txns, "");
    expect(html).toContain("Transfer ↔");
    expect(html).not.toContain("Link as transfer");
    expect(html).not.toContain("/link-transfer");
  });

  test("ledgerTransferLinkHtmxRows updates paired row via OOB swap", () => {
    const checking = accountByName("Chequing");
    const savings = accountByName("Savings");
    importBankTxn({
      account_id: checking.id,
      amount: -3000,
      date: "2026-07-01",
      payee: "Withdrawal",
      memo: null,
      fitid: "L5",
      import_id: null,
    });
    importBankTxn({
      account_id: savings.id,
      amount: 3000,
      date: "2026-07-01",
      payee: "Deposit",
      memo: null,
      fitid: "L6",
      import_id: null,
    });
    const out = listTransactions({ account_id: checking.id })[0];
    const inn = listTransactions({ account_id: savings.id })[0];
    linkTransactionsAsTransfer(out.id, inn.id);

    const html = ledgerTransferLinkHtmxRows(
      getLedgerTransaction(out.id),
      getLedgerTransaction(inn.id),
      listEnvelopes()
    );
    expect(html).toContain(`id="txn-${out.id}"`);
    expect(html).toContain(`id="txn-${inn.id}" hx-swap-oob="true"`);
    expect(html).toContain("Transfer ↔");
    expect(html).not.toContain("Link as transfer");
  });

  test("transactionRowsHtml renders categorize controls for uncategorized", () => {
    importBankTxn({
      account_id: accountByName("Chequing").id,
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
    expect(html).toContain('hx-target="closest tr"');
    expect(html).toContain('hx-swap="outerHTML"');
  });

  test("ledgerRowsPartial builds envelope options once", () => {
    const checking = accountByName("Chequing");
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
    const checking = accountByName("Chequing");
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
      account_id: accountByName("Chequing").id,
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

import { describe, expect, test, beforeEach } from "bun:test";
import { useCleanDb, setOfxIds, ofxFile, accountByName } from "./helpers.js";
import { getReady } from "../src/db.js";
import { todayISO } from "../src/money.js";
import { callTool } from "../src/mcp/tools.js";
import { resetTickDebounce } from "../src/tick.js";
import * as budget from "../src/services/budget.js";
import { createIncomeSchedule } from "../src/services/schedules.js";

useCleanDb();

beforeEach(() => {
  resetTickDebounce();
});

function dueIncomeSchedule(amount = 5000) {
  createIncomeSchedule({
    name: "Pay",
    amount,
    account_id: accountByName("Chequing").id,
    payee: "Work",
    cadence_kind: "weekly",
    next_date: todayISO(),
  });
}

describe("MCP tools", () => {
  test("get_dashboard returns stats", () => {
    const result = callTool("get_dashboard", {});
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.stats).toBeDefined();
    expect(typeof data.stats.ready).toBe("number");
  });

  test("read tools trigger schedule tick", () => {
    dueIncomeSchedule();
    resetTickDebounce();
    expect(getReady()).toBe(0);
    callTool("list_transactions", {});
    expect(getReady()).toBe(5000);
  });

  test("write tools do not trigger schedule tick", () => {
    dueIncomeSchedule();
    resetTickDebounce();
    callTool("create_account", { name: "No Tick Account" });
    expect(getReady()).toBe(0);
  });

  test("create_account and list_accounts", () => {
    const created = callTool("create_account", {
      name: "Test Chequing",
      ofx_account_id: "TEST-001",
    });
    expect(created.isError).toBeFalsy();

    const listed = callTool("list_accounts", {});
    const data = JSON.parse(listed.content[0].text);
    const acct = data.accounts.find((a) => a.name === "Test Chequing");
    expect(acct).toBeDefined();
    expect(acct.ofx_account_id).toBe("TEST-001");
  });

  test("assign_to_envelope moves Ready to envelope", () => {
    budget.addIncome({
      account_id: accountByName("Chequing").id,
      amount: 10000,
      payee: "Paycheque",
      date: "2026-01-01",
    });
    const env = budget.listEnvelopes().find((e) => e.name === "Groceries");

    const result = callTool("assign_to_envelope", {
      envelope_id: env.id,
      amount: "50.00",
    });
    expect(result.isError).toBeFalsy();
    expect(getReady()).toBe(5000);
    expect(budget.listEnvelopes().find((e) => e.id === env.id).balance).toBe(
      5000
    );
  });

  test("import_ofx imports transactions", () => {
    setOfxIds({ Chequing: "CHQ-001" });
    const content = ofxFile({
      accountId: "CHQ-001",
      transactions: [
        { fitid: "mcp-1", date: "2026-01-15", amount: 2500, payee: "Deposit" },
      ],
    });

    const result = callTool("import_ofx", { content, filename: "test.ofx" });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.added).toBe(1);
  });

  test("unknown tool returns error", () => {
    const result = callTool("nonexistent_tool", {});
    expect(result.isError).toBe(true);
  });
});

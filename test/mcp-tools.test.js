import { describe, expect, test, beforeEach } from "bun:test";
import { useCleanDb, setOfxIds, ofxFile, accountByName } from "./helpers.js";
import { callTool } from "../src/mcp/tools.js";
import { resetTickDebounce } from "../src/tick.js";
import * as budget from "../src/services/budget.js";
import { getReady } from "../src/db.js";

useCleanDb();

beforeEach(() => {
  resetTickDebounce();
});

describe("MCP tools", () => {
  test("get_dashboard returns stats", async () => {
    const result = await callTool("get_dashboard", {});
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.stats).toBeDefined();
    expect(typeof data.stats.ready).toBe("number");
  });

  test("create_account and list_accounts", async () => {
    const created = await callTool("create_account", {
      name: "Test Chequing",
      ofx_account_id: "TEST-001",
    });
    expect(created.isError).toBeFalsy();

    const listed = await callTool("list_accounts", {});
    const data = JSON.parse(listed.content[0].text);
    const acct = data.accounts.find((a) => a.name === "Test Chequing");
    expect(acct).toBeDefined();
    expect(acct.ofx_account_id).toBe("TEST-001");
  });

  test("assign_to_envelope moves Ready to envelope", async () => {
    budget.addIncome({
      account_id: accountByName("Chequing").id,
      amount: 10000,
      payee: "Paycheque",
      date: "2026-01-01",
    });
    const env = budget.listEnvelopes().find((e) => e.name === "Groceries");

    const result = await callTool("assign_to_envelope", {
      envelope_id: env.id,
      amount: "50.00",
    });
    expect(result.isError).toBeFalsy();
    expect(getReady()).toBe(5000);
    expect(budget.listEnvelopes().find((e) => e.id === env.id).balance).toBe(
      5000
    );
  });

  test("import_ofx imports transactions", async () => {
    setOfxIds({ Chequing: "CHQ-001" });
    const content = ofxFile({
      accountId: "CHQ-001",
      transactions: [
        { fitid: "mcp-1", date: "2026-01-15", amount: 2500, payee: "Deposit" },
      ],
    });

    const result = await callTool("import_ofx", { content, filename: "test.ofx" });
    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0].text);
    expect(data.added).toBe(1);
  });

  test("unknown tool returns error", async () => {
    const result = await callTool("nonexistent_tool", {});
    expect(result.isError).toBe(true);
  });
});

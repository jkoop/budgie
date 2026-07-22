import { describe, expect, test } from "bun:test";
import {
  getReady,
  accountByName,
  envelopeByName,
  useCleanDb,
} from "./helpers.js";

useCleanDb();
import {
  advanceDate,
  createAllowanceRule,
  createIncomeSchedule,
  listAllowanceRules,
  listIncomeSchedules,
  tick,
  updateIncomeSchedule,
} from "../src/services/schedules.js";
import { addIncome } from "../src/services/budget.js";
import { createGoal, listGoals } from "../src/services/goals.js";

describe("advanceDate", () => {
  test("daily / weekly / biweekly", () => {
    expect(advanceDate("2026-07-01", "daily", 3)).toBe("2026-07-04");
    expect(advanceDate("2026-07-01", "weekly", 2)).toBe("2026-07-15");
    expect(advanceDate("2026-07-01", "biweekly", 1)).toBe("2026-07-15");
  });

  test("monthly with DOM and last-day", () => {
    expect(advanceDate("2026-01-15", "monthly", 1, 15)).toBe("2026-02-15");
    expect(advanceDate("2026-01-31", "monthly", 1, 31)).toBe("2026-02-28");
    expect(advanceDate("2026-01-31", "monthly", 1, -1)).toBe("2026-02-28");
  });

  test("yearly", () => {
    expect(advanceDate("2024-02-29", "yearly", 1)).toBe("2025-02-28");
  });
});

describe("tick schedules", () => {
  test("posts due income and advances next_date", () => {
    const checking = accountByName("Chequing");
    createIncomeSchedule({
      name: "Pay",
      amount: 300000,
      account_id: checking.id,
      payee: "Work",
      cadence_kind: "biweekly",
      next_date: "2026-07-01",
    });

    const result = tick("2026-07-01");
    expect(result.income).toBe(1);
    expect(getReady()).toBe(300000);
    expect(accountByName("Chequing").balance).toBe(300000);
    expect(listIncomeSchedules()[0].next_date).toBe("2026-07-15");
  });

  test("catches up multiple missed income periods", () => {
    createIncomeSchedule({
      name: "Pay",
      amount: 10000,
      account_id: accountByName("Chequing").id,
      cadence_kind: "weekly",
      next_date: "2026-07-01",
    });

    tick("2026-07-22");
    expect(getReady()).toBe(40000); // Jul 1,8,15,22
    expect(listIncomeSchedules()[0].next_date).toBe("2026-07-29");
  });

  test("allowance assigns from Ready with shortfall", () => {
    const groceries = envelopeByName("Groceries");
    addIncome({
      account_id: accountByName("Chequing").id,
      amount: 5000,
      date: "2026-07-01",
    });
    createAllowanceRule({
      envelope_id: groceries.id,
      amount: 10000,
      cadence_kind: "weekly",
      next_date: "2026-07-01",
    });

    tick("2026-07-01");
    expect(envelopeByName("Groceries").balance).toBe(5000);
    expect(getReady()).toBe(0);
    expect(listAllowanceRules()[0].last_shortfall).toBe(5000);
  });

  test("auto-funds standalone goals", () => {
    addIncome({
      account_id: accountByName("Chequing").id,
      amount: 20000,
      date: "2026-07-01",
    });
    createGoal({
      name: "Trip",
      target_amount: 100000,
      auto_amount: 7500,
      cadence_kind: "monthly",
      next_date: "2026-07-01",
    });

    tick("2026-07-01");
    expect(listGoals()[0].funded).toBe(7500);
    expect(getReady()).toBe(12500);
  });

  test("inactive schedules are ignored", () => {
    const id = createIncomeSchedule({
      name: "Off",
      amount: 1000,
      account_id: accountByName("Chequing").id,
      cadence_kind: "daily",
      next_date: "2026-07-01",
    });
    updateIncomeSchedule(id, { active: false });
    tick("2026-07-01");
    expect(getReady()).toBe(0);
  });
});

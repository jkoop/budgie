import { describe, expect, test } from "bun:test";
import {
  accountByName,
  envelopeByName,
  getReady,
  useCleanDb,
} from "./helpers.js";

useCleanDb();
import { addIncome, assignToEnvelope } from "../src/services/budget.js";
import {
  createGoal,
  deleteGoal,
  fundGoal,
  listContributions,
  listGoalEnvelopes,
  listGoals,
} from "../src/services/goals.js";

describe("standalone goals", () => {
  test("fund from Ready", () => {
    addIncome({
      account_id: accountByName("Checking").id,
      amount: 50000,
      date: "2026-07-01",
    });
    const id = createGoal({
      name: "Vacation",
      target_amount: 200000,
      target_date: "2027-06-01",
    });
    const given = fundGoal(id, 10000);
    expect(given).toBe(10000);
    expect(listGoals()[0].funded).toBe(10000);
    expect(getReady()).toBe(40000);
    expect(listContributions(id)).toHaveLength(1);
  });

  test("fund from source envelope", () => {
    const savingsEnv = envelopeByName("Emergency Fund");
    addIncome({
      account_id: accountByName("Checking").id,
      amount: 50000,
      date: "2026-07-01",
    });
    assignToEnvelope(savingsEnv.id, 20000);
    const id = createGoal({
      name: "Car",
      target_amount: 500000,
      source_envelope_id: savingsEnv.id,
    });
    fundGoal(id, 5000);
    expect(envelopeByName("Emergency Fund").balance).toBe(15000);
    expect(getReady()).toBe(30000);
    expect(listGoals()[0].funded).toBe(5000);
  });

  test("rejects insufficient Ready unless partial", () => {
    addIncome({
      account_id: accountByName("Checking").id,
      amount: 1000,
      date: "2026-07-01",
    });
    const id = createGoal({ name: "X", target_amount: 99999 });
    expect(() => fundGoal(id, 5000)).toThrow(/Insufficient Ready/);
    expect(fundGoal(id, 5000, { allowPartial: true })).toBe(1000);
  });

  test("delete removes goal and contributions", () => {
    addIncome({
      account_id: accountByName("Checking").id,
      amount: 5000,
      date: "2026-07-01",
    });
    const id = createGoal({ name: "Temp", target_amount: 10000 });
    fundGoal(id, 1000);
    deleteGoal(id);
    expect(listGoals({ includeInactive: true }).filter((g) => g.name === "Temp")).toHaveLength(0);
    expect(listContributions(id)).toHaveLength(0);
    expect(getReady()).toBe(4000);
  });
});

describe("goal envelopes", () => {
  test("lists envelopes with targets", () => {
    const goals = listGoalEnvelopes();
    expect(goals.some((g) => g.name === "Emergency Fund")).toBe(true);
    expect(goals.every((g) => g.target_amount > 0)).toBe(true);
  });
});

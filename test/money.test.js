import { describe, expect, test } from "bun:test";
import {
  addDaysISO,
  dollarsToCents,
  escapeHtml,
  formatMoney,
  moneyClass,
} from "../src/money.js";

describe("dollarsToCents", () => {
  test("parses numbers and strings", () => {
    expect(dollarsToCents(12.34)).toBe(1234);
    expect(dollarsToCents("12.34")).toBe(1234);
    expect(dollarsToCents("$1,234.56")).toBe(123456);
  });

  test("handles negatives and parentheses", () => {
    expect(dollarsToCents("-10.00")).toBe(-1000);
    expect(dollarsToCents("(10.00)")).toBe(-1000);
    expect(dollarsToCents("9.99-")).toBe(-999);
  });

  test("empty and invalid become 0", () => {
    expect(dollarsToCents("")).toBe(0);
    expect(dollarsToCents("abc")).toBe(0);
    expect(dollarsToCents(null)).toBe(0);
  });
});

describe("formatMoney", () => {
  test("formats positive and negative cents", () => {
    expect(formatMoney(1234)).toBe("$12.34");
    expect(formatMoney(-50)).toBe("-$0.50");
    expect(formatMoney(0)).toBe("$0.00");
  });
});

describe("moneyClass", () => {
  test("classifies sign", () => {
    expect(moneyClass(1)).toBe("pos");
    expect(moneyClass(-1)).toBe("neg");
    expect(moneyClass(0)).toBe("zero");
  });
});

describe("addDaysISO", () => {
  test("adds and crosses month boundaries", () => {
    expect(addDaysISO("2026-01-30", 2)).toBe("2026-02-01");
    expect(addDaysISO("2026-07-21", -1)).toBe("2026-07-20");
  });
});

describe("escapeHtml", () => {
  test("escapes HTML special characters", () => {
    expect(escapeHtml(`<a href="x">&'`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;"
    );
  });
});

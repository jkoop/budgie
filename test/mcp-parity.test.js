import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { CAPABILITIES } from "../src/capabilities.js";
import { listToolDefinitions } from "../src/mcp/tools.js";

const indexSource = readFileSync(
  join(import.meta.dir, "../src/index.js"),
  "utf8"
);

describe("MCP parity manifest", () => {
  test("every capability has a unique id and mcpTool", () => {
    const ids = CAPABILITIES.map((c) => c.id);
    const tools = CAPABILITIES.map((c) => c.mcpTool);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(tools).size).toBe(tools.length);
  });

  test("every manifest entry has a registered MCP tool", () => {
    const registered = new Set(listToolDefinitions().map((t) => t.name));
    for (const cap of CAPABILITIES) {
      expect(registered.has(cap.mcpTool)).toBe(true);
    }
    expect(listToolDefinitions().length).toBe(CAPABILITIES.length);
  });

  test("every write capability has a matching POST route in index.js", () => {
    for (const cap of CAPABILITIES.filter((c) => c.kind === "write")) {
      const hasLiteral = indexSource.includes(`path === "${cap.gui.path}"`);
      if (hasLiteral) continue;

      if (cap.gui.path.includes(":id")) {
        const matchPattern =
          "^" +
          cap.gui.path
            .replace(/:[^/]+/g, "(\\d+)")
            .replace(/\//g, "\\/") +
          "$";
        expect(indexSource.includes(matchPattern)).toBe(true);
        continue;
      }

      expect(indexSource.includes(`path === "${cap.gui.path}"`)).toBe(true);
    }
  });

  test("list_transactions is the only tool that skips tick", () => {
    const skipTools = CAPABILITIES.filter((c) => c.skipTick).map(
      (c) => c.mcpTool
    );
    expect(skipTools).toEqual(["list_transactions"]);
  });
});

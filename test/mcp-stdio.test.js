import { describe, expect, test, beforeEach } from "bun:test";
import { useCleanDb } from "./helpers.js";
import { handleMcpMessage, writeMcpMessage } from "../src/mcp/stdio.js";
import { clearMcpSessions } from "../src/mcp/dispatch.js";
import { resetTickDebounce } from "../src/tick.js";

useCleanDb();

beforeEach(() => {
  clearMcpSessions();
  resetTickDebounce();
});

describe("MCP stdio transport", () => {
  test("handleMcpMessage initialize returns capabilities", async () => {
    const body = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    expect(body.result.protocolVersion).toBe("2025-11-25");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  test("notifications/initialized returns null", async () => {
    const body = await handleMcpMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(body).toBeNull();
  });

  test("tools/list returns all tools", async () => {
    const body = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    expect(body.result.tools.length).toBe(30);
  });

  test("tools/call get_dashboard", async () => {
    const body = await handleMcpMessage({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_dashboard", arguments: {} },
    });
    const data = JSON.parse(body.result.content[0].text);
    expect(data.stats).toBeDefined();
  });

  test("writeMcpMessage emits single-line JSON", () => {
    const lines = [];
    const stream = { write: (s) => lines.push(s) };
    writeMcpMessage(stream, { jsonrpc: "2.0", id: 1, result: {} });
    expect(lines).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}\n']);
  });

  test("invalid message returns error", async () => {
    const body = await handleMcpMessage({ jsonrpc: "1.0" });
    expect(body.error).toBeDefined();
  });
});

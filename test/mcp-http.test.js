import { describe, expect, test, beforeEach } from "bun:test";
import { useCleanDb } from "./helpers.js";
import { CAPABILITIES } from "../src/capabilities.js";
import { handleMcpRequest } from "../src/mcp/http.js";
import { resetTickDebounce } from "../src/tick.js";

useCleanDb();

beforeEach(() => {
  resetTickDebounce();
});

function mcpPost(body, headers = {}) {
  return handleMcpRequest(
    new Request("http://127.0.0.1:3000/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        ...headers,
      },
      body: JSON.stringify(body),
    })
  );
}

describe("MCP HTTP transport", () => {
  test("GET returns 405", async () => {
    const res = await handleMcpRequest(
      new Request("http://127.0.0.1:3000/mcp", { method: "GET" })
    );
    expect(res.status).toBe(405);
  });

  test("rejects disallowed Origin", async () => {
    const res = await mcpPost(
      { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
      { Origin: "https://evil.example.com" }
    );
    expect(res.status).toBe(403);
  });

  test("initialize returns capabilities and session id", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-11-25",
        capabilities: {},
        clientInfo: { name: "test", version: "1.0.0" },
      },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("Mcp-Session-Id")).toBeTruthy();
    const body = await res.json();
    expect(body.result.protocolVersion).toBe("2025-11-25");
    expect(body.result.capabilities.tools).toBeDefined();
  });

  test("tools/list returns all tools", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
      params: {},
    });
    const body = await res.json();
    expect(body.result.tools.length).toBe(CAPABILITIES.length);
  });

  test("tools/call get_dashboard", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "get_dashboard", arguments: {} },
    });
    const body = await res.json();
    expect(body.result.content[0].type).toBe("text");
    const data = JSON.parse(body.result.content[0].text);
    expect(data.stats).toBeDefined();
  });

  test("notifications/initialized returns 202", async () => {
    const res = await mcpPost({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(res.status).toBe(202);
  });
});

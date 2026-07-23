import { describe, expect, test, beforeEach } from "bun:test";
import { useCleanDb } from "./helpers.js";
import { CAPABILITIES } from "../src/capabilities.js";
import { handleMcpRequest } from "../src/mcp/http.js";
import { handleMcpMessage, writeMcpMessage } from "../src/mcp/stdio.js";
import { resetTickDebounce } from "../src/tick.js";

useCleanDb();

beforeEach(() => {
  resetTickDebounce();
});

const INIT_MSG = {
  jsonrpc: "2.0",
  id: 1,
  method: "initialize",
  params: {
    protocolVersion: "2025-11-25",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  },
};

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

function runProtocolTests(label, send) {
  describe(`MCP protocol (${label})`, () => {
    test("initialize returns capabilities", async () => {
      const result = await send(INIT_MSG);
      expect(result.protocolVersion).toBe("2025-11-25");
      expect(result.capabilities.tools).toBeDefined();
    });

    test("tools/list returns all tools", async () => {
      const result = await send({
        jsonrpc: "2.0",
        id: 2,
        method: "tools/list",
        params: {},
      });
      expect(result.tools.length).toBe(CAPABILITIES.length);
    });

    test("tools/call get_dashboard", async () => {
      const result = await send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "get_dashboard", arguments: {} },
      });
      expect(result.content[0].type).toBe("text");
      const data = JSON.parse(result.content[0].text);
      expect(data.stats).toBeDefined();
    });
  });
}

runProtocolTests("stdio", async (msg) => {
  const { body, sessionId } = await handleMcpMessage(msg);
  if (msg.method === "initialize") expect(sessionId).toBeTruthy();
  if (msg.method === "notifications/initialized") return {};
  if (body?.error) throw new Error(body.error.message);
  return body?.result;
});

runProtocolTests("HTTP", async (msg) => {
  if (msg.method === "notifications/initialized") {
    const res = await mcpPost(msg);
    expect(res.status).toBe(202);
    return {};
  }
  const res = await mcpPost(msg);
  expect(res.status).toBe(200);
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
});

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
});

describe("MCP stdio transport", () => {
  test("notifications/initialized returns notification", async () => {
    const result = await handleMcpMessage({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    });
    expect(result.notification).toBe(true);
    expect(result.body).toBeUndefined();
  });

  test("writeMcpMessage emits single-line JSON", () => {
    const lines = [];
    const stream = { write: (s) => lines.push(s) };
    writeMcpMessage(stream, { jsonrpc: "2.0", id: 1, result: {} });
    expect(lines).toEqual(['{"jsonrpc":"2.0","id":1,"result":{}}\n']);
  });

  test("invalid message returns error", async () => {
    const { body } = await handleMcpMessage({ jsonrpc: "1.0" });
    expect(body.error).toBeDefined();
  });
});

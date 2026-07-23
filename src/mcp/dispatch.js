import { randomUUID } from "crypto";
import {
  PROTOCOL_VERSION,
  jsonRpcResult,
  jsonRpcError,
  INVALID_REQUEST,
  METHOD_NOT_FOUND,
} from "./protocol.js";
import { listToolDefinitions, callTool } from "./tools.js";

const sessions = new Map();

function newSessionId() {
  return randomUUID();
}

/** @returns {{ body?: object, sessionId?: string, notification?: boolean }} */
export async function dispatchMcpMessage(msg, sessionId = null) {
  const { method, params, id } = msg;

  if (method === "initialize") {
    const sid = sessionId || newSessionId();
    sessions.set(sid, { createdAt: Date.now() });
    return {
      body: jsonRpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "budgie", version: "1.0.0" },
      }),
      sessionId: sid,
    };
  }

  if (method === "notifications/initialized") {
    return { notification: true };
  }

  if (method === "ping") {
    return { body: jsonRpcResult(id, {}) };
  }

  if (method === "tools/list") {
    return {
      body: jsonRpcResult(id, { tools: listToolDefinitions() }),
    };
  }

  if (method === "tools/call") {
    const name = params?.name;
    const args = params?.arguments || {};
    if (!name) {
      return {
        body: jsonRpcError(id, INVALID_REQUEST, "Missing tool name"),
      };
    }
    const result = await callTool(name, args);
    return { body: jsonRpcResult(id, result) };
  }

  return {
    body: jsonRpcError(id, METHOD_NOT_FOUND, `Method not found: ${method}`),
  };
}

/** Clear in-memory sessions (tests only). */
export function clearMcpSessions() {
  sessions.clear();
}

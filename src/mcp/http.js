import {
  jsonRpcResult,
  jsonRpcError,
  PARSE_ERROR,
  INVALID_REQUEST,
  INTERNAL_ERROR,
  isNotification,
  isRequest,
} from "./protocol.js";
import { dispatchMcpMessage, clearMcpSessions } from "./dispatch.js";

export { clearMcpSessions };

function isAllowedOrigin(origin) {
  if (!origin) return true;
  try {
    const u = new URL(origin);
    if (u.hostname === "127.0.0.1" || u.hostname === "localhost") return true;
    if (u.hostname.startsWith("192.168.")) return true;
    if (u.hostname.startsWith("10.")) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(u.hostname)) return true;
    return false;
  } catch {
    return false;
  }
}

function jsonResponse(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

export async function handleMcpRequest(req) {
  const method = req.method.toUpperCase();

  if (method === "GET" || method === "DELETE") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  if (method !== "POST") {
    return new Response("Not found", { status: 404 });
  }

  const origin = req.headers.get("origin");
  if (!isAllowedOrigin(origin)) {
    return new Response("Forbidden", { status: 403 });
  }

  let msg;
  try {
    msg = await req.json();
  } catch {
    return jsonResponse(jsonRpcError(null, PARSE_ERROR, "Parse error"), 400);
  }

  if (!msg || msg.jsonrpc !== "2.0") {
    return jsonResponse(
      jsonRpcError(msg?.id ?? null, INVALID_REQUEST, "Invalid Request"),
      400
    );
  }

  const sessionId = req.headers.get("mcp-session-id");

  try {
    if (isNotification(msg)) {
      await dispatchMcpMessage(msg, sessionId);
      return new Response(null, { status: 202 });
    }

    if (!isRequest(msg)) {
      return jsonResponse(
        jsonRpcError(msg.id ?? null, INVALID_REQUEST, "Invalid Request"),
        400
      );
    }

    const { body, sessionId: newSid, notification } = await dispatchMcpMessage(
      msg,
      sessionId
    );

    if (notification) {
      return new Response(null, { status: 202 });
    }

    const headers = {};
    if (newSid) headers["Mcp-Session-Id"] = newSid;

    return jsonResponse(body, 200, headers);
  } catch (err) {
    console.error("MCP error:", err);
    return jsonResponse(
      jsonRpcError(msg.id ?? null, INTERNAL_ERROR, err.message || String(err)),
      500
    );
  }
}

import { createInterface } from "readline";
import {
  jsonRpcError,
  PARSE_ERROR,
  INVALID_REQUEST,
  INTERNAL_ERROR,
  isNotification,
  isRequest,
} from "./protocol.js";
import { dispatchMcpMessage } from "./dispatch.js";

export function writeMcpMessage(stream, msg) {
  stream.write(`${JSON.stringify(msg)}\n`);
}

/**
 * Process one JSON-RPC message (stdio or tests).
 * @returns {object|null} Response body, or null for notifications.
 */
export async function handleMcpMessage(msg, sessionId = null) {
  if (!msg || msg.jsonrpc !== "2.0") {
    return jsonRpcError(msg?.id ?? null, INVALID_REQUEST, "Invalid Request");
  }

  if (isNotification(msg)) {
    await dispatchMcpMessage(msg, sessionId);
    return null;
  }

  if (!isRequest(msg)) {
    return jsonRpcError(msg.id ?? null, INVALID_REQUEST, "Invalid Request");
  }

  const { body, notification } = await dispatchMcpMessage(msg, sessionId);
  if (notification) return null;
  return body;
}

export function runMcpStdioServer({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const rl = createInterface({ input: stdin, terminal: false });
  let sessionId = null;

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      writeMcpMessage(
        stdout,
        jsonRpcError(null, PARSE_ERROR, "Parse error")
      );
      return;
    }

    try {
      if (isRequest(msg) && msg.method === "initialize") {
        const { body, sessionId: sid } = await dispatchMcpMessage(msg);
        sessionId = sid;
        if (body) writeMcpMessage(stdout, body);
        return;
      }

      const response = await handleMcpMessage(msg, sessionId);
      if (response) writeMcpMessage(stdout, response);
    } catch (err) {
      stderr.write(`MCP error: ${err.message || String(err)}\n`);
      if (isRequest(msg)) {
        writeMcpMessage(
          stdout,
          jsonRpcError(
            msg.id,
            INTERNAL_ERROR,
            err.message || String(err)
          )
        );
      }
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

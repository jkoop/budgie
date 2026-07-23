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

/** @returns {Promise<{ body?: object, sessionId?: string, notification?: boolean }>} */
export async function handleMcpMessage(msg) {
  if (!msg || msg.jsonrpc !== "2.0") {
    return { body: jsonRpcError(msg?.id ?? null, INVALID_REQUEST, "Invalid Request") };
  }

  if (isNotification(msg)) {
    await dispatchMcpMessage(msg);
    return { notification: true };
  }

  if (!isRequest(msg)) {
    return { body: jsonRpcError(msg.id ?? null, INVALID_REQUEST, "Invalid Request") };
  }

  return dispatchMcpMessage(msg);
}

export function runMcpStdioServer({
  stdin = process.stdin,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const rl = createInterface({ input: stdin, terminal: false });

  rl.on("line", async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;

    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      writeMcpMessage(stdout, jsonRpcError(null, PARSE_ERROR, "Parse error"));
      return;
    }

    try {
      const { body } = await handleMcpMessage(msg);
      if (body) writeMcpMessage(stdout, body);
    } catch (err) {
      stderr.write(`MCP error: ${err.message || String(err)}\n`);
      if (isRequest(msg)) {
        writeMcpMessage(
          stdout,
          jsonRpcError(msg.id, INTERNAL_ERROR, err.message || String(err))
        );
      }
    }
  });

  rl.on("close", () => {
    process.exit(0);
  });
}

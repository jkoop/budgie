export const PROTOCOL_VERSION = "2025-11-25";

export function jsonRpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

export function jsonRpcError(id, code, message, data) {
  const err = { code, message };
  if (data !== undefined) err.data = data;
  return { jsonrpc: "2.0", id: id ?? null, error: err };
}

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;

export function isNotification(msg) {
  return msg && msg.method && msg.id === undefined;
}

export function isRequest(msg) {
  return msg && msg.method && msg.id !== undefined;
}

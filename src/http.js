import { join } from "path";

export function redirect(location, flash) {
  const headers = new Headers({ Location: location });
  if (flash) {
    headers.append(
      "Set-Cookie",
      `flash=${encodeURIComponent(JSON.stringify(flash))}; Path=/; HttpOnly; SameSite=Lax; Max-Age=30`
    );
  }
  return new Response(null, { status: 303, headers });
}

export function readFlash(req) {
  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)flash=([^;]+)/);
  if (!m) return { flash: null, clearHeader: null };
  try {
    const flash = JSON.parse(decodeURIComponent(m[1]));
    return {
      flash,
      clearHeader:
        "flash=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0",
    };
  } catch {
    return { flash: null, clearHeader: null };
  }
}

export function html(body, { status = 200, clearFlash = null } = {}) {
  const headers = {
    "Content-Type": "text/html; charset=utf-8",
  };
  if (clearFlash) headers["Set-Cookie"] = clearFlash;
  return new Response(body, { status, headers });
}

export async function parseBody(req) {
  const ct = req.headers.get("content-type") || "";
  if (ct.includes("multipart/form-data")) {
    const form = await req.formData();
    const data = {};
    const files = [];
    for (const [key, value] of form.entries()) {
      if (value instanceof File) {
        // Skip empty file inputs
        if (value.size > 0 || value.name) files.push(value);
      } else {
        data[key] = value;
      }
    }
    return { data, file: files[0] || null, files };
  }
  if (
    ct.includes("application/x-www-form-urlencoded") ||
    ct.includes("text/plain") ||
    !ct
  ) {
    const form = await req.formData().catch(async () => {
      const text = await req.text();
      const params = new URLSearchParams(text);
      const data = {};
      for (const [k, v] of params) data[k] = v;
      return data;
    });
    if (form && typeof form.get === "function") {
      const data = {};
      for (const [key, value] of form.entries()) data[key] = value;
      return { data, file: null, files: [] };
    }
    return { data: form || {}, file: null, files: [] };
  }
  return { data: {}, file: null, files: [] };
}

export function publicFile(urlPath) {
  const rel = urlPath.replace(/^\/public\//, "");
  if (rel.includes("..")) return null;
  return join(import.meta.dir, "..", "public", rel);
}

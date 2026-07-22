import { describe, expect, test } from "bun:test";
import { parseBody, readFlash, redirect } from "../src/http.js";

describe("redirect", () => {
  test("sets Location and optional flash cookie", () => {
    const res = redirect("/ledger", { type: "success", message: "Hi" });
    expect(res.status).toBe(303);
    expect(res.headers.get("Location")).toBe("/ledger");
    expect(res.headers.get("Set-Cookie")).toContain("flash=");
  });
});

describe("readFlash", () => {
  test("reads and clears flash from cookie", () => {
    const payload = encodeURIComponent(
      JSON.stringify({ type: "error", message: "Nope" })
    );
    const { flash, clearHeader } = readFlash(
      new Request("http://x/", {
        headers: { cookie: `flash=${payload}` },
      })
    );
    expect(flash.message).toBe("Nope");
    expect(clearHeader).toContain("Max-Age=0");
  });

  test("returns null without cookie", () => {
    const { flash } = readFlash(new Request("http://x/"));
    expect(flash).toBeNull();
  });
});

describe("parseBody", () => {
  test("parses urlencoded form data", async () => {
    const req = new Request("http://x/", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: "name=Groceries&amount=12.34",
    });
    const { data, files } = await parseBody(req);
    expect(data.name).toBe("Groceries");
    expect(data.amount).toBe("12.34");
    expect(files).toEqual([]);
  });

  test("collects multiple uploaded files", async () => {
    const form = new FormData();
    form.append(
      "files",
      new File(["a"], "a.ofx", { type: "text/plain" })
    );
    form.append(
      "files",
      new File(["b"], "b.ofx", { type: "text/plain" })
    );
    form.append("account_id", "");
    const req = new Request("http://x/", { method: "POST", body: form });
    const { data, files } = await parseBody(req);
    expect(files).toHaveLength(2);
    expect(files[0].name).toBe("a.ofx");
    expect(files[1].name).toBe("b.ofx");
    expect(data.account_id).toBe("");
  });
});

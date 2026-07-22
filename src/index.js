import { migrate } from "./db.js";
import { dollarsToCents, todayISO } from "./money.js";
import { html, parseBody, publicFile, readFlash, redirect } from "./http.js";
import * as budget from "./services/budget.js";
import * as schedules from "./services/schedules.js";
import * as goals from "./services/goals.js";
import { importOfxFile, listImports } from "./services/ofx.js";
import {
  accountsPage,
  dashboardPage,
  envelopesPage,
  goalsPage,
  importPage,
  ledgerPage,
  ledgerRowsPartial,
  schedulesPage,
  TXN_PAGE_SIZE,
} from "./views/pages.js";

migrate();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

async function handle(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  // Tick schedules on every request
  try {
    schedules.tick(todayISO());
  } catch (err) {
    console.error("schedule tick failed:", err);
  }

  // Static
  if (method === "GET" && path.startsWith("/public/")) {
    const filePath = publicFile(path);
    if (!filePath) return new Response("Not found", { status: 404 });
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  }

  const { flash, clearHeader } = readFlash(req);

  try {
    // ——— GET pages ———
    if (method === "GET" && path === "/") {
      const stats = budget.dashboardStats();
      const groups = budget.envelopesByGroup();
      const body = dashboardPage({
        ...stats,
        groups,
        goalEnvelopes: goals.listGoalEnvelopes(),
        goals: goals.listGoals(),
        upcomingAllowances: schedules
          .listAllowanceRules()
          .filter((r) => r.active)
          .slice(0, 8),
        upcomingIncome: schedules
          .listIncomeSchedules()
          .filter((s) => s.active)
          .slice(0, 8),
        recent: budget.listTransactions({ limit: 12 }),
        flash,
      });
      return html(body, { clearFlash: clearHeader });
    }

    if (method === "GET" && path === "/envelopes") {
      return html(
        envelopesPage({
          groups: budget.envelopesByGroup(),
          envelopes: budget.listEnvelopes(),
          flash,
        }),
        { clearFlash: clearHeader }
      );
    }

    if (method === "GET" && path === "/accounts") {
      return html(
        accountsPage({
          accounts: budget.listAccounts({ includeArchived: true }),
          flash,
        }),
        { clearFlash: clearHeader }
      );
    }

    if (method === "GET" && (path === "/ledger" || path === "/ledger/rows")) {
      const filters = {
        account_id: url.searchParams.get("account_id") || "",
        envelope_id: url.searchParams.get("envelope_id") || "",
        from: url.searchParams.get("from") || "",
        to: url.searchParams.get("to") || "",
        uncategorized: url.searchParams.get("uncategorized") === "1",
      };

      if (path === "/ledger/rows") {
        const offset = Math.max(
          0,
          Number.parseInt(url.searchParams.get("offset") || "0", 10) || 0
        );
        const batch = budget.listTransactions({
          account_id: filters.account_id || undefined,
          envelope_id: filters.envelope_id || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          uncategorized: filters.uncategorized || undefined,
          limit: TXN_PAGE_SIZE + 1,
          offset,
        });
        const hasMore = batch.length > TXN_PAGE_SIZE;
        const transactions = hasMore ? batch.slice(0, TXN_PAGE_SIZE) : batch;
        return html(
          ledgerRowsPartial({
            transactions,
            envelopes: budget.listEnvelopes(),
            filters,
            offset,
            hasMore,
          }),
          { clearFlash: clearHeader }
        );
      }

      return html(
        ledgerPage({
          accounts: budget.listAccounts(),
          envelopes: budget.listEnvelopes(),
          filters,
          flash,
        }),
        { clearFlash: clearHeader }
      );
    }

    if (method === "GET" && path === "/goals") {
      return html(
        goalsPage({
          goals: goals.listGoals({ includeInactive: true }),
          goalEnvelopes: goals.listGoalEnvelopes(),
          envelopes: budget.listEnvelopes(),
          flash,
        }),
        { clearFlash: clearHeader }
      );
    }

    if (method === "GET" && path === "/schedules") {
      return html(
        schedulesPage({
          incomeSchedules: schedules.listIncomeSchedules(),
          allowanceRules: schedules.listAllowanceRules(),
          accounts: budget.listAccounts(),
          envelopes: budget.listEnvelopes(),
          flash,
        }),
        { clearFlash: clearHeader }
      );
    }

    if (method === "GET" && path === "/import") {
      return html(
        importPage({
          accounts: budget.listAccounts(),
          imports: listImports(),
          flash,
        }),
        { clearFlash: clearHeader }
      );
    }

    // ——— POST actions ———
    if (method === "POST") {
      const { data, file, files } = await parseBody(req);

      // Envelopes
      if (path === "/envelopes") {
        const target = data.target_amount
          ? dollarsToCents(data.target_amount)
          : null;
        budget.createEnvelope({
          name: data.name,
          group_id: data.group_id ? Number(data.group_id) : null,
          target_amount: target || null,
          target_date: data.target_date || null,
        });
        return redirect("/envelopes", {
          type: "success",
          message: "Envelope created",
        });
      }

      if (path === "/envelope-groups") {
        budget.createGroup(data.name);
        return redirect("/envelopes", {
          type: "success",
          message: "Group created",
        });
      }

      if (path === "/envelopes/assign") {
        const amount = dollarsToCents(data.amount);
        budget.assignToEnvelope(Number(data.envelope_id), amount);
        const dest = req.headers.get("referer")?.includes("/envelopes")
          ? "/envelopes"
          : "/";
        return redirect(dest, {
          type: "success",
          message: "Assigned to envelope",
        });
      }

      if (path === "/envelopes/move") {
        budget.moveBetweenEnvelopes(
          Number(data.from_id),
          Number(data.to_id),
          dollarsToCents(data.amount)
        );
        return redirect("/envelopes", {
          type: "success",
          message: "Moved between envelopes",
        });
      }

      if (path === "/envelopes/cover") {
        budget.coverOverspend(Number(data.envelope_id));
        return redirect("/envelopes", {
          type: "success",
          message: "Covered overspend from Ready",
        });
      }

      const envUpdate = path.match(/^\/envelopes\/(\d+)\/update$/);
      if (envUpdate) {
        const targetRaw = (data.target_amount || "").trim();
        budget.updateEnvelope(Number(envUpdate[1]), {
          name: data.name,
          group_id: data.group_id ? Number(data.group_id) : null,
          target_amount: targetRaw === "" ? null : dollarsToCents(targetRaw),
          target_date: data.target_date || null,
          archived: data.archived === "1",
        });
        return redirect("/envelopes", {
          type: "success",
          message: "Envelope updated",
        });
      }

      // Accounts
      if (path === "/accounts") {
        budget.createAccount(data.name, data.ofx_account_id || null);
        return redirect("/accounts", {
          type: "success",
          message: "Account created",
        });
      }

      const acctUpdate = path.match(/^\/accounts\/(\d+)\/update$/);
      if (acctUpdate) {
        budget.updateAccount(Number(acctUpdate[1]), {
          name: data.name,
          ofx_account_id: data.ofx_account_id,
          archived: data.archived === "1",
        });
        return redirect("/accounts", {
          type: "success",
          message: "Account updated",
        });
      }

      // Ledger (categorize / delete only — bank txns come from QFX import)
      const categorize = path.match(/^\/ledger\/(\d+)\/categorize$/);
      if (categorize) {
        budget.categorizeTransaction(
          Number(categorize[1]),
          Number(data.envelope_id)
        );
        return redirect(req.headers.get("referer") || "/ledger", {
          type: "success",
          message: "Categorized",
        });
      }

      const delTxn = path.match(/^\/ledger\/(\d+)\/delete$/);
      if (delTxn) {
        budget.deleteTransaction(Number(delTxn[1]));
        return redirect("/ledger", {
          type: "success",
          message: "Transaction deleted",
        });
      }

      // Goals
      if (path === "/goals") {
        const auto = data.auto_amount ? dollarsToCents(data.auto_amount) : null;
        goals.createGoal({
          name: data.name,
          target_amount: dollarsToCents(data.target_amount),
          target_date: data.target_date || null,
          source_envelope_id: data.source_envelope_id
            ? Number(data.source_envelope_id)
            : null,
          auto_amount: auto,
          cadence_kind: auto ? data.cadence_kind : null,
          cadence_interval: auto ? Number(data.cadence_interval || 1) : null,
          cadence_day:
            auto && data.cadence_day !== ""
              ? Number(data.cadence_day)
              : null,
          next_date: auto ? data.next_date || todayISO() : null,
        });
        return redirect("/goals", {
          type: "success",
          message: "Goal created",
        });
      }

      const fundGoal = path.match(/^\/goals\/(\d+)\/fund$/);
      if (fundGoal) {
        goals.fundGoal(Number(fundGoal[1]), dollarsToCents(data.amount));
        return redirect("/goals", {
          type: "success",
          message: "Goal funded",
        });
      }

      const delGoal = path.match(/^\/goals\/(\d+)\/delete$/);
      if (delGoal) {
        goals.deleteGoal(Number(delGoal[1]));
        return redirect("/goals", {
          type: "success",
          message: "Goal deleted",
        });
      }

      // Schedules
      if (path === "/schedules/income") {
        schedules.createIncomeSchedule({
          name: data.name,
          amount: dollarsToCents(data.amount),
          account_id: Number(data.account_id),
          payee: data.payee || data.name,
          cadence_kind: data.cadence_kind,
          cadence_interval: Number(data.cadence_interval || 1),
          cadence_day:
            data.cadence_day !== "" && data.cadence_day != null
              ? Number(data.cadence_day)
              : null,
          next_date: data.next_date || todayISO(),
        });
        return redirect("/schedules", {
          type: "success",
          message: "Income schedule created",
        });
      }

      if (path === "/schedules/allowance") {
        schedules.createAllowanceRule({
          envelope_id: Number(data.envelope_id),
          amount: dollarsToCents(data.amount),
          cadence_kind: data.cadence_kind,
          cadence_interval: Number(data.cadence_interval || 1),
          cadence_day:
            data.cadence_day !== "" && data.cadence_day != null
              ? Number(data.cadence_day)
              : null,
          next_date: data.next_date || todayISO(),
        });
        return redirect("/schedules", {
          type: "success",
          message: "Allowance created",
        });
      }

      const incToggle = path.match(/^\/schedules\/income\/(\d+)\/toggle$/);
      if (incToggle) {
        const row = schedules
          .listIncomeSchedules()
          .find((s) => s.id === Number(incToggle[1]));
        if (row) schedules.updateIncomeSchedule(row.id, { active: !row.active });
        return redirect("/schedules");
      }

      const incDel = path.match(/^\/schedules\/income\/(\d+)\/delete$/);
      if (incDel) {
        schedules.deleteIncomeSchedule(Number(incDel[1]));
        return redirect("/schedules", {
          type: "success",
          message: "Income schedule deleted",
        });
      }

      const allToggle = path.match(/^\/schedules\/allowance\/(\d+)\/toggle$/);
      if (allToggle) {
        const row = schedules
          .listAllowanceRules()
          .find((r) => r.id === Number(allToggle[1]));
        if (row) schedules.updateAllowanceRule(row.id, { active: !row.active });
        return redirect("/schedules");
      }

      const allDel = path.match(/^\/schedules\/allowance\/(\d+)\/delete$/);
      if (allDel) {
        schedules.deleteAllowanceRule(Number(allDel[1]));
        return redirect("/schedules", {
          type: "success",
          message: "Allowance deleted",
        });
      }

      // Import (one or more QFX/OFX files; account auto-matched per file)
      if (path === "/import") {
        const uploads = (files && files.length ? files : file ? [file] : []).filter(
          (f) => f && (f.size > 0 || f.name)
        );
        if (!uploads.length) throw new Error("No file uploaded");

        const results = [];
        const failures = [];
        for (const upload of uploads) {
          const name = upload.name || "upload.ofx";
          try {
            const text = await upload.text();
            const result = importOfxFile(name, text, null);
            results.push(result);
          } catch (err) {
            failures.push({ name, message: err.message || String(err) });
          }
        }

        const added = results.reduce((s, r) => s + r.added, 0);
        const skipped = results.reduce((s, r) => s + r.skipped, 0);
        const txnErrors = results.reduce((s, r) => s + r.errors, 0);
        const transfers = results.reduce((s, r) => s + (r.transfers || 0), 0);
        const perFile = results.map((r) => {
          const t =
            r.transfers > 0 ? `, ${r.transfers} transfer${r.transfers === 1 ? "" : "s"}` : "";
          return `${r.account.name}: +${r.added}${t}`;
        });
        const bits = [];
        if (uploads.length > 1) {
          bits.push(`${results.length}/${uploads.length} files ok`);
        }
        if (perFile.length) bits.push(perFile.join("; "));
        else bits.push(`Imported ${added}`);
        if (transfers) bits.push(`${transfers} as transfers`);
        if (skipped) bits.push(`${skipped} duplicates skipped`);
        if (txnErrors) bits.push(`${txnErrors} txn errors`);
        if (failures.length) {
          bits.push(
            failures.map((f) => `${f.name}: ${f.message}`).join(" | ")
          );
        }

        return redirect("/import", {
          type:
            failures.length && !results.length
              ? "error"
              : failures.length
                ? "info"
                : added
                  ? "success"
                  : "info",
          message: bits.join(" — "),
        });
      }
    }

    return new Response("Not found", { status: 404 });
  } catch (err) {
    console.error(err);
    let dest = "/";
    const referer = req.headers.get("referer");
    if (referer) {
      try {
        const u = new URL(referer);
        dest = u.pathname + u.search;
      } catch {
        dest = "/";
      }
    }
    return redirect(dest, {
      type: "error",
      message: err.message || String(err),
    });
  }
}

const server = Bun.serve({
  hostname: HOST,
  port: PORT,
  fetch: handle,
});

console.log(`Budgie running at http://${HOST}:${server.port}`);

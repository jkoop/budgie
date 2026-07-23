import { migrate } from "./db.js";
import {
  html,
  isHtmx,
  parseBody,
  publicFile,
  readFlash,
  redirect,
} from "./http.js";
import * as budget from "./services/budget.js";
import * as schedules from "./services/schedules.js";
import * as goals from "./services/goals.js";
import { listImports } from "./services/ofx.js";
import * as writes from "./writes.js";
import { maybeTick } from "./tick.js";
import { handleMcpRequest } from "./mcp/http.js";
import {
  accountsPage,
  dashboardPage,
  envelopesPage,
  goalsPage,
  importPage,
  ledgerPage,
  ledgerRowsPartial,
  ledgerTransactionRowPartial,
  ledgerTransferLinkHtmxRows,
  schedulesPage,
  TXN_PAGE_SIZE,
} from "./views/pages.js";

migrate();

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";

function ledgerTxnRowHtmxResponse(txnId) {
  const txn = budget.getLedgerTransaction(txnId);
  const candidates =
    budget.transferLinkCandidatesByTxnId([txn]).get(txnId) || [];
  return html(
    ledgerTransactionRowPartial(txn, budget.listEnvelopes(), candidates)
  );
}

function ledgerTxnRowHtmxOrRedirect(req, txnId, flash) {
  if (isHtmx(req)) {
    const referer = req.headers.get("referer") || "";
    if (referer.includes("uncategorized=1")) {
      return html("");
    }
    return ledgerTxnRowHtmxResponse(txnId);
  }
  return redirect(req.headers.get("referer") || "/ledger", flash);
}

function ledgerTransferLinkHtmxOrRedirect(req, txnId, otherTxnId, flash) {
  if (isHtmx(req)) {
    const referer = req.headers.get("referer") || "";
    if (referer.includes("uncategorized=1")) {
      return html("");
    }
    const txn = budget.getLedgerTransaction(txnId);
    const other = budget.getLedgerTransaction(otherTxnId);
    return html(
      ledgerTransferLinkHtmxRows(txn, other, budget.listEnvelopes())
    );
  }
  return redirect(req.headers.get("referer") || "/ledger", flash);
}

export async function handle(req) {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method.toUpperCase();

  if (method === "GET" && path.startsWith("/public/")) {
    const filePath = publicFile(path);
    if (!filePath) return new Response("Not found", { status: 404 });
    const file = Bun.file(filePath);
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file);
  }

  if (path === "/mcp") {
    return handleMcpRequest(req);
  }

  try {
    maybeTick({ skip: path === "/ledger/rows" });
  } catch (err) {
    console.error("schedule tick failed:", err);
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
            transferCandidatesById:
              budget.transferLinkCandidatesByTxnId(transactions),
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
      const { data, files } = await parseBody(req);

      // Envelopes
      if (path === "/envelopes") {
        writes.createEnvelope(data);
        return redirect("/envelopes", {
          type: "success",
          message: "Envelope created",
        });
      }

      if (path === "/envelope-groups") {
        writes.createEnvelopeGroup(data);
        return redirect("/envelopes", {
          type: "success",
          message: "Group created",
        });
      }

      if (path === "/envelopes/assign") {
        writes.assignToEnvelope(data);
        const dest = req.headers.get("referer")?.includes("/envelopes")
          ? "/envelopes"
          : "/";
        return redirect(dest, {
          type: "success",
          message: "Assigned to envelope",
        });
      }

      if (path === "/envelopes/move") {
        writes.moveBetweenEnvelopes(data);
        return redirect("/envelopes", {
          type: "success",
          message: "Moved between envelopes",
        });
      }

      if (path === "/envelopes/cover") {
        writes.coverOverspend(data);
        return redirect("/envelopes", {
          type: "success",
          message: "Covered overspend from Ready",
        });
      }

      const envUpdate = path.match(/^\/envelopes\/(\d+)\/update$/);
      if (envUpdate) {
        writes.updateEnvelope(envUpdate[1], data);
        return redirect("/envelopes", {
          type: "success",
          message: "Envelope updated",
        });
      }

      // Accounts
      if (path === "/accounts") {
        writes.createAccount(data);
        return redirect("/accounts", {
          type: "success",
          message: "Account created",
        });
      }

      const acctUpdate = path.match(/^\/accounts\/(\d+)\/update$/);
      if (acctUpdate) {
        writes.updateAccount(acctUpdate[1], data);
        return redirect("/accounts", {
          type: "success",
          message: "Account updated",
        });
      }

      // Ledger (categorize / link transfer / delete — bank txns come from QFX import)
      const categorize = path.match(/^\/ledger\/(\d+)\/categorize$/);
      if (categorize) {
        const txnId = Number(categorize[1]);
        writes.categorizeTransaction(txnId, data);
        return ledgerTxnRowHtmxOrRedirect(req, txnId, {
          type: "success",
          message: "Categorized",
        });
      }

      const linkXfer = path.match(/^\/ledger\/(\d+)\/link-transfer$/);
      if (linkXfer) {
        const txnId = Number(linkXfer[1]);
        const otherTxnId = Number(data.other_id);
        writes.linkTransfer(txnId, data);
        return ledgerTransferLinkHtmxOrRedirect(req, txnId, otherTxnId, {
          type: "success",
          message: "Linked as transfer",
        });
      }

      const delTxn = path.match(/^\/ledger\/(\d+)\/delete$/);
      if (delTxn) {
        writes.deleteTransaction(delTxn[1]);
        return redirect("/ledger", {
          type: "success",
          message: "Transaction deleted",
        });
      }

      // Goals
      if (path === "/goals") {
        writes.createGoal(data);
        return redirect("/goals", {
          type: "success",
          message: "Goal created",
        });
      }

      const fundGoal = path.match(/^\/goals\/(\d+)\/fund$/);
      if (fundGoal) {
        writes.fundGoal(fundGoal[1], data);
        return redirect("/goals", {
          type: "success",
          message: "Goal funded",
        });
      }

      const delGoal = path.match(/^\/goals\/(\d+)\/delete$/);
      if (delGoal) {
        writes.deleteGoal(delGoal[1]);
        return redirect("/goals", {
          type: "success",
          message: "Goal deleted",
        });
      }

      // Schedules
      if (path === "/schedules/income") {
        writes.createIncomeSchedule(data);
        return redirect("/schedules", {
          type: "success",
          message: "Income schedule created",
        });
      }

      if (path === "/schedules/allowance") {
        writes.createAllowanceRule(data);
        return redirect("/schedules", {
          type: "success",
          message: "Allowance created",
        });
      }

      const incToggle = path.match(/^\/schedules\/income\/(\d+)\/toggle$/);
      if (incToggle) {
        writes.toggleIncomeSchedule(incToggle[1]);
        return redirect("/schedules");
      }

      const incDel = path.match(/^\/schedules\/income\/(\d+)\/delete$/);
      if (incDel) {
        writes.deleteIncomeSchedule(incDel[1]);
        return redirect("/schedules", {
          type: "success",
          message: "Income schedule deleted",
        });
      }

      const allToggle = path.match(/^\/schedules\/allowance\/(\d+)\/toggle$/);
      if (allToggle) {
        writes.toggleAllowanceRule(allToggle[1]);
        return redirect("/schedules");
      }

      const allDel = path.match(/^\/schedules\/allowance\/(\d+)\/delete$/);
      if (allDel) {
        writes.deleteAllowanceRule(allDel[1]);
        return redirect("/schedules", {
          type: "success",
          message: "Allowance deleted",
        });
      }

      // Import (one or more QFX/OFX files; account auto-matched per file)
      if (path === "/import") {
        const uploads = (files || []).filter((f) => f && (f.size > 0 || f.name));
        if (!uploads.length) throw new Error("No file uploaded");

        const filePayloads = [];
        for (const upload of uploads) {
          filePayloads.push({
            filename: upload.name || "upload.ofx",
            content: await upload.text(),
          });
        }
        const { results, failures } = writes.importOfxBatch(filePayloads);

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

if (import.meta.main) {
  const server = Bun.serve({
    hostname: HOST,
    port: PORT,
    fetch: handle,
  });

  console.log(`Budgie running at http://${HOST}:${server.port}`);
  console.log(`MCP endpoint at http://${HOST}:${server.port}/mcp`);
}

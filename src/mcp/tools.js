import { CAPABILITIES } from "../capabilities.js";
import { dollarsToCents } from "../money.js";
import { parseCadenceFields } from "../http.js";
import { maybeTick } from "../tick.js";
import * as actions from "../actions.js";
import * as budget from "../services/budget.js";
import * as schedules from "../services/schedules.js";
import * as goals from "../services/goals.js";
import { listImports } from "../services/ofx.js";
import { TXN_PAGE_SIZE } from "../views/pages.js";

const SKIP_TICK = new Set(
  CAPABILITIES.filter((c) => c.skipTick).map((c) => c.mcpTool)
);

const TOOL_DEFINITIONS = [
  {
    name: "get_dashboard",
    description:
      "Dashboard overview: Ready to Assign, account/envelope totals, uncategorized count, recent transactions, upcoming schedules, and goal progress.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_envelopes",
    description: "List envelope groups and envelopes with balances.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_accounts",
    description: "List accounts including archived, with balances and OFX account IDs.",
    inputSchema: {
      type: "object",
      properties: {
        include_archived: { type: "boolean", description: "Include archived accounts (default true)" },
      },
    },
  },
  {
    name: "list_transactions",
    description:
      "List ledger transactions with optional filters and pagination. Does not trigger schedule tick.",
    inputSchema: {
      type: "object",
      properties: {
        account_id: { type: "integer", description: "Filter by account ID" },
        envelope_id: { type: "integer", description: "Filter by envelope ID" },
        from: { type: "string", description: "Start date YYYY-MM-DD" },
        to: { type: "string", description: "End date YYYY-MM-DD" },
        uncategorized: { type: "boolean", description: "Only uncategorized expenses" },
        offset: { type: "integer", description: "Pagination offset (default 0)" },
        limit: { type: "integer", description: "Page size (default 50, max 100)" },
      },
    },
  },
  {
    name: "list_transfer_link_candidates",
    description: "List transactions that can be linked as a transfer pair with the given transaction.",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "integer", description: "Transaction ID" },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "list_goals",
    description: "List standalone goals and goal envelopes with progress.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_schedules",
    description: "List income schedules and envelope allowance rules.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_imports",
    description: "List recent OFX/QFX import history.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_transaction",
    description: "Get a single ledger transaction by ID.",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "integer", description: "Transaction ID" },
      },
      required: ["transaction_id"],
    },
  },
  {
    name: "create_envelope",
    description: "Create an envelope, optionally with a goal target.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        group_id: { type: "integer", description: "Envelope group ID" },
        target_amount: { type: "string", description: "Goal target in dollars, e.g. 500.00" },
        target_date: { type: "string", description: "Goal target date YYYY-MM-DD" },
      },
      required: ["name"],
    },
  },
  {
    name: "create_envelope_group",
    description: "Create an envelope group.",
    inputSchema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "assign_to_envelope",
    description: "Assign money from Ready to Assign to an envelope.",
    inputSchema: {
      type: "object",
      properties: {
        envelope_id: { type: "integer" },
        amount: { type: "string", description: "Dollar amount, e.g. 25.00" },
      },
      required: ["envelope_id", "amount"],
    },
  },
  {
    name: "move_between_envelopes",
    description: "Move money between two envelopes.",
    inputSchema: {
      type: "object",
      properties: {
        from_id: { type: "integer" },
        to_id: { type: "integer" },
        amount: { type: "string", description: "Dollar amount" },
      },
      required: ["from_id", "to_id", "amount"],
    },
  },
  {
    name: "cover_overspend",
    description: "Cover an overspent envelope from Ready to Assign.",
    inputSchema: {
      type: "object",
      properties: { envelope_id: { type: "integer" } },
      required: ["envelope_id"],
    },
  },
  {
    name: "update_envelope",
    description: "Update envelope name, group, goal target, or archived status.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        group_id: { type: "integer" },
        target_amount: { type: "string", description: "Dollar amount or empty string to clear" },
        target_date: { type: "string" },
        archived: { type: "boolean" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "create_account",
    description: "Create a bank account.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        ofx_account_id: { type: "string", description: "OFX ACCTID for import matching" },
      },
      required: ["name"],
    },
  },
  {
    name: "update_account",
    description: "Update account name, OFX ID, or archived status.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "integer" },
        name: { type: "string" },
        ofx_account_id: { type: "string" },
        archived: { type: "boolean" },
      },
      required: ["id", "name"],
    },
  },
  {
    name: "categorize_transaction",
    description: "Assign an uncategorized expense to an envelope.",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "integer" },
        envelope_id: { type: "integer" },
      },
      required: ["transaction_id", "envelope_id"],
    },
  },
  {
    name: "link_transfer",
    description: "Link two transactions on different accounts as a transfer pair.",
    inputSchema: {
      type: "object",
      properties: {
        transaction_id: { type: "integer" },
        other_transaction_id: { type: "integer" },
      },
      required: ["transaction_id", "other_transaction_id"],
    },
  },
  {
    name: "delete_transaction",
    description: "Delete a transaction and reverse its effects.",
    inputSchema: {
      type: "object",
      properties: { transaction_id: { type: "integer" } },
      required: ["transaction_id"],
    },
  },
  {
    name: "create_goal",
    description: "Create a standalone goal with optional auto-fund schedule.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        target_amount: { type: "string", description: "Dollar amount" },
        target_date: { type: "string" },
        source_envelope_id: { type: "integer" },
        auto_amount: { type: "string", description: "Auto-fund dollar amount" },
        cadence_kind: { type: "string", enum: ["daily", "weekly", "biweekly", "monthly", "yearly"] },
        cadence_interval: { type: "integer" },
        cadence_day: { type: "integer" },
        next_date: { type: "string" },
      },
      required: ["name", "target_amount"],
    },
  },
  {
    name: "fund_goal",
    description: "Manually fund a standalone goal from Ready or source envelope.",
    inputSchema: {
      type: "object",
      properties: {
        goal_id: { type: "integer" },
        amount: { type: "string", description: "Dollar amount" },
      },
      required: ["goal_id", "amount"],
    },
  },
  {
    name: "delete_goal",
    description: "Delete a standalone goal.",
    inputSchema: {
      type: "object",
      properties: { goal_id: { type: "integer" } },
      required: ["goal_id"],
    },
  },
  {
    name: "create_income_schedule",
    description: "Create a recurring income schedule.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string" },
        amount: { type: "string", description: "Dollar amount" },
        account_id: { type: "integer" },
        payee: { type: "string" },
        cadence_kind: { type: "string", enum: ["daily", "weekly", "biweekly", "monthly", "yearly"] },
        cadence_interval: { type: "integer" },
        cadence_day: { type: "integer" },
        next_date: { type: "string" },
      },
      required: ["name", "amount", "account_id", "cadence_kind"],
    },
  },
  {
    name: "create_allowance_rule",
    description: "Create a recurring envelope allowance rule.",
    inputSchema: {
      type: "object",
      properties: {
        envelope_id: { type: "integer" },
        amount: { type: "string", description: "Dollar amount" },
        cadence_kind: { type: "string", enum: ["daily", "weekly", "biweekly", "monthly", "yearly"] },
        cadence_interval: { type: "integer" },
        cadence_day: { type: "integer" },
        next_date: { type: "string" },
      },
      required: ["envelope_id", "amount", "cadence_kind"],
    },
  },
  {
    name: "toggle_income_schedule",
    description: "Enable or disable an income schedule.",
    inputSchema: {
      type: "object",
      properties: { schedule_id: { type: "integer" } },
      required: ["schedule_id"],
    },
  },
  {
    name: "delete_income_schedule",
    description: "Delete an income schedule.",
    inputSchema: {
      type: "object",
      properties: { schedule_id: { type: "integer" } },
      required: ["schedule_id"],
    },
  },
  {
    name: "toggle_allowance_rule",
    description: "Enable or disable an allowance rule.",
    inputSchema: {
      type: "object",
      properties: { rule_id: { type: "integer" } },
      required: ["rule_id"],
    },
  },
  {
    name: "delete_allowance_rule",
    description: "Delete an allowance rule.",
    inputSchema: {
      type: "object",
      properties: { rule_id: { type: "integer" } },
      required: ["rule_id"],
    },
  },
  {
    name: "import_ofx",
    description: "Import transactions from OFX/QFX file content.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "Raw OFX/QFX file text" },
        filename: { type: "string", description: "Filename for logging (default upload.ofx)" },
      },
      required: ["content"],
    },
  },
];

export function listToolDefinitions() {
  return TOOL_DEFINITIONS;
}

function handleTool(name, args) {
  switch (name) {
    case "get_dashboard":
      return {
        stats: budget.dashboardStats(),
        groups: budget.envelopesByGroup(),
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
      };
    case "list_envelopes":
      return {
        groups: budget.envelopesByGroup(),
        envelopes: budget.listEnvelopes(),
      };
    case "list_accounts":
      return {
        accounts: budget.listAccounts({
          includeArchived: args.include_archived !== false,
        }),
      };
    case "list_transactions": {
      const limit = Math.min(100, Math.max(1, args.limit || TXN_PAGE_SIZE));
      const offset = Math.max(0, args.offset || 0);
      const batch = budget.listTransactions({
        account_id: args.account_id || undefined,
        envelope_id: args.envelope_id || undefined,
        from: args.from || undefined,
        to: args.to || undefined,
        uncategorized: args.uncategorized || undefined,
        limit: limit + 1,
        offset,
      });
      const hasMore = batch.length > limit;
      return {
        transactions: hasMore ? batch.slice(0, limit) : batch,
        offset,
        has_more: hasMore,
      };
    }
    case "list_transfer_link_candidates": {
      const txn = budget.getLedgerTransaction(args.transaction_id);
      if (!txn) throw new Error("Transaction not found");
      return {
        candidates: budget.listTransferLinkCandidates(args.transaction_id),
      };
    }
    case "list_goals":
      return {
        goals: goals.listGoals({ includeInactive: true }),
        goalEnvelopes: goals.listGoalEnvelopes(),
        envelopes: budget.listEnvelopes(),
      };
    case "list_schedules":
      return {
        incomeSchedules: schedules.listIncomeSchedules(),
        allowanceRules: schedules.listAllowanceRules(),
        accounts: budget.listAccounts(),
        envelopes: budget.listEnvelopes(),
      };
    case "list_imports":
      return { imports: listImports(), accounts: budget.listAccounts() };
    case "get_transaction": {
      const txn = budget.getLedgerTransaction(args.transaction_id);
      if (!txn) throw new Error("Transaction not found");
      return { transaction: txn };
    }
    case "create_envelope":
      return actions.createEnvelope({
        name: args.name,
        groupId: args.group_id ? Number(args.group_id) : null,
        targetAmountCents: args.target_amount
          ? dollarsToCents(args.target_amount)
          : null,
        targetDate: args.target_date || null,
      });
    case "create_envelope_group":
      return actions.createEnvelopeGroup({ name: args.name });
    case "assign_to_envelope":
      return actions.assignToEnvelope({
        envelopeId: Number(args.envelope_id),
        amountCents: dollarsToCents(args.amount),
      });
    case "move_between_envelopes":
      return actions.moveBetweenEnvelopes({
        fromId: Number(args.from_id),
        toId: Number(args.to_id),
        amountCents: dollarsToCents(args.amount),
      });
    case "cover_overspend":
      return actions.coverOverspend({ envelopeId: Number(args.envelope_id) });
    case "update_envelope": {
      const targetRaw = (args.target_amount ?? "").trim();
      return actions.updateEnvelope({
        id: Number(args.id),
        name: args.name,
        groupId: args.group_id ? Number(args.group_id) : null,
        targetAmountCents:
          targetRaw === "" ? null : dollarsToCents(targetRaw),
        targetDate: args.target_date || null,
        archived: Boolean(args.archived),
      });
    }
    case "create_account":
      return actions.createAccount({
        name: args.name,
        ofxAccountId: args.ofx_account_id || null,
      });
    case "update_account":
      return actions.updateAccount({
        id: Number(args.id),
        name: args.name,
        ofxAccountId: args.ofx_account_id,
        archived: Boolean(args.archived),
      });
    case "categorize_transaction":
      return actions.categorizeTransaction({
        transactionId: Number(args.transaction_id),
        envelopeId: Number(args.envelope_id),
      });
    case "link_transfer":
      return actions.linkTransfer({
        transactionId: Number(args.transaction_id),
        otherTransactionId: Number(args.other_transaction_id),
      });
    case "delete_transaction":
      return actions.deleteTransaction({
        transactionId: Number(args.transaction_id),
      });
    case "create_goal": {
      const auto = args.auto_amount ? dollarsToCents(args.auto_amount) : null;
      const cadence = auto ? parseCadenceFields(args) : null;
      return actions.createGoal({
        name: args.name,
        targetAmountCents: dollarsToCents(args.target_amount),
        targetDate: args.target_date || null,
        sourceEnvelopeId: args.source_envelope_id
          ? Number(args.source_envelope_id)
          : null,
        autoAmountCents: auto,
        cadence,
      });
    }
    case "fund_goal":
      return actions.fundGoal({
        goalId: Number(args.goal_id),
        amountCents: dollarsToCents(args.amount),
      });
    case "delete_goal":
      return actions.deleteGoal({ goalId: Number(args.goal_id) });
    case "create_income_schedule":
      return actions.createIncomeSchedule({
        name: args.name,
        amountCents: dollarsToCents(args.amount),
        accountId: Number(args.account_id),
        payee: args.payee || args.name,
        cadence: parseCadenceFields(args),
      });
    case "create_allowance_rule":
      return actions.createAllowanceRule({
        envelopeId: Number(args.envelope_id),
        amountCents: dollarsToCents(args.amount),
        cadence: parseCadenceFields(args),
      });
    case "toggle_income_schedule":
      return actions.toggleIncomeSchedule({
        scheduleId: Number(args.schedule_id),
      });
    case "delete_income_schedule":
      return actions.deleteIncomeSchedule({
        scheduleId: Number(args.schedule_id),
      });
    case "toggle_allowance_rule":
      return actions.toggleAllowanceRule({ ruleId: Number(args.rule_id) });
    case "delete_allowance_rule":
      return actions.deleteAllowanceRule({ ruleId: Number(args.rule_id) });
    case "import_ofx": {
      const { results, failures } = actions.importOfxBatch([
        {
          filename: args.filename || "upload.ofx",
          content: args.content,
        },
      ]);
      if (failures.length) throw new Error(failures[0].message);
      return results[0];
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export function callTool(name, args = {}) {
  try {
    maybeTick({ skip: SKIP_TICK.has(name) });
    const result = handleTool(name, args);
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: err.message || String(err) }],
      isError: true,
    };
  }
}

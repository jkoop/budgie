/**
 * Single source of truth for GUI ↔ MCP capability parity.
 * Every user-facing action appears exactly once with both gui and mcpTool.
 */
export const CAPABILITIES = [
  // ——— Read ———
  {
    id: "get_dashboard",
    kind: "read",
    gui: { method: "GET", path: "/" },
    mcpTool: "get_dashboard",
  },
  {
    id: "list_envelopes",
    kind: "read",
    gui: { method: "GET", path: "/envelopes" },
    mcpTool: "list_envelopes",
  },
  {
    id: "list_accounts",
    kind: "read",
    gui: { method: "GET", path: "/accounts" },
    mcpTool: "list_accounts",
  },
  {
    id: "list_transactions",
    kind: "read",
    gui: { method: "GET", path: "/ledger" },
    mcpTool: "list_transactions",
    skipTick: true,
  },
  {
    id: "list_transfer_link_candidates",
    kind: "read",
    gui: { method: "GET", path: "/ledger" },
    mcpTool: "list_transfer_link_candidates",
  },
  {
    id: "list_goals",
    kind: "read",
    gui: { method: "GET", path: "/goals" },
    mcpTool: "list_goals",
  },
  {
    id: "list_schedules",
    kind: "read",
    gui: { method: "GET", path: "/schedules" },
    mcpTool: "list_schedules",
  },
  {
    id: "list_imports",
    kind: "read",
    gui: { method: "GET", path: "/import" },
    mcpTool: "list_imports",
  },
  {
    id: "get_transaction",
    kind: "read",
    gui: { method: "GET", path: "/ledger" },
    mcpTool: "get_transaction",
  },
  // ——— Write ———
  {
    id: "create_envelope",
    kind: "write",
    gui: { method: "POST", path: "/envelopes" },
    mcpTool: "create_envelope",
  },
  {
    id: "create_envelope_group",
    kind: "write",
    gui: { method: "POST", path: "/envelope-groups" },
    mcpTool: "create_envelope_group",
  },
  {
    id: "assign_to_envelope",
    kind: "write",
    gui: { method: "POST", path: "/envelopes/assign" },
    mcpTool: "assign_to_envelope",
  },
  {
    id: "move_between_envelopes",
    kind: "write",
    gui: { method: "POST", path: "/envelopes/move" },
    mcpTool: "move_between_envelopes",
  },
  {
    id: "cover_overspend",
    kind: "write",
    gui: { method: "POST", path: "/envelopes/cover" },
    mcpTool: "cover_overspend",
  },
  {
    id: "update_envelope",
    kind: "write",
    gui: { method: "POST", path: "/envelopes/:id/update" },
    mcpTool: "update_envelope",
  },
  {
    id: "create_account",
    kind: "write",
    gui: { method: "POST", path: "/accounts" },
    mcpTool: "create_account",
  },
  {
    id: "update_account",
    kind: "write",
    gui: { method: "POST", path: "/accounts/:id/update" },
    mcpTool: "update_account",
  },
  {
    id: "categorize_transaction",
    kind: "write",
    gui: { method: "POST", path: "/ledger/:id/categorize" },
    mcpTool: "categorize_transaction",
  },
  {
    id: "link_transfer",
    kind: "write",
    gui: { method: "POST", path: "/ledger/:id/link-transfer" },
    mcpTool: "link_transfer",
  },
  {
    id: "delete_transaction",
    kind: "write",
    gui: { method: "POST", path: "/ledger/:id/delete" },
    mcpTool: "delete_transaction",
  },
  {
    id: "create_goal",
    kind: "write",
    gui: { method: "POST", path: "/goals" },
    mcpTool: "create_goal",
  },
  {
    id: "fund_goal",
    kind: "write",
    gui: { method: "POST", path: "/goals/:id/fund" },
    mcpTool: "fund_goal",
  },
  {
    id: "delete_goal",
    kind: "write",
    gui: { method: "POST", path: "/goals/:id/delete" },
    mcpTool: "delete_goal",
  },
  {
    id: "create_income_schedule",
    kind: "write",
    gui: { method: "POST", path: "/schedules/income" },
    mcpTool: "create_income_schedule",
  },
  {
    id: "create_allowance_rule",
    kind: "write",
    gui: { method: "POST", path: "/schedules/allowance" },
    mcpTool: "create_allowance_rule",
  },
  {
    id: "toggle_income_schedule",
    kind: "write",
    gui: { method: "POST", path: "/schedules/income/:id/toggle" },
    mcpTool: "toggle_income_schedule",
  },
  {
    id: "delete_income_schedule",
    kind: "write",
    gui: { method: "POST", path: "/schedules/income/:id/delete" },
    mcpTool: "delete_income_schedule",
  },
  {
    id: "toggle_allowance_rule",
    kind: "write",
    gui: { method: "POST", path: "/schedules/allowance/:id/toggle" },
    mcpTool: "toggle_allowance_rule",
  },
  {
    id: "delete_allowance_rule",
    kind: "write",
    gui: { method: "POST", path: "/schedules/allowance/:id/delete" },
    mcpTool: "delete_allowance_rule",
  },
  {
    id: "import_ofx",
    kind: "write",
    gui: { method: "POST", path: "/import" },
    mcpTool: "import_ofx",
  },
];

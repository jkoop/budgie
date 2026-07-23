import { dollarsToCents } from "./money.js";
import { parseCadenceFields } from "./http.js";
import * as budget from "./services/budget.js";
import * as schedules from "./services/schedules.js";
import * as goals from "./services/goals.js";
import { importOfxFile } from "./services/ofx.js";

/** Form checkbox or JSON boolean. */
function archivedFrom(value) {
  return value === "1" || value === true;
}

function targetAmountCents(target_amount) {
  const raw = (target_amount ?? "").trim();
  return raw === "" ? null : dollarsToCents(raw);
}

export function createEnvelope(input) {
  return budget.createEnvelope({
    name: input.name,
    group_id: input.group_id ? Number(input.group_id) : null,
    target_amount: input.target_amount ? dollarsToCents(input.target_amount) : null,
    target_date: input.target_date || null,
  });
}

export function createEnvelopeGroup(input) {
  return budget.createGroup(input.name);
}

export function assignToEnvelope(input) {
  return budget.assignToEnvelope(
    Number(input.envelope_id),
    dollarsToCents(input.amount)
  );
}

export function moveBetweenEnvelopes(input) {
  return budget.moveBetweenEnvelopes(
    Number(input.from_id),
    Number(input.to_id),
    dollarsToCents(input.amount)
  );
}

export function coverOverspend(input) {
  return budget.coverOverspend(Number(input.envelope_id));
}

export function updateEnvelope(id, input) {
  return budget.updateEnvelope(Number(id), {
    name: input.name,
    group_id: input.group_id ? Number(input.group_id) : null,
    target_amount: targetAmountCents(input.target_amount),
    target_date: input.target_date || null,
    archived: archivedFrom(input.archived),
  });
}

export function createAccount(input) {
  return budget.createAccount(input.name, input.ofx_account_id || null);
}

export function updateAccount(id, input) {
  return budget.updateAccount(Number(id), {
    name: input.name,
    ofx_account_id: input.ofx_account_id,
    archived: archivedFrom(input.archived),
  });
}

export function categorizeTransaction(txnId, input) {
  return budget.categorizeTransaction(
    Number(txnId),
    Number(input.envelope_id)
  );
}

export function linkTransfer(txnId, input) {
  const otherId = input.other_id ?? input.other_transaction_id;
  return budget.linkTransactionsAsTransfer(Number(txnId), Number(otherId));
}

export function deleteTransaction(txnId) {
  return budget.deleteTransaction(Number(txnId));
}

export function createGoal(input) {
  const auto = input.auto_amount ? dollarsToCents(input.auto_amount) : null;
  const cadence = auto ? parseCadenceFields(input) : null;
  return goals.createGoal({
    name: input.name,
    target_amount: dollarsToCents(input.target_amount),
    target_date: input.target_date || null,
    source_envelope_id: input.source_envelope_id
      ? Number(input.source_envelope_id)
      : null,
    auto_amount: auto,
    cadence_kind: cadence?.cadence_kind ?? null,
    cadence_interval: cadence?.cadence_interval ?? null,
    cadence_day: cadence?.cadence_day ?? null,
    next_date: cadence?.next_date ?? null,
  });
}

export function fundGoal(goalId, input) {
  return goals.fundGoal(Number(goalId), dollarsToCents(input.amount));
}

export function deleteGoal(goalId) {
  return goals.deleteGoal(Number(goalId));
}

export function createIncomeSchedule(input) {
  return schedules.createIncomeSchedule({
    name: input.name,
    amount: dollarsToCents(input.amount),
    account_id: Number(input.account_id),
    payee: input.payee || input.name,
    ...parseCadenceFields(input),
  });
}

export function createAllowanceRule(input) {
  return schedules.createAllowanceRule({
    envelope_id: Number(input.envelope_id),
    amount: dollarsToCents(input.amount),
    ...parseCadenceFields(input),
  });
}

export function toggleIncomeSchedule(scheduleId) {
  return schedules.toggleIncomeSchedule(Number(scheduleId));
}

export function deleteIncomeSchedule(scheduleId) {
  return schedules.deleteIncomeSchedule(Number(scheduleId));
}

export function toggleAllowanceRule(ruleId) {
  return schedules.toggleAllowanceRule(Number(ruleId));
}

export function deleteAllowanceRule(ruleId) {
  return schedules.deleteAllowanceRule(Number(ruleId));
}

export function importOfxBatch(files) {
  const results = [];
  const failures = [];
  for (const { filename, content } of files) {
    const name = filename || "upload.ofx";
    try {
      results.push(importOfxFile(name, content));
    } catch (err) {
      failures.push({ name, message: err.message || String(err) });
    }
  }
  return { results, failures };
}

export function importOfx(input) {
  const { results, failures } = importOfxBatch([
    { filename: input.filename || "upload.ofx", content: input.content },
  ]);
  if (failures.length) throw new Error(failures[0].message);
  return results[0];
}

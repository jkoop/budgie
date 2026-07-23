import * as budget from "./services/budget.js";
import * as schedules from "./services/schedules.js";
import * as goals from "./services/goals.js";
import { importOfxFile } from "./services/ofx.js";

export function createEnvelope({
  name,
  groupId = null,
  targetAmountCents = null,
  targetDate = null,
}) {
  return budget.createEnvelope({
    name,
    group_id: groupId,
    target_amount: targetAmountCents,
    target_date: targetDate,
  });
}

export function createEnvelopeGroup({ name }) {
  return budget.createGroup(name);
}

export function assignToEnvelope({ envelopeId, amountCents }) {
  return budget.assignToEnvelope(envelopeId, amountCents);
}

export function moveBetweenEnvelopes({ fromId, toId, amountCents }) {
  return budget.moveBetweenEnvelopes(fromId, toId, amountCents);
}

export function coverOverspend({ envelopeId }) {
  return budget.coverOverspend(envelopeId);
}

export function updateEnvelope({
  id,
  name,
  groupId = null,
  targetAmountCents,
  targetDate = null,
  archived = false,
}) {
  return budget.updateEnvelope(id, {
    name,
    group_id: groupId,
    target_amount: targetAmountCents,
    target_date: targetDate,
    archived,
  });
}

export function createAccount({ name, ofxAccountId = null }) {
  return budget.createAccount(name, ofxAccountId);
}

export function updateAccount({
  id,
  name,
  ofxAccountId,
  archived = false,
}) {
  return budget.updateAccount(id, {
    name,
    ofx_account_id: ofxAccountId,
    archived,
  });
}

export function categorizeTransaction({ transactionId, envelopeId }) {
  return budget.categorizeTransaction(transactionId, envelopeId);
}

export function linkTransfer({ transactionId, otherTransactionId }) {
  return budget.linkTransactionsAsTransfer(transactionId, otherTransactionId);
}

export function deleteTransaction({ transactionId }) {
  return budget.deleteTransaction(transactionId);
}

export function createGoal({
  name,
  targetAmountCents,
  targetDate = null,
  sourceEnvelopeId = null,
  autoAmountCents = null,
  cadence = null,
}) {
  return goals.createGoal({
    name,
    target_amount: targetAmountCents,
    target_date: targetDate,
    source_envelope_id: sourceEnvelopeId,
    auto_amount: autoAmountCents,
    cadence_kind: autoAmountCents && cadence ? cadence.cadence_kind : null,
    cadence_interval: autoAmountCents && cadence ? cadence.cadence_interval : null,
    cadence_day: autoAmountCents && cadence ? cadence.cadence_day : null,
    next_date: autoAmountCents && cadence ? cadence.next_date : null,
  });
}

export function fundGoal({ goalId, amountCents }) {
  return goals.fundGoal(goalId, amountCents);
}

export function deleteGoal({ goalId }) {
  return goals.deleteGoal(goalId);
}

export function createIncomeSchedule({
  name,
  amountCents,
  accountId,
  payee,
  cadence,
}) {
  return schedules.createIncomeSchedule({
    name,
    amount: amountCents,
    account_id: accountId,
    payee,
    ...cadence,
  });
}

export function createAllowanceRule({ envelopeId, amountCents, cadence }) {
  return schedules.createAllowanceRule({
    envelope_id: envelopeId,
    amount: amountCents,
    ...cadence,
  });
}

export function toggleIncomeSchedule({ scheduleId }) {
  return schedules.toggleIncomeSchedule(scheduleId);
}

export function deleteIncomeSchedule({ scheduleId }) {
  return schedules.deleteIncomeSchedule(scheduleId);
}

export function toggleAllowanceRule({ ruleId }) {
  return schedules.toggleAllowanceRule(ruleId);
}

export function deleteAllowanceRule({ ruleId }) {
  return schedules.deleteAllowanceRule(ruleId);
}

export function importOfx({ filename, content }) {
  return importOfxFile(filename, content);
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

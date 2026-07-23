import { todayISO } from "./money.js";
import * as schedules from "./services/schedules.js";

const TICK_MIN_INTERVAL_MS = 2000;
let lastTickAt = 0;

/** Debounced schedule tick — mirrors GUI page-load behaviour. */
export function maybeTick({ skip = false } = {}) {
  if (skip) return;
  const now = Date.now();
  if (now - lastTickAt < TICK_MIN_INTERVAL_MS) return;
  lastTickAt = now;
  schedules.tick(todayISO());
}

/** Reset debounce clock (tests only). */
export function resetTickDebounce() {
  lastTickAt = 0;
}

// This module is trusted host code, never writable through an agent tool.
export const POLICY = Object.freeze({
  mode: 'PAPER_ONLY', initialCents: 5000, currency: 'EUR',
  feeBps: 40, slippageBps: 10, maxSpreadBps: 35,
  maxOrderCents: 500, maxExposureCents: 1500, maxPositions: 3,
  maxRiskCents: 50, dailyLossCents: 150, drawdownStopBps: 2000,
  maxHoldingMinutes: 360, maxQuoteAgeMs: 20_000,
  maxRunsPerDay: 8, maxSpawnsPerDay: 2, maxToolsPerRun: 24,
  runProvisionCents: 10, maxNotesPerDay: 40
});
export const SYMBOLS = Object.freeze({'BTC/EUR':'XBTEUR','ETH/EUR':'ETHEUR','SOL/EUR':'SOLEUR'});
export function check(ok, message) { if (!ok) throw new Error(message); }
export function integer(value, name, min=0, max=Number.MAX_SAFE_INTEGER) {
  check(Number.isSafeInteger(value) && value>=min && value<=max, `Invalid ${name}`); return value;
}
export function boundedText(value, name, max=20000) {
  check(typeof value==='string' && value.trim().length>0 && value.length<=max, `Invalid ${name}`); return value;
}
export function positive(value, name) {
  check(Number.isFinite(value) && value>0, `Invalid ${name}`); return value;
}
export const utcDay = ms => new Date(ms).toISOString().slice(0,10);
export const fee = cents => Math.ceil(cents * POLICY.feeBps / 10000);

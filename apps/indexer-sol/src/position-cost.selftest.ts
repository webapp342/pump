/**
 * Self-test for avg-cost + USD implied-rate fallback.
 *   npm run test:position-cost -w @pump/indexer-sol
 */
import {
  applyTradeToPositionCost,
  emptyPositionCostState,
} from "./position-cost.js";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

let state = emptyPositionCostState();
state = applyTradeToPositionCost(state, true, 1.0, 0.01, 1_000_000, 150);
assert(Math.abs(state.remainingCostBasis - 0.99) < 1e-9, "buy native cost");
assert(Math.abs(state.remainingCostBasisUsd - 0.99 * 150) < 1e-6, "buy usd cost");

// Second buy without oracle should inherit implied FX
state = applyTradeToPositionCost(state, true, 0.5, 0.005, 400_000, null);
assert(state.remainingCostBasisUsd > 0.99 * 150, "implied usd grows");

const beforeSellUsd = state.remainingCostBasisUsd;
state = applyTradeToPositionCost(state, false, 0.4, 0.004, 500_000, 150);
assert(state.tokenBalance > 0, "partial sell keeps balance");
assert(state.remainingCostBasisUsd < beforeSellUsd, "sell reduces usd cost");
assert(state.realizedPnlUsd !== 0 || state.realizedPnl !== 0, "realized moves");

console.log("test:position-cost ok");

/**
 * Bonding curve test:
 * 1. Create 1 bonding curve
 * 2. Run 10 swaps on that pool; for each swap: estimate then tokensOutForSolIn, assert equal
 */

import {
  createBondingCurvePool,
  estimate_TokensOutForSolIn,
  tokensOutForSolIn,
  getCurveState,
  DEFAULT_BONDING_CURVE_SUPPLY,
  DEFAULT_GRADUATION_AMOUNT_SOL,
} from "./bondingCurve.js";
import { clearBondingCurves } from "./data_store.js";
import BN from "bn.js";

// 0.0062 SOL in lamports
const SOL_PER_BUY = new BN(6_200_000);
const NUM_SWAPS = 10;

async function runTest() {
  clearBondingCurves();

  // 1. Create 1 bonding curve
  const poolId = createBondingCurvePool(DEFAULT_GRADUATION_AMOUNT_SOL, DEFAULT_BONDING_CURVE_SUPPLY);
  console.log("Created 1 bonding curve pool:", poolId);

  // 2. Run 10 swaps on the same pool; each swap: estimate then tokensOutForSolIn
  let passed = 0;
  for (let i = 0; i < NUM_SWAPS; i++) {
    const estimate = estimate_TokensOutForSolIn(poolId, SOL_PER_BUY);
    const actualTokensOut = tokensOutForSolIn(poolId, SOL_PER_BUY);
    const ok = estimate.tokens_out.eq(actualTokensOut);
    if (ok) passed++;

    const state = getCurveState(poolId)!;
    console.log(
      ok ? "ok" : "FAIL",
      `swap ${i + 1}/${NUM_SWAPS}`,
      "total_sol_raised_SOL:",
      (state.total_sol_raised.toNumber() / 1_000_000_000).toFixed(6),
      "total_tokens_minted:",
      state.total_game_tokens_minted.toString(),
      "| estimated:",
      estimate.tokens_out.toString(),
      "actual:",
      actualTokensOut.toString()
    );
  }

  console.log("\nResult:", passed === NUM_SWAPS ? "PASS" : "FAIL", `(${passed}/${NUM_SWAPS} swaps)`);
  if (passed !== NUM_SWAPS) process.exit(1);
}

await runTest();

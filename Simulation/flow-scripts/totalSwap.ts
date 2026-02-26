import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import {
  canSwap,
  createBondingCurvePool,
  DEFAULT_BONDING_CURVE_SUPPLY,
  DEFAULT_GRADUATION_AMOUNT_SOL,
  estimate_SolrequiredForTokenout,
  estimate_TokensOutForSolIn,
  getCurveState,
  getMintedAndRemaining,
  tokensOutForSolIn,
  getPricePerTokenInSol,
  getRetainMultiplier,
  computeTokensDistributionWithReserve,
} from "../bondingCurve.js";
import { setBondingCurve } from "../data_store.js";

function main() {
  // For now we create a fresh pool; later you can plug in an existing id.
  const bondingCurveId = createBondingCurvePool(
    DEFAULT_GRADUATION_AMOUNT_SOL,
    DEFAULT_BONDING_CURVE_SUPPLY
  );

  console.log("Bonding curve ID:", bondingCurveId);

  const defaultSolAmount = 0.0062;
  let solAmountLamports = new BN(Math.round(defaultSolAmount * LAMPORTS_PER_SOL));

  // 1) First, check if we can swap at all for this SOL amount.
  const canSwapNow = canSwap(bondingCurveId, solAmountLamports);
  if (!canSwapNow) {
    console.log("Cannot swap for this amount right now (curve or pool constraints).");
    return;
  }

  // 2) Load current curve state.
  const curve = getCurveState(bondingCurveId);
  if (!curve) {
    console.error("Bonding curve not found after creation.");
    return;
  }

  console.log("Bonding curve:", {
    ...curve,
    total_sol_raised: curve.total_sol_raised.toString(),
    total_game_tokens_minted: curve.total_game_tokens_minted.toString(),
    token_pool_balance: curve.token_pool_balance.toString(),
    protocol_reserve_tokens: curve.protocol_reserve_tokens.toString(),
  });

  if (!curve.graduated) {
    // BEFORE GRADUATION:
    // Do similar mechanics as in bondingCurve.graduation_retain.test.ts:
    // - Use default 0.0062 SOL
    // - If remaining tokens < estimate for 0.0062 SOL, reduce SOL to just buy the remainder.

    const mintedDetails = getMintedAndRemaining(bondingCurveId);

    // Estimate tokens for default SOL (no swap yet)
    const estimateForDefault = estimate_TokensOutForSolIn(bondingCurveId, solAmountLamports);
    console.log("Tokens remaining:", mintedDetails.tokens_remaining.toString());
    console.log(
      "Estimated tokens for",
      defaultSolAmount,
      "SOL:",
      estimateForDefault.tokens_out.toString()
    );

    // If curve has fewer tokens left than a full 0.0062 SOL would buy, use SOL required for remaining
    if (mintedDetails.tokens_remaining.lt(estimateForDefault.tokens_out)) {
      solAmountLamports = estimate_SolrequiredForTokenout(
        bondingCurveId,
        mintedDetails.tokens_remaining
      );
    }

    console.log("Swapping on bonding curve (pre‑graduation)...");

    // State before swap (already in `curve`), perform swap, then read state after.
    const tokensOut = tokensOutForSolIn(bondingCurveId, solAmountLamports);
    const stateAfter = getCurveState(bondingCurveId);
    if (!stateAfter) {
      console.error("Bonding curve state missing after swap.");
      return;
    }

    const actualSolLamports = stateAfter.total_sol_raised.sub(curve.total_sol_raised);
    const actualSolSOL = actualSolLamports.toNumber() / LAMPORTS_PER_SOL;
    const totalSolRaisedSOL = stateAfter.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
    const pricePerTokenSOL = getPricePerTokenInSol(bondingCurveId, totalSolRaisedSOL);
    const retainMultiplier = getRetainMultiplier(bondingCurveId, totalSolRaisedSOL);
    const graduationAmountSOL = stateAfter.graduation_amount;
    const finalPriceSOL = getPricePerTokenInSol(bondingCurveId, graduationAmountSOL);

    // Use protocol_reserve_tokens as the reserve for the 3.7x logic.
    const reserveAvailable = stateAfter.protocol_reserve_tokens;
    const { tokens_to_distribute, tokens_saved, reserve_used } = computeTokensDistributionWithReserve(
      actualSolLamports,
      tokensOut,
      pricePerTokenSOL,
      finalPriceSOL,
      reserveAvailable
    );

    const updatedProtocolReserve = reserveAvailable.add(tokens_saved).sub(reserve_used);
    setBondingCurve({
      ...stateAfter,
      protocol_reserve_tokens: updatedProtocolReserve,
    });

    const TOKEN_LAMPORTS_NUM = 1e9;
    const tokensDistWhole = tokens_to_distribute.div(new BN(TOKEN_LAMPORTS_NUM)).toNumber();
    const effectiveReturnX =
      actualSolSOL > 0 && finalPriceSOL > 0 ? (tokensDistWhole * finalPriceSOL) / actualSolSOL : 0;

    console.log("Swap result (pre‑graduation with reserve logic):", {
      sol_in_SOL: actualSolSOL.toFixed(6),
      price_per_token_SOL: pricePerTokenSOL.toExponential(10),
      retain_multiplier: retainMultiplier.toFixed(10),
      tokens_out_actual: tokensOut.toString(),
      tokens_to_distribute: tokens_to_distribute.toString(),
      tokens_saved: tokens_saved.toString(),
      reserve_used: reserve_used.toString(),
      protocol_reserve_tokens: updatedProtocolReserve.toString(),
      effective_return_x: effectiveReturnX.toFixed(6),
    });
  } else {
    // AFTER GRADUATION:
    // Do mechanics similar to swap.ts, but now this should represent pool‑based swaps.
    // For now we just reuse the same default amount and log that this is a post‑graduation swap.

    console.log("Curve already graduated; performing pool‑based style swap...");

    // In a real implementation you would use curve.token_pool_balance and SOL pool balances here.
    console.log("Swapping using default amount:", defaultSolAmount, "SOL");
    const tokensOut = tokensOutForSolIn(bondingCurveId, solAmountLamports);
    console.log("Tokens out (post‑graduation path):", tokensOut.toString());
  }
}

main();
/**
 * Graduation test for a single bonding curve:
 * - Create 1 bonding curve
 * - Repeatedly swap using same logic as swap.ts: default 0.0062 SOL, or SOL required for remaining if less
 * - Assert estimate === actual and that curve graduates at graduation_amount
 * - Writes all swaps to CSV (Simulation/graduation_swaps.csv)
 */

import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createBondingCurvePool,
  tokensOutForSolIn,
  estimate_TokensOutForSolIn,
  estimate_SolrequiredForTokenout,
  getCurveState,
  getMintedAndRemaining,
  getPricePerTokenInSol,
  getRetainMultiplier,
  DEFAULT_BONDING_CURVE_SUPPLY,
  DEFAULT_GRADUATION_AMOUNT_SOL,
} from "./bondingCurve.js";
import { clearBondingCurves } from "./data_store.js";
import BN from "bn.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const LAMPORTS_PER_SOL = 1_000_000_000;
const DEFAULT_SOL_AMOUNT = 0.0062;
const DEFAULT_SOL_LAMPORTS = new BN(Math.round(DEFAULT_SOL_AMOUNT * LAMPORTS_PER_SOL));
const MAX_SWAPS = 20000;

type SwapRow = {
  index: number;
  sol_in_SOL: string;
  price_per_token_SOL: string;
  retain_multiplier: string;
  total_sol_raised: string;
  total_tokens_minted: string;
  tokens_out_estimate: string;
  tokens_out_actual: string;
};

function escapeCsv(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function swapsToCsv(rows: SwapRow[]): string {
  const header = "swap_index,sol_in_SOL,price_per_token_SOL,retain_multiplier,total_sol_raised,total_tokens_minted,tokens_out_estimate,tokens_out_actual";
  const body = rows
    .map(
      (r) =>
        [
          r.index,
          escapeCsv(r.sol_in_SOL),
          escapeCsv(r.price_per_token_SOL),
          escapeCsv(r.retain_multiplier),
          escapeCsv(r.total_sol_raised),
          escapeCsv(r.total_tokens_minted),
          escapeCsv(r.tokens_out_estimate),
          escapeCsv(r.tokens_out_actual),
        ].join(",")
    )
    .join("\n");
  return header + "\n" + body;
}

async function runGraduationTest() {
  clearBondingCurves();

  const poolId = createBondingCurvePool(DEFAULT_GRADUATION_AMOUNT_SOL, DEFAULT_BONDING_CURVE_SUPPLY);
  console.log("Created bonding curve pool for graduation test:", poolId);

  let swaps = 0;
  const allSwaps: SwapRow[] = [];
  const lastSwaps: SwapRow[] = [];

  while (swaps < MAX_SWAPS) {
    swaps++;

    const stateBefore = getCurveState(poolId)!;

    // Same swap logic as swap.ts: default SOL or SOL required for remaining
    const getMintedDetails = getMintedAndRemaining(poolId);
    let solAmountLamports = DEFAULT_SOL_LAMPORTS;
    const estimateForDefault = estimate_TokensOutForSolIn(poolId, solAmountLamports);
    if (getMintedDetails.tokens_remaining.lt(estimateForDefault.tokens_out)) {
      solAmountLamports = estimate_SolrequiredForTokenout(poolId, getMintedDetails.tokens_remaining);
    }

    const estimate = estimate_TokensOutForSolIn(poolId, solAmountLamports);
    const tokensOut = tokensOutForSolIn(poolId, solAmountLamports);

    if (!estimate.tokens_out.eq(tokensOut)) {
      console.error(
        "FAIL: estimate_TokensOutForSolIn != tokensOutForSolIn",
        "swap #",
        swaps,
        "estimated:",
        estimate.tokens_out.toString(),
        "actual:",
        tokensOut.toString()
      );
      process.exit(1);
    }

    const state = getCurveState(poolId)!;
    const actualSolLamports = state.total_sol_raised.sub(stateBefore.total_sol_raised);
    const actualSolSOL = actualSolLamports.toNumber() / LAMPORTS_PER_SOL;
    const totalSolRaisedSOL = state.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
    const pricePerTokenSOL = getPricePerTokenInSol(poolId, totalSolRaisedSOL);
    const retainMultiplier = getRetainMultiplier(poolId, totalSolRaisedSOL);

    const row: SwapRow = {
      index: swaps,
      sol_in_SOL: actualSolSOL.toFixed(6),
      price_per_token_SOL: pricePerTokenSOL.toExponential(10),
      retain_multiplier: retainMultiplier.toFixed(10),
      total_sol_raised: (state.total_sol_raised.toNumber() / LAMPORTS_PER_SOL).toFixed(6),
      total_tokens_minted: state.total_game_tokens_minted.toString(),
      tokens_out_estimate: estimate.tokens_out.toString(),
      tokens_out_actual: tokensOut.toString(),
    };
    allSwaps.push(row);
    lastSwaps.push(row);
    if (lastSwaps.length > 10) lastSwaps.shift();

    if (state.graduated) {
      const totalSol = state.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
      console.log(
        "Curve graduated after swaps:",
        swaps,
        "total_sol_raised:",
        totalSol.toFixed(6),
        "graduation_amount:",
        state.graduation_amount,
        "graduated:",
        state.graduated
      );

      const solOk = totalSol >= state.graduation_amount - 1e-9;
      const capOk = totalSol <= state.graduation_amount + 1e-9;
      if (!solOk || !capOk) {
        console.error(
          "FAIL: total_sol_raised not at graduation_amount within tolerance",
          "total_sol_raised:",
          totalSol,
          "graduation_amount:",
          state.graduation_amount
        );
        process.exit(1);
      }

      console.log("\nLast 10 swaps before/at graduation:");
      for (const s of lastSwaps) {
        console.log(
          `swap #${s.index}`,
          "| sol_in_SOL:",
          s.sol_in_SOL,
          "| price_per_token_SOL:",
          s.price_per_token_SOL,
          "| retain_multiplier:",
          s.retain_multiplier,
          "| total_sol_raised:",
          s.total_sol_raised,
          "| total_tokens_minted:",
          s.total_tokens_minted,
          "| tokens_out_estimate:",
          s.tokens_out_estimate,
          "| tokens_out_actual:",
          s.tokens_out_actual
        );
      }

      console.log("\nFinal bonding curve state (human-readable):");
      const finalSol = state.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
      const finalStateReadable = {
        bonding_curve_id: state.bonding_curve_id,
        total_sol_raised_lamports: state.total_sol_raised.toString(10),
        total_sol_raised_SOL: finalSol.toFixed(6),
        total_game_tokens_minted_units: state.total_game_tokens_minted.toString(10),
        graduation_amount_SOL: state.graduation_amount,
        bonding_curve_supply_units: state.bonding_curve_supply,
        graduated: state.graduated,
        created_at: state.created_at,
      };
      console.log(JSON.stringify(finalStateReadable, null, 2));

      const csvPath = join(__dirname, "graduation_swaps.csv");
      writeFileSync(csvPath, swapsToCsv(allSwaps), "utf-8");
      console.log("\nCSV written:", csvPath, `(${allSwaps.length} swaps)`);

      console.log("PASS: bonding curve graduated at expected SOL cap.");
      return;
    }
  }

  console.error("FAIL: bonding curve did not graduate within MAX_SWAPS =", MAX_SWAPS);
  process.exit(1);
}

await runGraduationTest();


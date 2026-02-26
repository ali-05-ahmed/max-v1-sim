/**
 * Off-chain bonding curve business logic.
 * Formula: y = 1073000191 - 32190005730/(30+x), x = SOL purchased, y = tokens obtained.
 * Supply: bonding_curve_supply + dex_reserve_supply = total_supply.
 */

import * as dataStore from "./data_store.js";
import BN from "bn.js";

// --- Constants (defaults, changeable per pool) ---

export const DEFAULT_BONDING_CURVE_SUPPLY = 793_100_000;
export const DEFAULT_DEX_RESERVE_SUPPLY = 206_900_000;
export const DEFAULT_GRADUATION_AMOUNT_SOL = 85;

const LAMPORTS_PER_SOL = 1_000_000_000;
const TOKEN_DECIMALS = 9;
const TOKEN_LAMPORTS = new BN(10).pow(new BN(TOKEN_DECIMALS));

export function getTotalSupply(bonding_curve_supply: number, dex_reserve_supply: number): number {
  return bonding_curve_supply + dex_reserve_supply;
}

// --- Curve formula ---

const CURVE_CONSTANT = 30;

/**
 * Cumulative tokens received after x SOL has been raised (parameterized by graduation_amount and bonding_curve_supply).
 * y = bonding_curve_supply * x * (30 + graduation_amount) / (graduation_amount * (30 + x))
 * So at x = graduation_amount, y = bonding_curve_supply.
 */
export function tokensAtSol(
  x_sol: number,
  graduation_amount: number,
  bonding_curve_supply: number
): number {
  if (x_sol <= 0) return 0;
  const numerator = bonding_curve_supply * x_sol * (CURVE_CONSTANT + graduation_amount);
  const denominator = graduation_amount * (CURVE_CONSTANT + x_sol);
  return Math.floor(numerator / denominator);
}

/**
 * Core math: tokens received for buying `sol_amount_lamports` on a curve at current state.
 * Does not mutate store.
 *
 * - total_sol_raised, sol_amount are in lamports
 * - graduation_amount is in SOL
 * - total_game_tokens_minted, tokens_out are in token base units (10^TOKEN_DECIMALS)
 */
function computeTokensOutForSolIn(
  total_sol_raised: BN,
  total_game_tokens_minted: BN,
  sol_amount_lamports: BN,
  graduation_amount: number,
  bonding_curve_supply: number
): { tokens_out: BN; new_sol_raised: BN; new_tokens_minted: BN } {
  const totalSolRaisedSol = total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
  const solAmountSol = sol_amount_lamports.toNumber() / LAMPORTS_PER_SOL;

  const capped_sol = Math.min(totalSolRaisedSol + solAmountSol, graduation_amount);

  // Curve gives cumulative tokens in whole-token units
  const new_tokens_total_whole = tokensAtSol(capped_sol, graduation_amount, bonding_curve_supply);

  // Convert to base units (lamports of the token)
  const new_tokens_total_units = new BN(new_tokens_total_whole).mul(TOKEN_LAMPORTS);

  // Delta in base units
  let tokens_out = new_tokens_total_units.sub(total_game_tokens_minted);
  if (tokens_out.isNeg()) tokens_out = new BN(0);

  const new_sol_raised = new BN(Math.round(capped_sol * LAMPORTS_PER_SOL));
  const new_tokens_minted = total_game_tokens_minted.add(tokens_out);

  return {
    tokens_out,
    new_sol_raised,
    new_tokens_minted,
  };
}

// --- Pool creation & mutations ---

function generateId(): string {
  return `bc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

export interface CreatePoolParams {
  graduation_amount?: number;
  bonding_curve_supply?: number;
}

/**
 * Create a bonding curve pool and store it. Returns bonding_curve_id.
 */
export function createBondingCurvePool(
  graduation_amount: number = DEFAULT_GRADUATION_AMOUNT_SOL,
  bonding_curve_supply: number = DEFAULT_BONDING_CURVE_SUPPLY
): string {
  const bonding_curve_id = generateId();
  const record: dataStore.BondingCurveRecord = {
    bonding_curve_id,
    total_sol_raised: new BN(0),
    total_game_tokens_minted: new BN(0),
    // Pool starts holding the full bonding_curve_supply in base units.
    token_pool_balance: new BN(bonding_curve_supply).mul(TOKEN_LAMPORTS),
    protocol_reserve_tokens: new BN(0),
    graduation_amount,
    bonding_curve_supply,
    graduated: false,
    created_at: Date.now(),
  };
  dataStore.setBondingCurve(record);
  return bonding_curve_id;
}

/** 
 * Simulate buying SOL (lamports) for tokens: apply formula, update store, return tokens received (BN).
 */
export function tokensOutForSolIn(bonding_curve_id: string, sol_amount_lamports: BN): BN {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) throw new Error(`Bonding curve not found: ${bonding_curve_id}`);

  const { tokens_out, new_sol_raised, new_tokens_minted } = computeTokensOutForSolIn( // this must be in FIFO pr bonding curve Id
    record.total_sol_raised,
    record.total_game_tokens_minted,
    sol_amount_lamports,
    record.graduation_amount,
    record.bonding_curve_supply
  );

  const graduated = new_sol_raised.toNumber() / LAMPORTS_PER_SOL >= record.graduation_amount;

  // Update on-chain-like state:
  // - total_sol_raised / total_game_tokens_minted from curve math
  // - token_pool_balance: pool starts with full supply and decreases by tokens_out on each swap
  let new_token_pool_balance = record.token_pool_balance.sub(tokens_out);
  if (new_token_pool_balance.isNeg()) {
    new_token_pool_balance = new BN(0);
  }

  dataStore.setBondingCurve({
    ...record,
    total_sol_raised: new_sol_raised,
    total_game_tokens_minted: new_tokens_minted,
    token_pool_balance: new_token_pool_balance,
    graduated: record.graduated || graduated,
  });

  return tokens_out;
}

/**
 * Estimate tokens for a SOL input on a given bonding curve without mutating store.
 */
export function estimate_TokensOutForSolIn(
  bonding_curve_id: string,
  sol_amount_lamports: BN
): { tokens_out: BN; new_sol_raised: BN; new_tokens_minted: BN } {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) throw new Error(`Bonding curve not found: ${bonding_curve_id}`);

  return computeTokensOutForSolIn(
    record.total_sol_raised,
    record.total_game_tokens_minted,
    sol_amount_lamports,
    record.graduation_amount,
    record.bonding_curve_supply
  );
}

/**
 * Lightweight guard to decide if we *can* perform a swap.
 *
 * Convention:
 * - For SOL→token swaps (user sends SOL, receives tokens), pass a non‑zero `sol_amount_lamports`.
 *   In this case we only check that the `token_pool_balance` is non‑zero (there are tokens to sell).
 * - For token→SOL swaps (user receives SOL out), call this with `sol_amount_lamports = 0`.
 *   For now we just return true here; later you can plug in SOL‑pool checks.
 */
export function canSwap(bonding_curve_id: string, sol_amount_lamports: BN): boolean {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) return false;

  // SOL‑out path (token→SOL): we only distinguish this by sol_amount_lamports === 0.
  if (sol_amount_lamports.isZero()) {
    // TODO: when a SOL pool is modeled, add checks here.
    return true;
  }

  // Token‑out path (SOL→token): require non‑empty token pool.
  if (record.token_pool_balance.lte(new BN(0))) return false;

  return true;
}

/**
 * Get current curve state (read-only) from store.
 */
export function getCurveState(bonding_curve_id: string): dataStore.BondingCurveRecord | undefined {
  return dataStore.getBondingCurve(bonding_curve_id);
}

// --- Minted / remaining & price ---

/**
 * Get how many tokens have been minted and how many remain to mint for this bonding curve.
 * Returns amounts in token base units (10^TOKEN_DECIMALS).
 */
export function getMintedAndRemaining(bonding_curve_id: string): {
  tokens_minted: BN;
  tokens_remaining: BN;
} {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) throw new Error(`Bonding curve not found: ${bonding_curve_id}`);

  // total_game_tokens_minted tracks what has left the protocol via the curve;
  // token_pool_balance tracks how many tokens remain in the pool.
  const tokens_minted = record.total_game_tokens_minted;
  const tokens_remaining = record.token_pool_balance;

  return { tokens_minted, tokens_remaining };
}

/**
 * Inverse of tokensAtSol: SOL (as number) required to have raised exactly y_whole tokens.
 * y = supply * x * (30+grad) / (grad*(30+x))  =>  x = 30*y*grad / (supply*(30+grad) - y*grad)
 */
function solForTokens(
  y_whole: number,
  graduation_amount: number,
  bonding_curve_supply: number
): number {
  if (y_whole <= 0) return 0;
  const denom = bonding_curve_supply * (CURVE_CONSTANT + graduation_amount) - y_whole * graduation_amount;
  if (denom <= 0) return graduation_amount; // cap at graduation
  return (CURVE_CONSTANT * y_whole * graduation_amount) / denom;
}

/**
 * Get price in SOL (lamports) for buying `tokens_amount` (token base units) on the curve.
 * Uses current curve state unless `total_sol_raised_sol` is provided (SOL raised so far).
 * Returns SOL cost in lamports (BN) for that token amount.
 */
export function getPriceInSol(
  bonding_curve_id: string,
  tokens_amount: BN,
  total_sol_raised_sol?: number
): BN {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) throw new Error(`Bonding curve not found: ${bonding_curve_id}`);

  if (tokens_amount.isZero()) return new BN(0);

  const total_sol =
    total_sol_raised_sol ?? record.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
  const current_tokens_whole = tokensAtSol(total_sol, record.graduation_amount, record.bonding_curve_supply);
  const current_tokens_base = new BN(current_tokens_whole).mul(TOKEN_LAMPORTS);
  const new_tokens_base = current_tokens_base.add(tokens_amount);
  const new_tokens_whole = new_tokens_base.div(TOKEN_LAMPORTS).toNumber();

  const sol_for_new = solForTokens(new_tokens_whole, record.graduation_amount, record.bonding_curve_supply);
  const delta_sol = Math.max(0, sol_for_new - total_sol);
  const delta_lamports = Math.round(delta_sol * LAMPORTS_PER_SOL);
  return new BN(delta_lamports);
}

/**
 * Estimate SOL (lamports) required to receive `tokens_out` (token base units) on the curve.
 * Uses current curve state unless `total_sol_raised_sol` is provided.
 * Returns SOL required in lamports (BN).
 */
export function estimate_SolrequiredForTokenout(
  bonding_curve_id: string,
  tokens_out: BN,
  total_sol_raised_sol?: number
): BN {
  return getPriceInSol(bonding_curve_id, tokens_out, total_sol_raised_sol);
}

/**
 * Marginal price of one token in SOL at a given total_sol_raised (smooth, no fluctuation).
 * Uses the curve derivative: y = A*x/(30+x) => dy/dx = A*30/(30+x)^2 => price = dx/dy = (30+x)^2/(A*30).
 * Uses current curve state unless `total_sol_raised_sol` is provided.
 */
export function getPricePerTokenInSol(
  bonding_curve_id: string,
  total_sol_raised_sol?: number
): number {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) throw new Error(`Bonding curve not found: ${bonding_curve_id}`);

  const x = total_sol_raised_sol ?? record.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
  const { graduation_amount, bonding_curve_supply } = record;
  const A = (bonding_curve_supply * (CURVE_CONSTANT + graduation_amount)) / graduation_amount;
  const pricePerWholeToken = Math.pow(CURVE_CONSTANT + x, 2) / (A * CURVE_CONSTANT);
  return pricePerWholeToken;
}

/** Target return multiple for all swaps: 3.7x. Early users capped here; later users topped up to here from reserve. */
export const MAX_EARLY_USER_RETURN = 3.75;
/** Minimum return we target for later users when topping up from reserve (e.g. 1.5x). */
export const MIN_LATER_USER_RETURN = 1.5;
/** Same as MAX_EARLY_USER_RETURN: later users topped up to 3.7x when reserve allows. */
export const MAX_LATER_USER_RETURN = 3.75;

/**
 * Retain multiplier: low at start (so early users get max 3x return), 1 at graduation.
 * effective_return = 1 + (price_at_graduation/price_now - 1) * retain_multiplier.
 * So at start, retain_multiplier is set so that effective return from start→graduation = MAX_EARLY_USER_RETURN.
 * Uses current curve state unless `total_sol_raised_sol` is provided.
 */
export function getRetainMultiplier(
  bonding_curve_id: string,
  total_sol_raised_sol?: number
): number {
  const record = dataStore.getBondingCurve(bonding_curve_id);
  if (!record) throw new Error(`Bonding curve not found: ${bonding_curve_id}`);

  const total_sol = total_sol_raised_sol ?? record.total_sol_raised.toNumber() / LAMPORTS_PER_SOL;
  const { graduation_amount } = record;

  const price_at_start = getPricePerTokenInSol(bonding_curve_id, 0);
  const price_at_graduation = getPricePerTokenInSol(bonding_curve_id, graduation_amount);
  const natural_return_start_to_graduation = price_at_graduation / price_at_start;

  if (natural_return_start_to_graduation <= 1) return 1;

  const t = Math.min(1, Math.max(0, total_sol / graduation_amount));
  const retain_at_start = (MAX_EARLY_USER_RETURN - 1) / (natural_return_start_to_graduation - 1);
  const retain_multiplier = retain_at_start + (1 - retain_at_start) * t;
  return retain_multiplier;
}

/**
 * Token distribution with 3x return cap.
 *
 * Given current price c and final price f at graduation:
 * - Return for user = (tokens * f) / sol_in_SOL (value at grad / cost).
 * - If full tokens_out would give > 3x return, distribute only enough for 3x; the rest is "saved".
 * - Saved tokens can be distributed later to users who would get < 3x at graduation.
 *
 * Formula:
 *   tokens_cap = 3 * sol_in_SOL / f   (whole tokens that yield exactly 3x)
 *   tokens_to_distribute = min(tokens_out_full, tokens_cap in base units)
 *   tokens_saved = tokens_out_full - tokens_to_distribute
 *
 * All token amounts in base units (BN). sol_in_lamports and prices in SOL (c, f = SOL per token).
 */
export function computeTokensDistributionWith3xCap(
  sol_in_lamports: BN,
  tokens_out_full: BN,
  current_price_per_token_SOL: number,
  final_price_per_token_SOL: number
): { tokens_to_distribute: BN; tokens_saved: BN } {
  const sol_in_SOL = sol_in_lamports.toNumber() / LAMPORTS_PER_SOL;
  if (final_price_per_token_SOL <= 0) {
    return { tokens_to_distribute: tokens_out_full, tokens_saved: new BN(0) };
  }
  const tokens_cap_whole = (MAX_EARLY_USER_RETURN * sol_in_SOL) / final_price_per_token_SOL;
  const tokens_cap_base = new BN(Math.floor(tokens_cap_whole)).mul(TOKEN_LAMPORTS);
  const tokens_to_distribute = tokens_out_full.lte(tokens_cap_base) ? tokens_out_full : tokens_cap_base;
  const tokens_saved = tokens_out_full.sub(tokens_to_distribute);
  return { tokens_to_distribute, tokens_saved };
}

/**
 * Token distribution with 3.7x target for all swaps.
 *
 * - Early users (curve gives >= 3.7x): cap at MAX_EARLY_USER_RETURN (3.7x), excess goes to reserve.
 * - Later users (curve gives < 3.7x): top up from reserve to MAX_LATER_USER_RETURN (3.7x) when reserve allows.
 *
 * Returns: tokens_to_distribute, tokens_saved (added to reserve), reserve_used (taken from reserve).
 * Caller updates: reserve = reserve + tokens_saved - reserve_used.
 */
export function computeTokensDistributionWithReserve(
  sol_in_lamports: BN,
  tokens_out_full: BN,
  _current_price_per_token_SOL: number,
  final_price_per_token_SOL: number,
  reserve_available: BN
): { tokens_to_distribute: BN; tokens_saved: BN; reserve_used: BN } {
  const sol_in_SOL = sol_in_lamports.toNumber() / LAMPORTS_PER_SOL;
  if (final_price_per_token_SOL <= 0) {
    return { tokens_to_distribute: tokens_out_full, tokens_saved: new BN(0), reserve_used: new BN(0) };
  }
  const tokens_cap_early_whole = (MAX_EARLY_USER_RETURN * sol_in_SOL) / final_price_per_token_SOL;
  const tokens_cap_early_base = new BN(Math.floor(tokens_cap_early_whole)).mul(TOKEN_LAMPORTS);
  const tokens_cap_later_whole = (MAX_LATER_USER_RETURN * sol_in_SOL) / final_price_per_token_SOL;
  const tokens_cap_later_base = new BN(Math.floor(tokens_cap_later_whole)).mul(TOKEN_LAMPORTS);

  if (tokens_out_full.gte(tokens_cap_early_base)) {
    // Early user: cap at 3x, rest to reserve
    return {
      tokens_to_distribute: tokens_cap_early_base,
      tokens_saved: tokens_out_full.sub(tokens_cap_early_base),
      reserve_used: new BN(0),
    };
  }

  // Later user: top up from reserve toward MAX_LATER_USER_RETURN (e.g. 4x) when reserve allows
  const max_from_reserve = tokens_out_full.add(reserve_available);
  const target_tokens = max_from_reserve.lte(tokens_cap_later_base) ? max_from_reserve : tokens_cap_later_base;
  const shortfall_to_target = target_tokens.sub(tokens_out_full);
  const reserve_used = reserve_available.lte(shortfall_to_target) ? reserve_available : shortfall_to_target;
  const tokens_to_distribute = tokens_out_full.add(reserve_used);
  // If we still don't reach 1.5x, we gave all we could; no tokens_saved
  return {
    tokens_to_distribute,
    tokens_saved: new BN(0),
    reserve_used,
  };
}

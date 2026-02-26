/**
 * Query layer: read bonding curve data from data_store.
 */

import {
  getBondingCurve,
  getAllBondingCurves,
  listBondingCurveIds,
  type BondingCurveRecord,
} from "./data_store.js";
import BN from "bn.js";

export type { BondingCurveRecord };

export function queryBondingCurveById(bonding_curve_id: string): BondingCurveRecord | undefined {
  return getBondingCurve(bonding_curve_id);
}

export function queryAllBondingCurves(): BondingCurveRecord[] {
  return getAllBondingCurves();
}

export function queryBondingCurveIds(): string[] {
  return listBondingCurveIds();
}

/** SOL raised, in lamports (BN). */
export function querySolRaised(bonding_curve_id: string): BN | undefined {
  const record = getBondingCurve(bonding_curve_id);
  return record?.total_sol_raised;
}

/** Game tokens minted, as BN. */
export function queryTokensMinted(bonding_curve_id: string): BN | undefined {
  const record = getBondingCurve(bonding_curve_id);
  return record?.total_game_tokens_minted;
}

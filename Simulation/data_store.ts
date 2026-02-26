/**
 * In-memory store for bonding curve state.
 * Persists bonding_curve_id, total_sol_raised, total_game_tokens_minted.
 *
 * Amount fields use big numbers:
 * - total_sol_raised: lamports (1 SOL = 1_000_000_000 lamports)
 * - total_game_tokens_minted: token base units
 */

import BN from "bn.js";

export interface BondingCurveRecord {
  bonding_curve_id: string;
  total_sol_raised: BN;
  total_game_tokens_minted: BN;
  /** Tokens currently held in the protocol pool (for payouts / post‑graduation logic). */
  token_pool_balance: BN;
  /** Protocol-level reserve tokens (from 3.7x cap, used to top up later users). */
  protocol_reserve_tokens: BN;
  graduation_amount: number;
  bonding_curve_supply: number;
  graduated: boolean;
  created_at: number;
}

const store = new Map<string, BondingCurveRecord>();

export function getBondingCurve(id: string): BondingCurveRecord | undefined {
  return store.get(id);
}

export function setBondingCurve(record: BondingCurveRecord): void {
  store.set(record.bonding_curve_id, { ...record });
}

export function deleteBondingCurve(id: string): boolean {
  return store.delete(id);
}

export function listBondingCurveIds(): string[] {
  return Array.from(store.keys());
}

export function getAllBondingCurves(): BondingCurveRecord[] {
  return Array.from(store.values());
}

export function clearBondingCurves(): void {
  store.clear();
}

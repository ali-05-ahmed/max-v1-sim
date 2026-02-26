import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { createBondingCurvePool, DEFAULT_BONDING_CURVE_SUPPLY, DEFAULT_GRADUATION_AMOUNT_SOL, estimate_SolrequiredForTokenout, estimate_TokensOutForSolIn, getCurveState, getMintedAndRemaining, tokensOutForSolIn } from "../bondingCurve.js";


function main() {

    const bondingCurveId = createBondingCurvePool(
    DEFAULT_GRADUATION_AMOUNT_SOL,
    DEFAULT_BONDING_CURVE_SUPPLY
    );

    console.log('Bonding curve ID:', bondingCurveId);


    // swap implementation
    const getBondingCurve = getCurveState(bondingCurveId);
    if (getBondingCurve) {
        console.log('Bonding curve:', {
            ...getBondingCurve,
            total_sol_raised: getBondingCurve.total_sol_raised.toString(),
            total_game_tokens_minted: getBondingCurve.total_game_tokens_minted.toString(),
        });
    }

    if (!getBondingCurve?.graduated) {
        const getMintedDetails = getMintedAndRemaining(bondingCurveId);
        const defaultSolAmount = 0.0062;
        let solAmountLamports = new BN(Math.round(defaultSolAmount * LAMPORTS_PER_SOL));

        // Estimate tokens for default SOL (no swap yet)
        const estimate = estimate_TokensOutForSolIn(bondingCurveId, solAmountLamports);
        console.log('Tokens remaining:', getMintedDetails.tokens_remaining.toString());
        console.log('Estimated tokens for', defaultSolAmount, 'SOL:', estimate.tokens_out.toString());

        // If curve has fewer tokens left than a full 0.0062 SOL would buy, use SOL required for remaining
        if (getMintedDetails.tokens_remaining.lt(estimate.tokens_out)) {
            solAmountLamports = estimate_SolrequiredForTokenout(bondingCurveId, getMintedDetails.tokens_remaining);
        }

        console.log('Swapping...');
        const tokensOut = tokensOutForSolIn(bondingCurveId, solAmountLamports);
        console.log('Tokens out:', tokensOut.toString());
    }
}

main();
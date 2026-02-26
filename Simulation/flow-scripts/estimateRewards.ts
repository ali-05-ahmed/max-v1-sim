import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import BN from "bn.js";
import { createBondingCurvePool, DEFAULT_BONDING_CURVE_SUPPLY, DEFAULT_GRADUATION_AMOUNT_SOL, estimate_TokensOutForSolIn, getCurveState, getMintedAndRemaining, tokensOutForSolIn } from "../bondingCurve.js";

const TOKEN_DECIMALS = 9;
const TOKEN_DIVISOR = new BN(10).pow(new BN(TOKEN_DECIMALS));

/** Format token base units as human-readable string (e.g. "221711.123456789") */
function formatTokenAmount(amountBase: BN): string {
    const whole = amountBase.div(TOKEN_DIVISOR);
    const frac = amountBase.mod(TOKEN_DIVISOR);
    const fracStr = frac.toString(10).padStart(TOKEN_DECIMALS, "0").slice(0, TOKEN_DECIMALS);
    return fracStr === "0".repeat(TOKEN_DECIMALS) ? whole.toString() : `${whole.toString()}.${fracStr}`;
}


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
    const solAmount = 0.0062;
    const solAmountLamports = new BN(solAmount * LAMPORTS_PER_SOL);
    const tokensOut = estimate_TokensOutForSolIn(bondingCurveId, solAmountLamports);

    
    console.log('Tokens remaining:', formatTokenAmount(getMintedDetails.tokens_remaining));
    if (getMintedDetails.tokens_remaining.gte(tokensOut.tokens_out)) {
        console.log('Estimated reward:', formatTokenAmount(tokensOut));
    }else{
        throw new Error('Not enough tokens remaining');
    }
    
    }
}

main();
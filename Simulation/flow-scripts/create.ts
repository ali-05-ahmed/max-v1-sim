import { createBondingCurvePool, DEFAULT_BONDING_CURVE_SUPPLY, DEFAULT_GRADUATION_AMOUNT_SOL, getCurveState } from "../bondingCurve.js";


function main() {

    const bondingCurveId = createBondingCurvePool(
    DEFAULT_GRADUATION_AMOUNT_SOL,
    DEFAULT_BONDING_CURVE_SUPPLY
    );

    console.log('Bonding curve ID:', bondingCurveId);

    const getBondingCurve = getCurveState(bondingCurveId);
    console.log('Bonding curve:', getBondingCurve);
}

main();

// import { DuneClient } from "@duneanalytics/client-sdk";
// const dune = new DuneClient("1kZWqjTGccHkdem1nqFgatqZVApKcGHd");


// export const showAnalytics = async () => {
//     const tokens_launched = await dune.getLatestResult({queryId: 3756231});

//  const tokens_launched_24h = await dune.getLatestResult({queryId: 3979030});
//  const tokens_graduated_24h = await dune.getLatestResult({queryId: 3979025});
//  const graduation_rate_24h = (Number(tokens_graduated_24h.result?.rows[0].withdraw_token_last_24h) / Number(tokens_launched_24h.result?.rows[0].tokens_launched_24h)) * 100;
//     const TotalRevenue = await dune.getLatestResult({queryId: 4903533})
//     const TotalRevenueSOL = await dune.getLatestResult({queryId: 3706280});




 
//     console.log("Query Data:", tokens_launched.result?.rows[0]);
//  console.log("Query Data:", tokens_launched_24h.result?.rows[0]);
//  console.log("Query Data:", tokens_graduated_24h.result?.rows[0]);
//  console.log("Graduation Rate (24h):", graduation_rate_24h.toFixed(2) + "%"); 
//     console.log("Query Data:", TotalRevenue.result?.rows[0]);
//     console.log("Query Data:", TotalRevenueSOL.result?.rows[0]);




// }


// showAnalytics()


import { DuneClient } from "@duneanalytics/client-sdk";

const dune = new DuneClient("1kZWqjTGccHkdem1nqFgatqZVApKcGHd");

export const showAnalytics = async () => {
  const [
    tokensLaunched,
    tokensLaunched24h,
    tokensGraduated24h,
    totalRevenueUSD,
    totalRevenueSOL,
    tokensGraduated
  ] = await Promise.all([
    dune.getLatestResult({ queryId: 3756231 }),
    dune.getLatestResult({ queryId: 3979030 }),
    dune.getLatestResult({ queryId: 3979025 }),
    dune.getLatestResult({ queryId: 4903533 }),
    dune.getLatestResult({ queryId: 3706280 }),
    dune.getLatestResult({ queryId: 5652979 }),
  ]);

// console.log("Total Tokens Graduated:", tokensGraduated.result);


let _totalGraduated = tokensGraduated.result?.rows[0]?.cumulative_graduates
let _totalGraduationRate = tokensGraduated.result?.rows[0]?.graduated_rate



  const launched24h = Number(tokensLaunched24h.result?.rows[0]?.tokens_launched_24h ?? 0);
  const graduated24h = Number(tokensGraduated24h.result?.rows[0]?.withdraw_token_last_24h ?? 0);

  const graduationRate24h =
    launched24h > 0 ? (graduated24h / launched24h) * 100 : 0;

  console.log("\n========== PUMPFUN ANALYTICS ==========\n");

  console.table({
    "Tokens Launched (24h)": launched24h,
    "Tokens Graduated (24h)": graduated24h,
    "Graduation Rate (24h %)": graduationRate24h.toFixed(2),
    "Total Tokens Graduated": _totalGraduated,
    "Total Graduation Rate (%)": Number(_totalGraduationRate).toFixed(5)
    // "Total Tokens Graduated": tokensGraduated.result?.rows[0]
  });

  console.log("\n---- Token Stats ----");
  console.table(tokensLaunched.result?.rows[0]);

  console.log("\n---- Revenue (USD) ----");
  console.table(totalRevenueUSD.result?.rows[0]);

  console.log("\n---- Revenue (SOL) ----");
  console.table(totalRevenueSOL.result?.rows[0]);

  console.log("\n======================================\n");
};

showAnalytics();

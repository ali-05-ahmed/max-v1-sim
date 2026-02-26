import {
  TxVersion,
  DEVNET_PROGRAM_ID,
  printSimulate,
  getPdaLaunchpadConfigId,
  LaunchpadConfig,
  getPdaPlatformId,
} from '@raydium-io/raydium-sdk-v2';
import { initSdk, owner } from './config';
import BN from 'bn.js';
import { Keypair, PublicKey } from '@solana/web3.js';
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from '@solana/spl-token';

export const createTokenAndPool = async () => {
  const raydium = await initSdk();
  const connection = raydium.connection;
  const payer = owner; // your wallet Keypair

  // -----------------------------
  // Step 1: Create token manually
  // -----------------------------
  // create the mint
const tokenMint = await createMint(
  connection,
  payer,
  payer.publicKey,  // mint authority
  null,             // freeze authority
  6,                // decimals
  undefined,
  undefined,
  TOKEN_2022_PROGRAM_ID // SPL Token 2022
);

console.log('Created token mint:', tokenMint.toBase58());

// create associated token account
const tokenAccount = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  tokenMint,
  payer.publicKey,
  false, // allowOwnerOffCurve
  'confirmed',
  undefined,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
);


const tokenAccountSell = await getOrCreateAssociatedTokenAccount(
  connection,
  payer,
  tokenMint,
  new PublicKey("5xqNaZXX5eUi4p5HU4oz9i5QnwRNT2y6oN7yyn4qENeq"),
  true, // allowOwnerOffCurve
  'confirmed',
  undefined,
  TOKEN_2022_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
);

// mint tokens
await mintTo(
  connection,
  payer,
  tokenMint,
  tokenAccountSell.address, // destination
  payer,
  900_000_000_000_000, // supply
  [],
    undefined,
  TOKEN_2022_PROGRAM_ID
);

  // -----------------------------
  // Step 2: Prepare launchpad pool
  // -----------------------------
  const programId = DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM;
  const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey;

  // Fetch config account
  const configData = await connection.getAccountInfo(configId);
  if (!configData) throw new Error('Launchpad config not found');
  const configInfo = LaunchpadConfig.decode(configData.data);

  // MintB info (token used to pay in pool)
  const mintBInfo = await raydium.token.getTokenInfo(configInfo.mintB);
  const { publicKey: platformId } = getPdaPlatformId(programId, payer.publicKey);

  const inAmount = new BN(10);

  const { execute, transactions, extInfo } = await raydium.launchpad.createLaunchpad({
    programId,
    mintA: tokenMint, // our pre-created token
    decimals: 6,
    name: 'Ali Custom Token',
    symbol: 'ACT',
    migrateType: 'amm',
    uri: 'https://google.com',

    configId,
    configInfo,
    mintBDecimals: mintBInfo.decimals,
    platformId,
    txVersion: TxVersion.V0,
    slippage: new BN(100), // 1%
    buyAmount: inAmount,
    createOnly: true, // only create pool now
    extraSigners: [],

    supply: new BN(900_000_000_000_000),
    totalSellA: new BN(693_100_000_000_000),
    // totalLockedAmount: new BN(100_000_000_000_000),
    // unlockPeriod: new BN(1),
  });

  printSimulate(transactions);

  try {
    const sentInfo = await execute({ sequentially: true });
    console.log('Pool extInfo:', extInfo);
    console.log('Transaction info:', sentInfo);
  } catch (e) {
    console.error('Launchpad creation failed:', e);
  }

  process.exit();
};

/** Execute */
createTokenAndPool();

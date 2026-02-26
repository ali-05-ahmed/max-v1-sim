import { TxVersion, DEVNET_PROGRAM_ID, printSimulate, LAUNCHPAD_PROGRAM, getPdaPoolId, getPdaLaunchpadConfigId, getPdaLaunchpadPoolId } from '@raydium-io/raydium-sdk-v2'
import { initSdk } from './config'
import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'

export const claimVesting = async () => {
  const raydium = await initSdk()
  const programId = DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM
  const configId = getPdaLaunchpadConfigId(programId, NATIVE_MINT, 0, 0).publicKey
  const mintA = new PublicKey('AzuJeavWZnKRqpL3G1EviLq7n1ap993yo9pbch4SppmS') // token being sold
  const mintB = NATIVE_MINT // token used to pay

  const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey
    console.log('poolId:', poolId.toBase58())
//   const poolInfo = await raydium.launchpad.getPoolInfo(poolId)
//   console.log('poolInfo:', poolInfo)
const { transaction, extInfo, execute } = await raydium.launchpad.claimVesting({
    programId: DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM, // devnet: DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM
    poolId,
    txVersion: TxVersion.V0,

    // computeBudgetConfig: {
    //   units: 600000,
    //   microLamports: 600000,
    // },
  })

  printSimulate([transaction])

  try {
    const sentInfo = await execute({ sendAndConfirm: true })
    console.log(sentInfo)
  } catch (e: any) {
    console.log(e)
  }

  process.exit() // if you don't want to end up node execution, comment this line
}

/** uncomment code below to execute */
claimVesting()
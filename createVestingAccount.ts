import { TxVersion, DEVNET_PROGRAM_ID, printSimulate, getPdaLaunchpadPoolId } from '@raydium-io/raydium-sdk-v2'
import { initSdk } from './config'
import BN from 'bn.js'
import { PublicKey } from '@solana/web3.js'
import { NATIVE_MINT } from '@solana/spl-token'

export const createVestingAccount = async () => {
  const raydium = await initSdk()
  const programId = DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM

  const shareAmount = new BN(100_000_000_000_000) // must less than pool's total locked amount

  const mintA = new PublicKey('AzuJeavWZnKRqpL3G1EviLq7n1ap993yo9pbch4SppmS') // token being sold
  const mintB = NATIVE_MINT // token used to pay

  const poolId = getPdaLaunchpadPoolId(programId, mintA, mintB).publicKey

  const { transaction, execute } = await raydium.launchpad.createVesting({
    programId: DEVNET_PROGRAM_ID.LAUNCHPAD_PROGRAM, // open when develop on devnet
    poolId,
    beneficiary: new PublicKey('BsNvEvRZLRv2T8o5bpVyGHRZsTGQmCzsF8M4bVkAmfv3'),
    shareAmount,
    txVersion: TxVersion.V0,
    // computeBudgetConfig: {
    //   units: 600000,
    //   microLamports: 600000,
    // },
  })

  // printSimulate([transaction])

  try {
    const sentInfo = await execute({ sendAndConfirm: true })
    console.log(sentInfo)
  } catch (e: any) {
    console.log(e)
  }

  process.exit() // if you don't want to end up node execution, comment this line
}

/** uncomment code below to execute */
createVestingAccount()
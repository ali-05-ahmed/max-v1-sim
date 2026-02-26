import { Connection, Keypair, SystemProgram, Transaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from "bs58";

const RPC_ENDPOINT = "https://solana-mainnet.g.alchemy.com/v2/OWoBxjpUbzPqz_1G7PzR5";
const connection = new Connection(RPC_ENDPOINT, 'confirmed');



async function estimateTransactionFee(
    connection: Connection,
    transaction: Transaction,
    fallbackFee: number = 10000
): Promise<number> {
    try {
        const feeEstimate = await connection.getFeeForMessage(transaction.compileMessage());
        if (feeEstimate.value !== null) {
            return feeEstimate.value;
        } else {
            console.log(`[warning] Could not estimate fee, using conservative estimate: ${fallbackFee / LAMPORTS_PER_SOL} SOL`);
            return fallbackFee;
        }
    } catch (error) {
        console.log(`[warning] Fee estimation failed, using conservative estimate: ${fallbackFee / LAMPORTS_PER_SOL} SOL`);
        return fallbackFee;
    }
}

async function confirmTransactionWithPolling(
    connection: Connection,
    signature: string,
    commitment: 'processed' | 'confirmed' | 'finalized' = 'confirmed',
    timeout: number = 60000
): Promise<boolean> {
    const startTime = Date.now();
    const maxAttempts = Math.floor(timeout / 1000); // Poll every second
    
    for (let i = 0; i < maxAttempts; i++) {
        try {
            const status = await connection.getSignatureStatus(signature);
            
            if (status.value) {
                if (status.value.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(status.value.err)}`);
                }
                
                // Check if the commitment level is met
                if (status.value.confirmationStatus === commitment || 
                    status.value.confirmationStatus === 'finalized') {
                    return true;
                }
            }
            
            // Wait before next poll
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            // Check timeout
            if (Date.now() - startTime > timeout) {
                throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
            }
        } catch (error: any) {
            // If it's not a timeout error, throw it
            if (error.message && error.message.includes('timeout')) {
                throw error;
            }
            // Otherwise continue polling
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    
    throw new Error(`Transaction confirmation timeout after ${timeout}ms`);
}

async function transferSol(
    fromSecretKey: string,
    toPublicKey: string,
    amountInSol: number
) {
    try {
        const fromKeypair = Keypair.fromSecretKey(bs58.decode(fromSecretKey));
        
        const fromBalanceBefore = await connection.getBalance(fromKeypair.publicKey);
        console.log(`Sender balance before: ${fromBalanceBefore / LAMPORTS_PER_SOL} SOL`);
        console.log(`Sender address: ${fromKeypair.publicKey.toBase58()}`);
        
        let recipientPubkey: PublicKey;
        try {
            recipientPubkey = Keypair.fromSecretKey(bs58.decode(toPublicKey)).publicKey;
        } catch {
            recipientPubkey = new PublicKey(toPublicKey);
        }
        
        const toBalanceBefore = await connection.getBalance(recipientPubkey);
        const accountInfo = await connection.getAccountInfo(recipientPubkey);
        const accountExists = accountInfo !== null;
        
        console.log(`Receiver balance before: ${toBalanceBefore / LAMPORTS_PER_SOL} SOL`);
        console.log(`Receiver address: ${recipientPubkey.toBase58()}`);
        console.log(`Account exists: ${accountExists}`);
        
        const amountInLamports = amountInSol * LAMPORTS_PER_SOL;
        
        // Get minimum rent-exempt balance for a basic account (it will give error if the amount is below the rent-exempt minimum)
        const rentExemptBalance = await connection.getMinimumBalanceForRentExemption(0);
        const rentExemptBalanceSol = rentExemptBalance / LAMPORTS_PER_SOL;
        
        // If account doesn't exist or has 0 balance, make sure the transfer meets rent-exempt minimum
        if (!accountExists || toBalanceBefore === 0) {
            if (amountInLamports < rentExemptBalance) {
                throw new Error(
                    `Transfer amount (${amountInSol} SOL) is below the rent-exempt minimum (${rentExemptBalanceSol} SOL). ` +
                    `When transferring to a new account, you must send at least ${rentExemptBalanceSol} SOL to make it rent-exempt.`
                );
            }
            console.log(`[warning]  Transferring to new account - amount must be at least ${rentExemptBalanceSol} SOL (rent-exempt minimum)`);
        }
        
        // Create transaction to estimate fee
        const transaction = new Transaction().add(
            SystemProgram.transfer({
                fromPubkey: fromKeypair.publicKey,
                toPubkey: recipientPubkey,
                lamports: amountInLamports,
            })
        );
        
        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
        transaction.recentBlockhash = blockhash;
        transaction.lastValidBlockHeight = lastValidBlockHeight;
        transaction.feePayer = fromKeypair.publicKey;
        
        // Estimate transaction fee
        const estimatedFee = await estimateTransactionFee(connection, transaction);
        console.log(`Estimated transaction fee: ${estimatedFee / LAMPORTS_PER_SOL} SOL (${estimatedFee} lamports)`);
        
        // Check if sender has enough balance (including transaction fees)
        if (fromBalanceBefore < amountInLamports + estimatedFee) {
            throw new Error(`Insufficient balance. Need ${(amountInLamports + estimatedFee) / LAMPORTS_PER_SOL} SOL but have ${fromBalanceBefore / LAMPORTS_PER_SOL} SOL`);
        }
        
        console.log(`\nTransferring ${amountInSol} SOL...`);
        console.log(`Transaction blockhash: ${blockhash}`);
        
        transaction.sign(fromKeypair);
        
        console.log(`Sending transaction...`);
        const signature = await connection.sendRawTransaction(transaction.serialize(), {
            skipPreflight: false,
            maxRetries: 3,
        });
        
        console.log(`Transaction sent! Signature: ${signature}`);
        console.log(`Explorer: https://solscan.io/tx/${signature}`);
        console.log(`Waiting for confirmation (polling)...`);
        
        try {
            await confirmTransactionWithPolling(connection, signature, 'confirmed', 60000);
            console.log(`\n[success] Transaction confirmed!`);
        } catch (error: any) {
            // Check if transaction might have succeeded despite confirmation timeout
            const status = await connection.getSignatureStatus(signature);
            if (status.value && !status.value.err) {
                console.log(`\n  Confirmation polling timed out, but transaction appears successful`);
                console.log(`Status: ${status.value.confirmationStatus || 'unknown'}`);
                console.log(`Please verify on explorer: https://solscan.io/tx/${signature}`);
            } else {
                throw error;
            }
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const fromBalanceAfter = await connection.getBalance(fromKeypair.publicKey);
        const toBalanceAfter = await connection.getBalance(recipientPubkey);
        
        console.log(`\n Balance Summary:`);
        console.log(`Sender balance after: ${fromBalanceAfter / LAMPORTS_PER_SOL} SOL`);
        console.log(`Receiver balance after: ${toBalanceAfter / LAMPORTS_PER_SOL} SOL`);
        console.log(`Amount transferred: ${amountInSol} SOL`);
        console.log(`Transaction fee: ${(fromBalanceBefore - fromBalanceAfter - amountInLamports) / LAMPORTS_PER_SOL} SOL`);
        
        return signature;
    } catch (error) {
        console.error('[error] Transfer failed:', error);
        throw error;
    }
}

async function main() {
    // Sender's secret key
    const senderSecretKey = "5bwJhc5NjgUcbJGpfEtCJc6Ewsn4vT4RCfxejnYqQTjornWDB5JFwjZPWXyKbqKPRyChQN9NiQkCtYm5P5C4vg4j";
    // 4eD1r3DcZoJESWG9DFhkZ2iQsySP9WwbnomCpTpgimEF
    // public key
    // const receiverPublicKey = "Ay9k6ydpmFibQzipWFMoias7PMCkz7nreXYB4Mczkp8H";
    const receiverPublicKey = "4eD1r3DcZoJESWG9DFhkZ2iQsySP9WwbnomCpTpgimEF";
    
    const amount = 0.001; // 0.001 SOL (this is current rent-exempt minimum make sure rewards are above this)
    
    await transferSol(senderSecretKey, receiverPublicKey, amount);
}

main();


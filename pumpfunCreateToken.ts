import { VersionedTransaction, Connection, Keypair } from '@solana/web3.js';
import bs58 from "bs58";
import fs from "fs";

const RPC_ENDPOINT = "https://solana-mainnet.g.alchemy.com/v2/OWoBxjpUbzPqz_1G7PzR5";
const web3Connection = new Connection(
    RPC_ENDPOINT,
    'confirmed',
);

async function sendLocalCreateTx(){
    const signerKeyPair = Keypair.fromSecretKey(bs58.decode("5bwJhc5NjgUcbJGpfEtCJc6Ewsn4vT4RCfxejnYqQTjornWDB5JFwjZPWXyKbqKPRyChQN9NiQkCtYm5P5C4vg4j"));

    // Generate a random keypair for token
    const mintKeypair = Keypair.generate(); 

    // Define token metadata
    const formData = new FormData();
    // const imageBuffer = await fs.promises.readFile("./asset/logo.png");
    // formData.append("file", new Blob([imageBuffer]), "logo.png"); // Image file
    // formData.append("name", "Max Test pump"),
    // formData.append("symbol", "MTP"),
    // formData.append("description", "This is an test token created via PumpPortal.fun"),
    // formData.append("twitter", "https://max.fun/"),
    // formData.append("telegram", "https://max.fun/"),
    // formData.append("website", "https://max.fun/"),
    // formData.append("showName", "true");
    
    const imageBuffer = await fs.promises.readFile("./asset/logoA.png");
    formData.append("file", new Blob([imageBuffer]), "logoA.png"); // Image file
    formData.append("name", "test token"),
    formData.append("symbol", "TTM"),
    formData.append("description", "This is an test token created via PumpPortal.fun"),
    formData.append("twitter", "https://www.google.com/"),
    formData.append("telegram", "https://www.google.com/"),
    formData.append("website", "https://www.google.com/"),
    formData.append("showName", "true");

    // Create IPFS metadata storage
    const metadataResponse = await fetch("https://pump.fun/api/ipfs", {
        method: "POST",
        body: formData,
    });
    const metadataResponseJSON = await metadataResponse.json();

    // Get the create transaction
    const response = await fetch(`https://pumpportal.fun/api/trade-local`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            "publicKey": signerKeyPair.publicKey.toBase58(),
            "action": "create",
            "tokenMetadata": {
                name: metadataResponseJSON.metadata.name,
                symbol: metadataResponseJSON.metadata.symbol,
                uri: metadataResponseJSON.metadataUri
            },
            "mint": mintKeypair.publicKey.toBase58(),
            "denominatedInSol": "true",
            "amount": 0, // dev buy of 1 SOL
            "slippage": 10, 
            "priorityFee": 0.0005,
            "pool": "pump",
            "isMayhemMode": "true" // optional, defaults to false
        })
    });
    if(response.status === 200){ // successfully generated transaction
        const data = await response.arrayBuffer();
        const tx = VersionedTransaction.deserialize(new Uint8Array(data));
        tx.sign([mintKeypair, signerKeyPair]);
        const signature = await web3Connection.sendTransaction(tx)
        console.log("Transaction: https://solscan.io/tx/" + signature);
    } else {
        console.log(response.statusText); // log error
    }
}

sendLocalCreateTx();
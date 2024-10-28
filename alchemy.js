const {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  ComputeBudgetProgram,
} = require('@solana/web3.js');
const bs58 = require('bs58').default;
const axios = require('axios');
// dotenv
require('dotenv').config();

// Include the SolanaFeeService class (you can place this in a separate file and import it)
const SOLANA_TOKEN_ACCOUNT = 'So11111111111111111111111111111111111111112';
const DEFAULT_INITIAL_PRIORITY_FEE = 1000000;

class SolanaFeeService {
  static async getPriorityFees(lastNBlocks) {
    const axiosInstance = axios.create({
      baseURL:
        process.env.FEES_ENDPOINT,
      headers: {
        'Content-Type': 'application/json',
        'x-qn-api-version': '1', // Include required headers
      },
    });

    const response = await axiosInstance.post('/', {
      jsonrpc: '2.0',
      id: 1,
      method: 'qn_estimatePriorityFees',
      params: {
        last_n_blocks: lastNBlocks,
        account: SOLANA_TOKEN_ACCOUNT,
      },
    });

    const result = response.data.result;
    return result;
  }

  static async getHighPriorityFeePCU(lastNBlocks = 100) {
    try {
      const result = await this.getPriorityFees(lastNBlocks);
      // Fetch the 95th percentile of per compute unit fees
      const val = result?.per_compute_unit?.percentiles['90'];
      if (val) {
        console.log('High priority fee per compute unit:', val);
        return val;
      }
    } catch (error) {
      console.error('Failed to fetch high priority fee from Solana RPC', error);
    }
    return undefined;
  }
}

async function main() {
  console.log(process.env);

  if(!process.env.ALCHEMY_RPC || !process.env.PRIVATE_KEY || !process.env.FEES_ENDPOINT || !process.env.SEND_TO_WALLET) {
    console.log('Please set ALCHEMY_RPC and PRIVATE_KEY, SEND_TO_WALLET and FEES_ENDPOINT in .env file');
    return
  }

  // Connect to Solana Mainnet
  const connection = new Connection(
    process.env.ALCHEMY_RPC,
    'confirmed',
  );

  // Base58-encoded private key string
  // Replace this with your test wallet's private key string
  const fromKey = process.env.PRIVATE_KEY;

  // Decode the secret key string into a Uint8Array
  const secretKey = Uint8Array.from(bs58.decode(fromKey));

  const fromKeypair = Keypair.fromSecretKey(secretKey);

  // Recipient public key (you can use any valid public key for testing)
  const toPublicKey = new PublicKey(
    '2o1QQH5PW87wNZ1SN1c6K1pbPMyAhcBbqK2NaCDvKgWE',
  );

  // Fetch the high priority fee
  const highPriorityFee = await SolanaFeeService.getHighPriorityFeePCU();

  // Use a default value if the fee could not be fetched
  const computeUnitPrice = highPriorityFee || DEFAULT_INITIAL_PRIORITY_FEE;

  console.log('Using compute unit price:', computeUnitPrice);

  // Create a transaction and add priority fee instruction
  const transaction = new Transaction();

  // Add the compute unit price instruction
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({
      microLamports: computeUnitPrice, // The fee per compute unit in micro-lamports
    }),
  );

  // Add the transfer instruction
  transaction.add(
    SystemProgram.transfer({
      fromPubkey: fromKeypair.publicKey,
      toPubkey: toPublicKey,
      lamports: 0.0001 * LAMPORTS_PER_SOL, // Sending 0.001 SOL
    }),
  );

  // Fetch a recent blockhash
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  console.log('Blockhash:', blockhash);

  // Assign the recent blockhash and fee payer
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = fromKeypair.publicKey;

  // Sign the transaction
  transaction.sign(fromKeypair);

  try {
    // Send the transaction
    const txid = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 5,
    });
    console.log('Transaction sent:', txid);

    console.log('Check transaction confirmation on solscan:', `https://solscan.io/tx/${txid}`);

  } catch (error) {
    console.error('Error sending transaction:', error);
  }
}

main().catch((err) => {
  console.error('Error in main:', err);
});

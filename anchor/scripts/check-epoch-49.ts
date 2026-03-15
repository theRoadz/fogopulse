import { Connection, PublicKey } from '@solana/web3.js';

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5');
const BTC_MINT = new PublicKey('4hD62sQKhdkaKxMPfY4YT7pFAHh4sR2nhkNAfLaoYLuY');
const FOGO_RPC = 'https://testnet.fogo.io';

async function main() {
  const connection = new Connection(FOGO_RPC, 'confirmed');

  // Derive pool PDA
  const [poolPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('pool'), BTC_MINT.toBuffer()],
    PROGRAM_ID
  );
  console.log('BTC Pool PDA:', poolPda.toString());

  // Derive epoch 49 PDA
  const epochId = BigInt(50);
  const epochIdBuffer = Buffer.alloc(8);
  epochIdBuffer.writeBigUInt64LE(epochId);

  const [epochPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('epoch'), poolPda.toBuffer(), epochIdBuffer],
    PROGRAM_ID
  );
  console.log('Epoch 49 PDA:', epochPda.toString());

  // Fetch epoch account
  const epochAccount = await connection.getAccountInfo(epochPda);
  if (!epochAccount) {
    console.log('ERROR: Epoch 49 not found');
    return;
  }

  // Parse epoch data
  const data = epochAccount.data;
  let offset = 8; // skip discriminator

  const pool = new PublicKey(data.subarray(offset, offset + 32));
  offset += 32;

  const epochIdParsed = data.readBigUInt64LE(offset);
  offset += 8;

  const state = data.readUInt8(offset);
  const states = ['Open', 'Frozen', 'Settling', 'Settled', 'Refunded'];

  console.log('');
  console.log('Epoch 49 Details:');
  console.log('  Pool:', pool.toString());
  console.log('  Epoch ID:', epochIdParsed.toString());
  console.log('  State:', states[state] || 'Unknown(' + state + ')');

  // Check specific user's position - your wallet
  // Common test wallet - adjust if needed
  const testUsers = [
    'AZDvCHK6DJjZqP9NRXhqePNbFWmYwWQhR6DqgHa9EuWF', // Example wallet
  ];

  console.log('');
  console.log('Checking for positions in epoch 49...');

  // UserPosition discriminator: [251, 248, 209, 245, 83, 234, 17, 27]
  const POSITION_DISCRIMINATOR = Buffer.from([251, 248, 209, 245, 83, 234, 17, 27]);

  // Filter by discriminator to reduce data
  const accounts = await connection.getProgramAccounts(PROGRAM_ID, {
    filters: [
      {
        memcmp: {
          offset: 0,
          bytes: 'MXXeDuJM3bDN', // Base58 of discriminator [251, 248, 209, 245, 83, 234, 17, 27]
        }
      },
      {
        memcmp: {
          offset: 40, // user (8 + 32) then epoch starts
          bytes: epochPda.toBase58(),
        }
      }
    ]
  });

  console.log('Found', accounts.length, 'positions in epoch 49');

  for (const acc of accounts) {
    const posData = acc.account.data;
    let posOffset = 8; // skip discriminator

    const user = new PublicKey(posData.subarray(posOffset, posOffset + 32));
    posOffset += 32;

    const posEpoch = new PublicKey(posData.subarray(posOffset, posOffset + 32));
    posOffset += 32;

    const direction = posData.readUInt8(posOffset);
    posOffset += 1;

    const amount = posData.readBigUInt64LE(posOffset);
    posOffset += 8;

    const shares = posData.readBigUInt64LE(posOffset);
    posOffset += 8;

    const entryPrice = posData.readBigUInt64LE(posOffset);
    posOffset += 8;

    const claimed = posData.readUInt8(posOffset) === 1;

    console.log('');
    console.log('  Position PDA:', acc.pubkey.toString());
    console.log('  User:', user.toString());
    console.log('  Direction:', direction === 0 ? 'Up' : 'Down');
    console.log('  Amount:', Number(amount) / 1e6, 'USDC');
    console.log('  Shares:', shares.toString());
    console.log('  Claimed:', claimed);
  }

  if (accounts.length === 0) {
    console.log('');
    console.log('No positions found in epoch 49.');
    console.log('This means no buy_position transactions succeeded for this epoch.');
  }
}

main().catch(console.error);

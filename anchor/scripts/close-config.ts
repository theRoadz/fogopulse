/**
 * Close GlobalConfig account — testnet utility
 * Run from WSL: cd /mnt/d/dev/fogopulse/anchor && npx tsx scripts/close-config.ts
 */
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const PROGRAM_ID = new PublicKey('D8htKqaQPp8g3VRpbwno1rCQcaBrMCbZZcaFVxSyDsX5')
const RPC = 'https://testnet.fogo.io'
// admin_close_config discriminator from IDL
const DISCRIMINATOR = Buffer.from([75, 10, 147, 161, 76, 223, 104, 89])

async function main() {
  const walletPath = process.env.WALLET_PATH ||
    path.join(os.homedir(), '.config', 'solana', 'fogo-testnet.json')

  console.log('Loading wallet from:', walletPath)
  const secretKey = JSON.parse(fs.readFileSync(walletPath, 'utf8'))
  const wallet = Keypair.fromSecretKey(Uint8Array.from(secretKey))
  console.log('Admin:', wallet.publicKey.toBase58())

  const connection = new Connection(RPC, 'confirmed')

  const [globalConfigPda] = PublicKey.findProgramAddressSync(
    [Buffer.from('global_config')],
    PROGRAM_ID
  )
  console.log('GlobalConfig PDA:', globalConfigPda.toBase58())

  // Check if account exists
  const account = await connection.getAccountInfo(globalConfigPda)
  if (!account) {
    console.log('GlobalConfig account does not exist. Nothing to close.')
    return
  }
  console.log('Account size:', account.data.length, 'bytes')
  console.log('Account balance:', account.lamports / 1e9, 'SOL')

  const ix = new TransactionInstruction({
    keys: [
      { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
      { pubkey: globalConfigPda, isSigner: false, isWritable: true },
    ],
    programId: PROGRAM_ID,
    data: DISCRIMINATOR,
  })

  console.log('Sending admin_close_config transaction...')
  const tx = new Transaction().add(ix)
  const sig = await sendAndConfirmTransaction(connection, tx, [wallet])
  console.log('GlobalConfig closed! Signature:', sig)
}

main().catch((err) => {
  console.error('Error:', err.message || err)
  process.exit(1)
})

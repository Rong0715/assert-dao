/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Chain the app talks to: 31337 (local), 84532 (Base Sepolia) or 8453 (Base). */
  readonly VITE_CHAIN_ID?: string;
  /** JSON-RPC endpoint to use instead of the public endpoint of the chain. */
  readonly VITE_RPC_URL?: string;
}

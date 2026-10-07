import { createPublicClient, http, type Address, type Chain } from 'viem';
import { anvil, base, baseSepolia } from 'viem/chains';
import type { Dao, Reader } from './dao';

/** A record written by the deployment scripts: `contracts/deployments/<chainId>.json`. */
export interface Deployment {
  chainId: number;
  proxy: Address;
  implementation: Address;
  version: string;
  startBlock: number;
}

export interface Network {
  chain: Chain;
  name: string;
  rpcUrl: string;
  /** A chain running on this machine, with unlocked accounts and no explorer. */
  local: boolean;
  deployment: Deployment | undefined;
}

const supported: Record<number, { chain: Chain; name: string }> = {
  [anvil.id]: { chain: anvil, name: 'local' },
  [baseSepolia.id]: { chain: baseSepolia, name: 'base sepolia' },
  [base.id]: { chain: base, name: 'base' },
};

const records = import.meta.glob<Deployment>('../../../contracts/deployments/*.json', {
  eager: true,
  import: 'default',
});
const deployments = new Map(Object.values(records).map((record) => [record.chainId, record]));

function chainId(): number {
  const configured = Number(import.meta.env.VITE_CHAIN_ID);
  if (configured in supported) return configured;
  if (import.meta.env.DEV) return anvil.id;
  // A build without an explicit chain serves production if it exists, staging otherwise.
  return deployments.has(base.id) ? base.id : baseSepolia.id;
}

function resolve(): Network {
  const { chain, name } = supported[chainId()]!;
  return {
    chain,
    name,
    rpcUrl: import.meta.env.VITE_RPC_URL ?? chain.rpcUrls.default.http[0]!,
    local: chain.id === anvil.id,
    deployment: deployments.get(chain.id),
  };
}

export const network: Network = resolve();

export const reader: Reader = createPublicClient({
  chain: network.chain,
  // One HTTP request carries all the calls a screen makes.
  transport: http(network.rpcUrl, { batch: true }),
  pollingInterval: network.local ? 250 : 2_000,
});

export const dao: Dao | undefined = network.deployment && { client: reader, address: network.deployment.proxy };

/** Link to an address or a transaction on the explorer of the chain, if it has one. */
export function explorerLink(kind: 'address' | 'tx', value: string): string | undefined {
  const explorer = network.chain.blockExplorers?.default.url;
  return explorer && !network.local ? `${explorer}/${kind}/${value}` : undefined;
}

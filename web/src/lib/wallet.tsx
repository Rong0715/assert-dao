// The wallet of the visitor: a browser wallet, or one of the unlocked accounts of the local chain.
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createWalletClient, custom, getAddress, http, type Address, type EIP1193Provider } from 'viem';
import { network } from './chains';
import type { Writer } from './dao';

export interface ConnectOption {
  /** Stable across reloads: remembered to reconnect silently. */
  id: string;
  kind: 'local' | 'injected';
  /** Name of the wallet, for browser wallets. */
  name?: string;
  icon?: string;
  /** Account, for the unlocked accounts of the local chain. */
  address?: Address;
  provider?: EIP1193Provider;
}

export interface Wallet {
  address: Address;
  kind: 'local' | 'injected';
  client: Writer;
}

interface WalletState {
  wallet: Wallet | null;
  options: ConnectOption[];
  connect: (option: ConnectOption) => Promise<Wallet>;
  disconnect: () => void;
}

const WalletContext = createContext<WalletState | null>(null);
const REMEMBERED = 'assert-dao.wallet';

// EIP-6963: wallets announce themselves instead of fighting over `window.ethereum`.
interface Announcement extends Event {
  detail: { info: { uuid: string; name: string; icon: string; rdns: string }; provider: EIP1193Provider };
}

function remember(id: string | null): void {
  try {
    if (id === null) localStorage.removeItem(REMEMBERED);
    else localStorage.setItem(REMEMBERED, id);
  } catch {
    // Storage can be unavailable: the wallet is then simply not remembered.
  }
}

function remembered(): string | null {
  try {
    return localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

async function open(option: ConnectOption, { silent = false } = {}): Promise<Wallet | null> {
  if (option.kind === 'local') {
    const address = option.address!;
    return {
      address,
      kind: 'local',
      client: createWalletClient({ account: address, chain: network.chain, transport: http(network.rpcUrl) }),
    };
  }
  const provider = option.provider!;
  // `eth_accounts` never prompts: it only answers for a wallet that was connected before.
  const accounts = await provider.request({ method: silent ? 'eth_accounts' : 'eth_requestAccounts' });
  const [first] = accounts;
  if (first === undefined) return null;
  const address = getAddress(first);
  return {
    address,
    kind: 'injected',
    client: createWalletClient({ account: address, chain: network.chain, transport: custom(provider) }),
  };
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [options, setOptions] = useState<ConnectOption[]>([]);
  const restored = useRef(false);

  const add = useCallback((found: ConnectOption[]) => {
    setOptions((current) => [...current, ...found.filter((option) => !current.some(({ id }) => id === option.id))]);
  }, []);

  // Discover what there is to connect to.
  useEffect(() => {
    let cancelled = false;
    if (network.local) {
      // The local chain signs for its own accounts: they are listed, not typed in.
      createWalletClient({ chain: network.chain, transport: http(network.rpcUrl) })
        .getAddresses()
        .then((accounts) => {
          if (cancelled) return;
          add(accounts.map((account) => ({ id: `local:${account.toLowerCase()}`, kind: 'local', address: account })));
        })
        .catch(() => undefined);
    }

    const onAnnouncement = (event: Event) => {
      const { info, provider } = (event as Announcement).detail;
      add([{ id: `injected:${info.rdns}`, kind: 'injected', name: info.name, icon: info.icon, provider }]);
    };
    window.addEventListener('eip6963:announceProvider', onAnnouncement);
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Wallets that predate the announcement protocol.
    const timer = setTimeout(() => {
      const legacy = (window as { ethereum?: EIP1193Provider }).ethereum;
      if (legacy) {
        setOptions((current) =>
          current.some((option) => option.kind === 'injected')
            ? current
            : [...current, { id: 'injected:legacy', kind: 'injected', name: 'browser wallet', provider: legacy }],
        );
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      window.removeEventListener('eip6963:announceProvider', onAnnouncement);
    };
  }, [add]);

  // Reconnect to the wallet used last time, without prompting.
  useEffect(() => {
    if (restored.current) return;
    const id = remembered();
    if (id === null) {
      restored.current = true;
      return;
    }
    const option = options.find((candidate) => candidate.id === id);
    if (!option) return;
    restored.current = true;
    open(option, { silent: true })
      .then((restoredWallet) => {
        if (restoredWallet) setWallet((current) => current ?? restoredWallet);
      })
      .catch(() => undefined);
  }, [options]);

  // Follow the account selected in a browser wallet.
  useEffect(() => {
    if (wallet?.kind !== 'injected') return;
    const provider = options.find((option) => option.id === remembered())?.provider;
    if (!provider) return;
    const onAccounts = (accounts: Address[]) => {
      const [first] = accounts;
      if (first === undefined) {
        remember(null);
        setWallet(null);
      } else {
        const address = getAddress(first);
        setWallet({
          address,
          kind: 'injected',
          client: createWalletClient({ account: address, chain: network.chain, transport: custom(provider) }),
        });
      }
    };
    provider.on('accountsChanged', onAccounts);
    return () => {
      provider.removeListener('accountsChanged', onAccounts);
    };
  }, [wallet?.kind, options]);

  const connect = useCallback(async (option: ConnectOption) => {
    const opened = await open(option);
    if (!opened) throw new Error('the wallet shared no account');
    restored.current = true;
    remember(option.id);
    setWallet(opened);
    return opened;
  }, []);

  const disconnect = useCallback(() => {
    remember(null);
    setWallet(null);
  }, []);

  const value = useMemo(() => ({ wallet, options, connect, disconnect }), [wallet, options, connect, disconnect]);
  return <WalletContext value={value}>{children}</WalletContext>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useWallet(): WalletState {
  const state = use(WalletContext);
  if (!state) throw new Error('useWallet needs a WalletProvider');
  return state;
}

/** Puts a browser wallet on the chain of the DAO before it signs, adding the chain if the wallet lacks it. */
// eslint-disable-next-line react-refresh/only-export-components
export async function ensureChain(wallet: Wallet): Promise<void> {
  if (wallet.kind === 'local') return;
  if ((await wallet.client.getChainId()) === network.chain.id) return;
  try {
    await wallet.client.switchChain({ id: network.chain.id });
  } catch (error) {
    // 4902: the wallet does not know the chain.
    if ((error as { code?: number }).code !== 4902) throw error;
    await wallet.client.addChain({ chain: network.chain });
  }
}

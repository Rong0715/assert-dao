import { createContext, use } from 'react';
import type { Context, Draft } from './plan';
import type { Wallet } from './wallet';

/** What every screen can rely on: the state of the DAO and of the visitor, and the way to issue commands. */
export interface Session {
  ctx: Context;
  wallet: Wallet | null;
  /** Ballot being written in the prompt, if any. */
  draft: Draft | undefined;
  /** Whether an operation is on its way to the chain. */
  busy: boolean;
  /** Writes a command in the prompt, for the visitor to complete or confirm. */
  write: (text: string, options?: { focus?: boolean }) => void;
  /** Runs a command as if it had been typed and entered. */
  run: (text: string) => void;
  /** Sends a transaction, reporting its progress on the status line. Resolves to undefined if it fails. */
  perform: <T>(
    doing: string,
    done: (result: T) => string,
    work: (wallet: Wallet) => Promise<T>,
  ) => Promise<T | undefined>;
}

export const SessionContext = createContext<Session | null>(null);

export function useSession(): Session {
  const session = use(SessionContext);
  if (!session) throw new Error('useSession needs a session');
  return session;
}

import { useState, type ReactNode } from 'react';
import type { Address as Hex } from 'viem';
import { explorerLink } from '../lib/chains';
import { useNow } from '../lib/clock';
import { stateOf, type Round } from '../lib/dao';
import { formatDuration, formatMoment, shortAddress } from '../lib/format';
import { hashFromCommand } from '../lib/router';

/** A link that runs a command: the address bar and the screen change together. */
export function Go({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  return (
    <a className={className} href={hashFromCommand(to)}>
      {children}
    </a>
  );
}

/** The command a screen is the answer to. */
export function Echo({ command }: { command: string }) {
  return (
    <p className="echo">
      <span aria-hidden="true">❯</span> {command}
    </p>
  );
}

/** An address: short, copied in full on click, linked to the explorer when the chain has one. */
export function Account({ address, full = false }: { address: Hex; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const link = explorerLink('address', address);
  const copy = () => {
    void navigator.clipboard.writeText(address).then(() => {
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 1200);
    });
  };
  return (
    <span className="address">
      <button type="button" onClick={copy} data-tip={copied ? 'copied' : 'copy'}>
        {full ? address : shortAddress(address)}
      </button>
      {link && (
        <a href={link} target="_blank" rel="noopener noreferrer" aria-label="open in the explorer">
          ↗
        </a>
      )}
    </span>
  );
}

/** Where a round stands in time, ticking. */
export function Countdown({ round }: { round: Round }) {
  const now = useNow();
  switch (stateOf(round, now)) {
    case 'pending':
      return <span data-tip={formatMoment(round.start)}>opens in {formatDuration(round.start - now)}</span>;
    case 'active':
      return <span data-tip={formatMoment(round.end)}>closes in {formatDuration(round.end - now)}</span>;
    case 'closed':
      return <span data-tip={formatMoment(round.end)}>final</span>;
    case 'cancelled':
      return <span>void</span>;
  }
}

// The visual vocabulary of a round: the marks that carry numbers.
import { cost, letter } from '../lib/ballot';
import type { Proposal, RoundState } from '../lib/dao';
import { percent } from '../lib/format';
import { colorOf, inkOn } from '../lib/palette';
import { stateLabel } from '../lib/plan';

/** The letter of a proposal on the colour that identifies it wherever it is drawn. */
export function Badge({ index, small = false }: { index: number; small?: boolean }) {
  const fill = colorOf(index);
  return (
    <span className={small ? 'badge badge-small' : 'badge'} style={{ background: fill, color: inkOn(fill) }}>
      {letter(index)}
    </span>
  );
}

export function StatePill({ state }: { state: RoundState }) {
  return (
    <span className={`pill pill-${state}`}>
      <i aria-hidden="true" />
      {stateLabel[state]}
    </span>
  );
}

/** How the votes of a round are shared between its proposals: one bar, one segment per proposal. */
export function ShareBar({ proposals, slim = false }: { proposals: readonly Proposal[]; slim?: boolean }) {
  const total = proposals.reduce((sum, proposal) => sum + proposal.votes, 0);
  if (total === 0) return <div className={slim ? 'share share-slim share-empty' : 'share share-empty'} />;
  return (
    <div className={slim ? 'share share-slim' : 'share'} role="img" aria-label="share of the votes per proposal">
      {proposals
        .filter((proposal) => proposal.votes > 0)
        .map((proposal) => (
          <i
            key={proposal.index}
            style={{ flexGrow: proposal.votes, background: colorOf(proposal.index) }}
            data-tip={`${letter(proposal.index)} · ${percent(proposal.votes, total)}% · ${proposal.votes} votes`}
            tabIndex={slim ? undefined : 0}
          />
        ))}
    </div>
  );
}

/**
 * Votes drawn as the side of a square whose area is their cost: quadratic voting at a glance. Ten votes fill the
 * frame, and cost the whole budget.
 */
export function VoteSquare({ votes, index, size = 28 }: { votes: number; index: number; size?: number }) {
  const side = Math.min(1, votes / 10) * size;
  return (
    <span
      className="square"
      style={{ width: size, height: size }}
      data-tip={`${votes} ${votes === 1 ? 'vote' : 'votes'} · ${votes * votes} credits`}
    >
      {votes > 0 && <i style={{ width: side, height: side, background: colorOf(index) }} />}
    </span>
  );
}

/** The budget of a ballot, spent proposal by proposal. */
export function CreditMeter({ votes, credits }: { votes: readonly number[]; credits: number }) {
  const spent = cost(votes);
  return (
    <div className="meter" role="img" aria-label={`${spent} of ${credits} credits spent`}>
      {votes.map(
        (value, index) =>
          value > 0 && (
            <i
              key={index}
              style={{ flexGrow: value * value, background: colorOf(index) }}
              data-tip={`${letter(index)} · ${value} ${value === 1 ? 'vote' : 'votes'} · ${value * value} credits`}
            />
          ),
      )}
      {spent < credits && <i className="meter-rest" style={{ flexGrow: credits - spent }} />}
    </div>
  );
}

export function Stepper({
  value,
  max,
  label,
  onChange,
}: {
  value: number;
  max: number;
  label: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`one vote less for ${label}`}
        disabled={value <= 0}
        onClick={() => {
          onChange(value - 1);
        }}
      >
        −
      </button>
      <output aria-label={`votes for ${label}`}>{value}</output>
      <button
        type="button"
        aria-label={`one vote more for ${label}`}
        disabled={value >= max}
        onClick={() => {
          onChange(value + 1);
        }}
      >
        +
      </button>
    </div>
  );
}

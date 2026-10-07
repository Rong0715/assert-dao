import { useEffect, useRef } from 'react';
import { isAddressEqual } from 'viem';
import { Countdown, Go } from '../components/Bits';
import { Markdown } from '../components/Markdown';
import { Badge, ShareBar, StatePill, Stepper, VoteSquare } from '../components/Marks';
import { blank, ceiling, formatEntries, letter, sameBallot } from '../lib/ballot';
import { stateOf, totalVotes, type Proposal, type Round } from '../lib/dao';
import { formatWindow, percent } from '../lib/format';
import { colorOf } from '../lib/palette';
import { memberOf } from '../lib/plan';
import { useBallots } from '../lib/queries';
import { useSession } from '../lib/session';

export function RoundView({ round, open }: { round: Round; open?: number }) {
  const { ctx, draft, write } = useSession();
  const { association, account, now } = ctx;
  const ballots = useBallots(round.id);

  const state = stateOf(round, now);
  const count = round.proposals.length;
  const total = totalVotes(round);
  const leader = Math.max(0, ...round.proposals.map((proposal) => proposal.votes));
  const counted = state === 'active' || state === 'closed' || total > 0;

  // The ballot on screen is the one being written in the prompt, else the one on chain.
  const cast = account && ballots.data?.find((ballot) => isAddressEqual(ballot.voter, account))?.votes;
  const reference = cast ?? blank(count);
  const editing = draft?.roundId === round.id && draft.votes.length === count;
  const shown = editing ? draft.votes : reference;
  const canVote = state === 'active' && count > 0 && memberOf(association, account) !== undefined && ballots.isSuccess;

  const setVotes = (index: number, value: number) => {
    const next = shown.with(index, value);
    write(sameBallot(next, reference) ? '' : `vote ${round.id} ${formatEntries(next)}`, { focus: false });
  };

  // A closed round reads as a result: best first. An open one keeps the order of the ballot, so nothing moves
  // under the pointer of someone who is voting.
  const proposals =
    state === 'closed' ? [...round.proposals].sort((a, b) => b.votes - a.votes || a.index - b.index) : round.proposals;

  return (
    <section className="round">
      <header className="round-head">
        <h1>{round.title}</h1>
        <StatePill state={state} />
      </header>
      <p className="meta">
        <span>{formatWindow(round.start, round.end)}</span>
        <Countdown round={round} />
        {state === 'pending' || (state === 'cancelled' && round.voterCount === 0) ? (
          <span>{count === 1 ? '1 proposal' : `${count} proposals`}</span>
        ) : (
          <span>
            <Go to={`ballots ${round.id}`}>
              {state === 'active' && association
                ? `${round.voterCount} of ${association.members.length} voted`
                : `${round.voterCount} voted`}
            </Go>
          </span>
        )}
      </p>

      {counted && <ShareBar proposals={round.proposals} />}

      {count === 0 ? (
        <p className="empty">No proposals yet.</p>
      ) : (
        <ol className="proposals">
          {proposals.map((proposal) => (
            <ProposalRow
              key={proposal.index}
              roundId={round.id}
              proposal={proposal}
              open={open === proposal.index}
              share={counted ? { total, leader } : undefined}
              ballot={
                canVote && association
                  ? {
                      votes: shown[proposal.index] ?? 0,
                      max: ceiling(shown, proposal.index, association.credits),
                      onChange: (value) => {
                        setVotes(proposal.index, value);
                      },
                    }
                  : undefined
              }
            />
          ))}
        </ol>
      )}
    </section>
  );
}

function ProposalRow({
  roundId,
  proposal,
  open,
  share,
  ballot,
}: {
  roundId: number;
  proposal: Proposal;
  open: boolean;
  share: { total: number; leader: number } | undefined;
  ballot: { votes: number; max: number; onChange: (value: number) => void } | undefined;
}) {
  const row = useRef<HTMLLIElement>(null);
  const name = letter(proposal.index);

  // An unfolded proposal is brought into view: at once when the screen opens on it, gently when it is clicked.
  const arrived = useRef(false);
  useEffect(() => {
    if (open) row.current?.scrollIntoView({ block: 'nearest', behavior: arrived.current ? 'smooth' : 'auto' });
    arrived.current = true;
  }, [open]);

  return (
    <li ref={row} className={['proposal', open && 'is-open', ballot && 'has-ballot'].filter(Boolean).join(' ')}>
      <Go className="proposal-main" to={open ? `round ${roundId}` : `round ${roundId} ${name}`}>
        <Badge index={proposal.index} />
        <span className="proposal-text">
          <span className="proposal-title">{proposal.title}</span>
          {share && (
            <span className="bar">
              <i
                style={{
                  width: `${share.leader === 0 ? 0 : (proposal.votes / share.leader) * 100}%`,
                  background: colorOf(proposal.index),
                }}
              />
            </span>
          )}
        </span>
        {share && (
          <span className="proposal-stat">
            <b>{percent(proposal.votes, share.total)}%</b>
            <span>{proposal.votes === 1 ? '1 vote' : `${proposal.votes} votes`}</span>
          </span>
        )}
      </Go>
      {ballot && (
        <div className="proposal-vote">
          <VoteSquare votes={ballot.votes} index={proposal.index} size={30} />
          <Stepper value={ballot.votes} max={ballot.max} label={`proposal ${name}`} onChange={ballot.onChange} />
        </div>
      )}
      {open && (
        <div className="proposal-body">
          {proposal.body.trim() === '' ? <p className="empty">No description.</p> : <Markdown text={proposal.body} />}
        </div>
      )}
    </li>
  );
}

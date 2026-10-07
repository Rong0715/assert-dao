import { isAddressEqual } from 'viem';
import { Account, Countdown, Go } from '../components/Bits';
import { Identicon } from '../components/Identicon';
import { Badge, StatePill, VoteSquare } from '../components/Marks';
import { cost, letter } from '../lib/ballot';
import { stateOf, type Round } from '../lib/dao';
import { memberOf } from '../lib/plan';
import { useBallots } from '../lib/queries';
import { useSession } from '../lib/session';

export function BallotsView({ round }: { round: Round }) {
  const { ctx } = useSession();
  const { association, account, now } = ctx;
  const ballots = useBallots(round.id);
  const state = stateOf(round, now);
  const rows = ballots.data ?? [];
  const waiting =
    state === 'active'
      ? (association?.members ?? []).filter((member) => !rows.some((row) => isAddressEqual(row.voter, member.account)))
      : [];

  return (
    <section>
      <header className="round-head">
        <h1>
          <Go to={`round ${round.id}`}>{round.title}</Go>
        </h1>
        <StatePill state={state} />
      </header>
      <p className="meta">
        <span>ballots</span>
        <Countdown round={round} />
        <span>{round.voterCount} cast</span>
      </p>

      {rows.length === 0 ? (
        <p className="empty">{ballots.isPending ? '' : 'No ballot yet.'}</p>
      ) : (
        <div className="scroll">
          <table className="ballots">
            <thead>
              <tr>
                <th scope="col">member</th>
                {round.proposals.map((proposal) => (
                  <th key={proposal.index} scope="col" data-tip={proposal.title}>
                    <Go to={`round ${round.id} ${letter(proposal.index)}`}>
                      <Badge small index={proposal.index} />
                    </Go>
                  </th>
                ))}
                <th scope="col" className="num">
                  credits
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const member = memberOf(association, row.voter);
                const mine = account !== undefined && isAddressEqual(row.voter, account);
                return (
                  <tr key={row.voter} className={mine ? 'is-mine' : undefined}>
                    <th scope="row">
                      <span className="who">
                        <Identicon address={row.voter} size={22} />
                        {member ? <b>{member.handle}</b> : <Account address={row.voter} />}
                      </span>
                    </th>
                    {row.votes.map((votes, index) => (
                      <td key={index}>
                        <span className="cell">
                          <VoteSquare votes={votes} index={index} size={22} />
                          <span className={votes === 0 ? 'zero' : undefined}>{votes}</span>
                        </span>
                      </td>
                    ))}
                    <td className="num">{cost(row.votes)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">total</th>
                {round.proposals.map((proposal) => (
                  <td key={proposal.index}>
                    <span className="cell">
                      <span className="square-gap" />
                      <span>{proposal.votes}</span>
                    </span>
                  </td>
                ))}
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {waiting.length > 0 && (
        <p className="waiting">
          <span>yet to vote</span>
          {waiting.map((member) => (
            <span key={member.account} className="who">
              <Identicon address={member.account} size={18} />
              {member.handle}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

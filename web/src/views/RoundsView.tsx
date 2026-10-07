import { Countdown, Go } from '../components/Bits';
import { ShareBar, StatePill } from '../components/Marks';
import { stateOf } from '../lib/dao';
import { formatWindow } from '../lib/format';
import { useSession } from '../lib/session';

export function RoundsView() {
  const { ctx } = useSession();
  const rounds = [...(ctx.rounds ?? [])].reverse();

  return (
    <section>
      <header className="round-head">
        <h1>Rounds</h1>
      </header>
      {rounds.length === 0 ? (
        <p className="empty">No rounds yet.</p>
      ) : (
        <ul className="rounds">
          {rounds.map((round) => {
            const state = stateOf(round, ctx.now);
            const count = round.proposals.length;
            return (
              <li key={round.id}>
                <Go className="round-card" to={`round ${round.id}`}>
                  <span className="round-card-head">
                    <span className="round-number">{round.id}</span>
                    <span className="round-card-title">{round.title}</span>
                    <StatePill state={state} />
                  </span>
                  <ShareBar slim proposals={round.proposals} />
                  <span className="meta">
                    <span>{formatWindow(round.start, round.end)}</span>
                    <Countdown round={round} />
                    <span>{count === 1 ? '1 proposal' : `${count} proposals`}</span>
                    {state !== 'pending' && <span>{round.voterCount} voted</span>}
                  </span>
                </Go>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

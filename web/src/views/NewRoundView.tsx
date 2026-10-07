import { useState, type SyntheticEvent } from 'react';
import { dao } from '../lib/chains';
import { createRound } from '../lib/dao';
import { byteLength, formatDuration, fromLocalInput, toLocalInput } from '../lib/format';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';

const DAY = 86_400;

/** Tomorrow at nine, local time: enough notice to fill the ballot, and a civilised hour to open. */
function defaultStart(now: number): number {
  const date = new Date((now + DAY) * 1000);
  date.setHours(9, 0, 0, 0);
  return Math.floor(date.getTime() / 1000);
}

export function NewRoundView() {
  const { ctx, busy, perform } = useSession();
  const limit = ctx.association?.limits.title ?? 120;
  const [title, setTitle] = useState('');
  const [opens, setOpens] = useState(() => toLocalInput(defaultStart(ctx.now)));
  const [closes, setCloses] = useState(() => toLocalInput(defaultStart(ctx.now) + 14 * DAY));

  const start = fromLocalInput(opens);
  const end = fromLocalInput(closes);
  const problem =
    start === null || end === null
      ? 'pick both dates'
      : start <= ctx.now
        ? 'voting must open in the future'
        : end <= start
          ? 'voting must close after it opens'
          : byteLength(title) > limit
            ? `the title takes at most ${limit} bytes`
            : null;
  const ready = title.trim() !== '' && problem === null && !busy;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready || !dao || start === null || end === null) return;
    void perform(
      'creating the round',
      (id: number) => `round ${id} created`,
      (wallet) => createRound(dao!, wallet.client, title.trim(), start, end),
    ).then((id) => {
      if (id !== undefined) navigate(`round ${id}`);
    });
  };

  return (
    <section>
      <header className="round-head">
        <h1>New round</h1>
      </header>
      <form className="form" onSubmit={submit}>
        <label>
          <span>title</span>
          <input
            autoFocus
            value={title}
            placeholder="2027 H1"
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </label>
        <div className="form-row">
          <label>
            <span>voting opens</span>
            <input
              type="datetime-local"
              value={opens}
              onChange={(event) => {
                setOpens(event.target.value);
              }}
            />
          </label>
          <label>
            <span>voting closes</span>
            <input
              type="datetime-local"
              value={closes}
              onChange={(event) => {
                setCloses(event.target.value);
              }}
            />
          </label>
        </div>
        <footer>
          <button type="submit" className="primary" disabled={!ready}>
            create round
          </button>
          {problem ? (
            <span className="form-note is-bad">{problem}</span>
          ) : (
            start !== null && end !== null && <span className="form-note">open for {formatDuration(end - start)}</span>
          )}
        </footer>
      </form>
    </section>
  );
}

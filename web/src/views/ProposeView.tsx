import { useState, type SyntheticEvent } from 'react';
import { Go } from '../components/Bits';
import { Markdown } from '../components/Markdown';
import { Badge } from '../components/Marks';
import { letter } from '../lib/ballot';
import { dao } from '../lib/chains';
import { propose, type Round } from '../lib/dao';
import { byteLength } from '../lib/format';
import { navigate } from '../lib/router';
import { useSession } from '../lib/session';

export function ProposeView({ round }: { round: Round }) {
  const { ctx, busy, perform } = useSession();
  const limits = ctx.association?.limits ?? { title: 120, body: 8192 };
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [preview, setPreview] = useState(false);

  const titleBytes = byteLength(title);
  const bodyBytes = byteLength(body);
  const problem =
    titleBytes > limits.title
      ? `the title takes at most ${limits.title} bytes`
      : bodyBytes > limits.body
        ? `the text takes at most ${limits.body} bytes, this is ${bodyBytes}`
        : null;
  const ready = title.trim() !== '' && problem === null && !busy;
  const next = round.proposals.length;

  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!ready || !dao) return;
    void perform(
      'adding the proposal',
      (index: number) => `proposal ${letter(index)} added to round ${round.id}`,
      (wallet) => propose(dao!, wallet.client, round.id, title.trim(), body),
    ).then((index) => {
      if (index !== undefined) navigate(`round ${round.id} ${letter(index)}`);
    });
  };

  return (
    <section>
      <header className="round-head">
        <h1>
          <Badge index={next} /> New proposal
        </h1>
      </header>
      <p className="meta">
        <span>
          <Go to={`round ${round.id}`}>{round.title}</Go>
        </span>
        <span>{next === 1 ? '1 proposal so far' : `${next} proposals so far`}</span>
      </p>
      <form className="form" onSubmit={submit}>
        <label>
          <span>title</span>
          <input
            autoFocus
            value={title}
            onChange={(event) => {
              setTitle(event.target.value);
            }}
          />
        </label>
        <div className="field">
          <div className="field-head">
            <span>text</span>
            <div className="tabs" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={!preview}
                onClick={() => {
                  setPreview(false);
                }}
              >
                write
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={preview}
                onClick={() => {
                  setPreview(true);
                }}
              >
                preview
              </button>
            </div>
          </div>
          {preview ? (
            <div className="preview">
              {body.trim() === '' ? <p className="empty">Nothing yet.</p> : <Markdown text={body} />}
            </div>
          ) : (
            <textarea
              value={body}
              aria-label="text of the proposal, markdown"
              placeholder="Markdown"
              rows={10}
              onChange={(event) => {
                setBody(event.target.value);
              }}
            />
          )}
        </div>
        <footer>
          <button type="submit" className="primary" disabled={!ready}>
            add to ballot
          </button>
          {problem ? (
            <span className="form-note is-bad">{problem}</span>
          ) : (
            bodyBytes > limits.body * 0.75 && (
              <span className="form-note">
                {bodyBytes} of {limits.body} bytes
              </span>
            )
          )}
        </footer>
      </form>
    </section>
  );
}

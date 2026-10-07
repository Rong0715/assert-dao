import { useRef, type KeyboardEvent, type ReactNode, type RefObject } from 'react';
import type { Plan, Suggestion } from '../lib/plan';
import { CreditMeter } from './Marks';

export interface Status {
  tone: 'busy' | 'ok' | 'error';
  text: string;
}

const icons: Record<Status['tone'], ReactNode> = {
  busy: <i className="spinner" aria-hidden="true" />,
  ok: <i aria-hidden="true">✓</i>,
  error: <i aria-hidden="true">✕</i>,
};

/** The prompt, docked at the bottom of the screen, with what the command in it would do. */
export function Dock({
  inputRef,
  input,
  plan,
  completion,
  example,
  chips,
  status,
  busy,
  credits,
  onInput,
  onSubmit,
  onChip,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  input: string;
  plan: Plan | null;
  completion: string;
  example: string;
  chips: Suggestion[];
  status: Status | null;
  busy: boolean;
  credits: number;
  onInput: (text: string) => void;
  onSubmit: () => void;
  onChip: (chip: Suggestion) => void;
}) {
  const history = useRef<string[]>([]);
  const cursor = useRef<number | null>(null);

  const recall = (step: number) => {
    const entries = history.current;
    if (entries.length === 0) return;
    const at = Math.min(entries.length, Math.max(0, (cursor.current ?? entries.length) + step));
    cursor.current = at === entries.length ? null : at;
    onInput(entries[at] ?? '');
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const atEnd = event.currentTarget.selectionStart === input.length;
    if (event.key === 'Enter') {
      event.preventDefault();
      const entered = input.trim();
      if (entered !== '' && history.current.at(-1) !== entered) history.current.push(entered);
      cursor.current = null;
      onSubmit();
    } else if ((event.key === 'Tab' || (event.key === 'ArrowRight' && atEnd)) && completion !== '') {
      event.preventDefault();
      onInput(input + completion);
    } else if (event.key === 'Escape') {
      cursor.current = null;
      if (input === '') event.currentTarget.blur();
      else onInput('');
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      recall(-1);
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      recall(1);
    }
  };

  let preview: ReactNode = null;
  if (status) {
    preview = (
      <span className={`dock-status is-${status.tone}`} role="status">
        {icons[status.tone]}
        {status.text}
      </span>
    );
  } else if (plan?.kind === 'action') {
    preview = plan.draft ? (
      <>
        <CreditMeter votes={plan.draft.votes} credits={credits} />
        <span className="dock-count">{plan.summary}</span>
      </>
    ) : (
      <span className="dock-summary">{plan.summary}</span>
    );
  } else if (plan?.kind === 'error' && plan.draft) {
    preview = (
      <>
        <CreditMeter votes={plan.draft.votes} credits={credits} />
        <span className="dock-count is-over">
          <i aria-hidden="true">✕</i>
          {plan.message}
        </span>
      </>
    );
  } else if (plan?.kind === 'usage') {
    preview = <span className="dock-hint">{plan.usage}</span>;
  } else if (plan?.kind === 'error' && completion === '') {
    // Said quietly: most of the time the command is simply not finished.
    preview = <span className="dock-hint">{plan.message}</span>;
  }

  const runnable = plan?.kind === 'action' || (plan?.kind === 'screen' && plan.screen.name !== 'loading');

  return (
    <div className="dock">
      <div className="dock-inner">
        {preview && <div className="dock-preview">{preview}</div>}
        <div className="chips">
          {chips.map((chip) => (
            <button
              key={chip.command}
              type="button"
              className="chip"
              onClick={() => {
                onChip(chip);
              }}
            >
              {chip.command.trim()}
              {chip.mode === 'write' && <span aria-hidden="true">…</span>}
            </button>
          ))}
        </div>
        <div className={plan?.kind === 'action' ? 'prompt is-armed' : 'prompt'}>
          <span className="prompt-sign" aria-hidden="true">
            ❯
          </span>
          <div className="prompt-field">
            <span className="prompt-ghost" aria-hidden="true">
              <span>{input}</span>
              {completion}
            </span>
            <input
              ref={inputRef}
              value={input}
              placeholder={example}
              aria-label="command"
              spellCheck={false}
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              onChange={(event) => {
                cursor.current = null;
                onInput(event.target.value);
              }}
              onKeyDown={onKeyDown}
            />
          </div>
          {completion !== '' && <kbd className="prompt-key">tab</kbd>}
          {input === '' && <kbd className="prompt-key prompt-slash">/</kbd>}
          {runnable && (
            <button
              type="button"
              className={plan.kind === 'action' ? 'run primary' : 'run'}
              disabled={busy}
              onClick={onSubmit}
            >
              {plan.kind === 'action' && plan.verb}
              <kbd>↵</kbd>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

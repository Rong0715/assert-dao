import { catalog, type Audience } from '../lib/commands';
import { useSession } from '../lib/session';

const audiences: Audience[] = ['everyone', 'members', 'head'];

export function HelpView() {
  const { write } = useSession();
  return (
    <section>
      <header className="round-head">
        <h1>Commands</h1>
      </header>
      <p className="meta">
        <span>
          <kbd>/</kbd> focus
        </span>
        <span>
          <kbd>tab</kbd> complete
        </span>
        <span>
          <kbd>↑</kbd> history
        </span>
        <span>
          <kbd>esc</kbd> clear
        </span>
      </p>
      {audiences.map((audience) => (
        <div key={audience} className="help-group">
          <h2>{audience}</h2>
          <ul className="help">
            {catalog
              .filter((entry) => entry.audience === audience)
              .map((entry) => (
                <li key={entry.usage}>
                  <button
                    type="button"
                    onClick={() => {
                      write(entry.start);
                    }}
                  >
                    {entry.usage}
                  </button>
                  <span>{entry.about}</span>
                </li>
              ))}
          </ul>
        </div>
      ))}
    </section>
  );
}

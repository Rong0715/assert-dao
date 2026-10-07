import { Identicon } from '../components/Identicon';
import { shortAddress } from '../lib/format';
import { isHead, memberOf } from '../lib/plan';
import { useSession } from '../lib/session';
import { useWallet } from '../lib/wallet';

export function ConnectView() {
  const { ctx, run } = useSession();
  const { options } = useWallet();

  return (
    <section>
      <header className="round-head">
        <h1>Connect</h1>
      </header>
      {options.length === 0 ? (
        <p className="empty">No wallet found in this browser.</p>
      ) : (
        <ul className="members connect">
          {options.map((option, index) => {
            const target = ctx.targets[index];
            const member = memberOf(ctx.association, option.address);
            return (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => {
                    run(`connect ${index + 1}`);
                  }}
                >
                  {option.address ? (
                    <Identicon address={option.address} size={30} />
                  ) : option.icon ? (
                    <img src={option.icon} alt="" width={30} height={30} />
                  ) : (
                    <span className="wallet-mark" />
                  )}
                  <b>{target?.label ?? option.name}</b>
                  {isHead(ctx.association, option.address) && <span className="tag">head</span>}
                  {option.address && !member && <span className="tag tag-dim">not a member</span>}
                  {option.address && member && <span className="dim">{shortAddress(option.address)}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

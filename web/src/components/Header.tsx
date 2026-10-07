import { network } from '../lib/chains';
import { shortAddress } from '../lib/format';
import { isHead, memberOf } from '../lib/plan';
import { useSession } from '../lib/session';
import { Go } from './Bits';
import { Identicon } from './Identicon';

export function Header() {
  const { ctx, run } = useSession();
  const { association, account } = ctx;
  const member = memberOf(association, account);

  return (
    <header className="top">
      <a className="brand" href="#/" aria-label="ASSERT DAO, home">
        <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
          <rect width="32" height="32" rx="8" fill="#0b0b0b" />
          <path
            d="M9 10.5 15 16l-6 5.5M17.5 21.5H23"
            fill="none"
            stroke="#fff"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>
          assert<span className="dim"> dao</span>
        </span>
      </a>
      <div className="top-side">
        <span className="net" data-tip={`chain ${network.chain.id}`}>
          {network.name}
        </span>
        {account ? (
          <Go className="me" to="whoami">
            <Identicon address={account} size={22} />
            <b>{member?.handle ?? shortAddress(account)}</b>
            {isHead(association, account) && <span className="tag">head</span>}
          </Go>
        ) : (
          <button
            type="button"
            className="primary small"
            onClick={() => {
              run('connect');
            }}
          >
            connect
          </button>
        )}
      </div>
    </header>
  );
}

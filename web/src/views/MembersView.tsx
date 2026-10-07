import { isAddressEqual, type Address } from 'viem';
import { Account } from '../components/Bits';
import { Identicon } from '../components/Identicon';
import { isHead } from '../lib/plan';
import { useSession } from '../lib/session';

export function MembersView() {
  const { ctx, write } = useSession();
  const { association, account } = ctx;
  if (!association) return null;

  const head = isHead(association, account);
  const rank = (address: Address) => (isAddressEqual(address, association.head) ? 0 : 1);
  const members = [...association.members].sort(
    (a, b) => rank(a.account) - rank(b.account) || a.handle.localeCompare(b.handle, undefined, { sensitivity: 'base' }),
  );

  return (
    <section>
      <header className="round-head">
        <h1>Members</h1>
      </header>
      <p className="meta">
        <span>{members.length === 1 ? '1 member' : `${members.length} members`}</span>
        <span>{association.credits} credits each, every round</span>
      </p>
      <ul className="members">
        {members.map((member) => (
          <li
            key={member.account}
            className={account && isAddressEqual(member.account, account) ? 'is-mine' : undefined}
          >
            <Identicon address={member.account} size={30} />
            <b>{member.handle}</b>
            {isAddressEqual(member.account, association.head) && <span className="tag">head</span>}
            <Account address={member.account} />
            {head && (
              <button
                type="button"
                className="quiet"
                onClick={() => {
                  write(`remove member ${member.handle}`);
                }}
              >
                remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

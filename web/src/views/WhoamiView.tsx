import { Account } from '../components/Bits';
import { Identicon } from '../components/Identicon';
import { network } from '../lib/chains';
import { isHead, memberOf } from '../lib/plan';
import { useSession } from '../lib/session';

export function WhoamiView() {
  const { ctx } = useSession();
  const { association, account } = ctx;
  const member = memberOf(association, account);
  const head = isHead(association, account);
  const role = [head && 'head', member && 'member'].filter(Boolean).join(' · ') || 'visitor';
  const headMember = association && memberOf(association, association.head);

  return (
    <section>
      <header className="round-head">
        <h1 className="whoami-name">
          {account && <Identicon address={account} size={34} />}
          {member?.handle ?? (account ? 'Visitor' : 'Not connected')}
        </h1>
      </header>
      <dl className="facts">
        {account && (
          <>
            <dt>role</dt>
            <dd>{role}</dd>
            <dt>account</dt>
            <dd>
              <Account full address={account} />
            </dd>
          </>
        )}
        <dt>network</dt>
        <dd>
          {network.name} <span className="dim">· chain {network.chain.id}</span>
        </dd>
        {network.deployment && (
          <>
            <dt>contract</dt>
            <dd>
              <Account full address={network.deployment.proxy} />
            </dd>
          </>
        )}
        {association && (
          <>
            <dt>version</dt>
            <dd>{association.version}</dd>
            <dt>head</dt>
            <dd>
              {headMember && <>{headMember.handle} </>}
              <Account address={association.head} />
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}

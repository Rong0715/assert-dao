import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Echo } from './components/Bits';
import { Dock, type Status } from './components/Dock';
import { Header } from './components/Header';
import { dao, network } from './lib/chains';
import { useNow } from './lib/clock';
import { cancelRound, addMember, removeMember, stateOf, vote } from './lib/dao';
import { explain } from './lib/errors';
import { shortAddress } from './lib/format';
import {
  analyze,
  complete,
  memberOf,
  suggestions,
  type Context,
  type Plan,
  type Screen,
  type Suggestion,
} from './lib/plan';
import { useAssociation, useRounds } from './lib/queries';
import { navigate, useRoute } from './lib/router';
import { SessionContext, type Session } from './lib/session';
import { ensureChain, useWallet, type Wallet } from './lib/wallet';
import { BallotsView } from './views/BallotsView';
import { ConnectView } from './views/ConnectView';
import { HelpView } from './views/HelpView';
import { MembersView } from './views/MembersView';
import { NewRoundView } from './views/NewRoundView';
import { ProposeView } from './views/ProposeView';
import { RoundView } from './views/RoundView';
import { RoundsView } from './views/RoundsView';
import { WhoamiView } from './views/WhoamiView';

export function App() {
  const route = useRoute();
  const now = useNow();
  const association = useAssociation();
  const rounds = useRounds();
  const { wallet, options, connect, disconnect } = useWallet();
  const queryClient = useQueryClient();

  const [input, setInput] = useState('');
  const [status, setStatus] = useState<Status | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = status?.tone === 'busy';

  // What `connect` can connect to, under the names the visitor would use for it.
  const targets = useMemo(
    () =>
      options.map((option) => ({
        address: option.address,
        label: option.address
          ? (memberOf(association.data, option.address)?.handle ?? shortAddress(option.address))
          : (option.name ?? 'wallet'),
      })),
    [options, association.data],
  );

  const base = { now, association: association.data, rounds: rounds.data, account: wallet?.address, targets };

  // The address bar only ever selects a screen: a link cannot make the app act.
  const routed = analyze(route === '' ? 'home' : route, { ...base, current: undefined });
  const screen: Screen | null = routed?.kind === 'screen' ? routed.screen : null;
  const current = screen && 'id' in screen ? screen.id : undefined;
  const ctx: Context = { ...base, current };

  const planned = analyze(input, ctx);
  const completion = complete(input, ctx);
  const draft = planned && 'draft' in planned ? planned.draft : undefined;

  // A success fades by itself; an error stays until the next keystroke.
  useEffect(() => {
    if (status?.tone !== 'ok') return;
    const timer = setTimeout(() => {
      setStatus(null);
    }, 4500);
    return () => {
      clearTimeout(timer);
    };
  }, [status]);

  // `/` reaches the prompt from anywhere.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (event.key !== '/' || event.metaKey || event.ctrlKey || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
        return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const write = useCallback<Session['write']>((text, { focus = true } = {}) => {
    setInput(text);
    setStatus(null);
    if (focus) inputRef.current?.focus();
  }, []);

  const perform = useCallback<Session['perform']>(
    async (doing, done, work) => {
      if (!wallet) {
        setStatus({ tone: 'error', text: 'connect first' });
        return undefined;
      }
      setStatus({ tone: 'busy', text: doing });
      try {
        await ensureChain(wallet);
        const result = await work(wallet);
        await queryClient.invalidateQueries();
        setStatus({ tone: 'ok', text: done(result) });
        return result;
      } catch (error) {
        setStatus({ tone: 'error', text: explain(error) });
        return undefined;
      }
    },
    [wallet, queryClient],
  );

  /** Carries out an operation. Resolves to whether it succeeded. */
  const execute = async (plan: Extract<Plan, { kind: 'action' }>): Promise<boolean> => {
    const { action } = plan;
    const sent = (work: (signer: Wallet) => Promise<unknown>, doing: string, done: string) =>
      perform(doing, () => done, work).then((result) => result !== undefined);

    switch (action.type) {
      case 'connect': {
        const option = options[action.target];
        if (!option) return false;
        setStatus({ tone: 'busy', text: 'connecting' });
        try {
          const connected = await connect(option);
          const label = targets[action.target]?.label ?? shortAddress(connected.address);
          setStatus({ tone: 'ok', text: `connected · ${label}` });
          if (screen?.name === 'connect') navigate('');
          return true;
        } catch (error) {
          setStatus({ tone: 'error', text: explain(error) });
          return false;
        }
      }
      case 'disconnect':
        disconnect();
        setStatus({ tone: 'ok', text: 'disconnected' });
        return true;
      case 'vote':
        return sent(
          (signer) => vote(dao!, signer.client, action.roundId, action.votes),
          'casting your vote',
          'vote cast',
        );
      case 'cancel':
        return sent(
          (signer) => cancelRound(dao!, signer.client, action.roundId),
          'cancelling the round',
          `round ${action.roundId} cancelled`,
        );
      case 'add member':
        return sent(
          (signer) => addMember(dao!, signer.client, action.account, action.handle),
          'adding the member',
          `${action.handle} can vote`,
        );
      case 'remove member':
        return sent(
          (signer) => removeMember(dao!, signer.client, action.account),
          'removing the member',
          `${action.handle} removed`,
        );
    }
  };

  /** Runs a line of text. `typed` tells whether it sits in the prompt, which is then cleared on success. */
  const submit = (text: string, typed: boolean) => {
    if (busy) return;
    const plan = analyze(text, ctx);
    if (!plan) return;
    switch (plan.kind) {
      case 'screen':
        if (plan.screen.name === 'loading') return;
        navigate(plan.command);
        if (typed) setInput('');
        setStatus(null);
        return;
      case 'action':
        void execute(plan).then((succeeded) => {
          if (succeeded && typed) setInput('');
        });
        return;
      case 'error':
        setStatus({ tone: 'error', text: plan.message });
        return;
      case 'usage':
        setStatus({ tone: 'error', text: `usage: ${plan.usage}` });
        return;
    }
  };

  const onChip = (chip: Suggestion) => {
    if (chip.mode === 'write') write(chip.command);
    else submit(chip.command, false);
  };

  const session: Session = {
    ctx,
    wallet,
    draft,
    busy,
    write,
    run: (text) => {
      submit(text, false);
    },
    perform,
  };

  // The example in the empty prompt is the most useful thing the visitor could type.
  const openRound = rounds.data?.findLast((round) => stateOf(round, now) === 'active');
  const example = openRound && memberOf(association.data, wallet?.address) ? `vote ${openRound.id} A=6 C=8` : 'help';

  const command = routed?.kind === 'screen' ? routed.command : route;
  useEffect(() => {
    document.title = command ? `${command} · ASSERT DAO` : 'ASSERT DAO';
  }, [command]);

  // A new screen starts at its top, unless it opens on a proposal, which then scrolls itself into view.
  // Unfolding a proposal is the same screen, and stays where it is.
  const place = screen ? `${screen.name} ${'id' in screen ? screen.id : ''}` : route;
  const unfolded = screen?.name === 'round' && screen.open !== undefined;
  const settled = useRef('');
  useEffect(() => {
    if (settled.current !== place && !unfolded) window.scrollTo({ top: 0 });
    settled.current = place;
  }, [place, unfolded]);

  const round = current === undefined ? undefined : rounds.data?.find((candidate) => candidate.id === current);
  const failure = association.error ?? rounds.error;

  return (
    <SessionContext value={session}>
      <Header />
      <main key={place}>
        {!dao ? (
          <Notice title={`No DAO on ${network.name}`}>
            {network.local
              ? 'Start the local chain: npm run dev'
              : `Nothing is deployed on chain ${network.chain.id} yet.`}
          </Notice>
        ) : failure && !rounds.data ? (
          <Notice title="The chain does not answer">{network.rpcUrl}</Notice>
        ) : !screen ? (
          <>
            <Echo command={route} />
            <p className="empty">{routed?.kind === 'error' ? routed.message : 'This address shows no screen.'}</p>
          </>
        ) : screen.name === 'loading' ? (
          <p className="echo is-waiting">
            <span aria-hidden="true">❯</span> <i className="caret" />
          </p>
        ) : (
          <>
            <Echo command={command} />
            {screen.name === 'rounds' && <RoundsView />}
            {screen.name === 'round' && round && <RoundView round={round} open={screen.open} />}
            {screen.name === 'ballots' && round && <BallotsView round={round} />}
            {screen.name === 'members' && <MembersView />}
            {screen.name === 'whoami' && <WhoamiView />}
            {screen.name === 'help' && <HelpView />}
            {screen.name === 'connect' && <ConnectView />}
            {screen.name === 'new round' && <NewRoundView />}
            {screen.name === 'propose' && round && <ProposeView round={round} />}
          </>
        )}
      </main>
      <Dock
        inputRef={inputRef}
        input={input}
        plan={planned}
        completion={completion}
        example={example}
        chips={screen?.name === 'loading' ? [] : suggestions(ctx, screen ?? { name: 'loading' })}
        status={status}
        busy={busy}
        credits={association.data?.credits ?? 100}
        onInput={(text) => {
          setInput(text);
          setStatus((previous) => (previous?.tone === 'busy' ? previous : null));
        }}
        onSubmit={() => {
          submit(input, true);
        }}
        onChip={onChip}
      />
    </SessionContext>
  );
}

function Notice({ title, children }: { title: string; children: string }) {
  return (
    <section className="notice">
      <h1>{title}</h1>
      <p>{children}</p>
    </section>
  );
}

// What a command means right now: which screen it shows or which operation it performs, given the state of the
// DAO and of the wallet. Pure functions, so the prompt can explain a command before it is run.
import { getAddress, isAddress, isAddressEqual, type Address } from 'viem';
import { cost, indexOfLetter, letter, parseEntries } from './ballot';
import { parse, type Command } from './commands';
import { stateOf, type Association, type Member, type Round, type RoundState } from './dao';
import { byteLength, shortAddress } from './format';

/** Something `connect` can connect to: a wallet, or an unlocked account of the local chain. */
export interface Target {
  label: string;
  address?: Address;
}

export interface Context {
  /** Current time, in seconds. */
  now: number;
  association: Association | undefined;
  rounds: readonly Round[] | undefined;
  /** Connected account. */
  account: Address | undefined;
  targets: readonly Target[];
  /** Round on screen: the default of the commands that take a round. */
  current: number | undefined;
}

export type Screen =
  | { name: 'loading' }
  | { name: 'rounds' }
  | { name: 'round'; id: number; open?: number }
  | { name: 'ballots'; id: number }
  | { name: 'members' }
  | { name: 'whoami' }
  | { name: 'help' }
  | { name: 'connect' }
  | { name: 'new round' }
  | { name: 'propose'; id: number };

export type Action =
  | { type: 'connect'; target: number }
  | { type: 'disconnect' }
  | { type: 'vote'; roundId: number; votes: number[] }
  | { type: 'cancel'; roundId: number }
  | { type: 'add member'; account: Address; handle: string }
  | { type: 'remove member'; account: Address; handle: string };

/** A ballot being written, valid or not, so that its cost can be drawn. */
export interface Draft {
  roundId: number;
  votes: number[];
}

export type Plan =
  | { kind: 'screen'; screen: Screen; command: string }
  | { kind: 'action'; action: Action; verb: string; summary: string; draft?: Draft }
  | { kind: 'usage'; usage: string }
  | { kind: 'error'; message: string; draft?: Draft };

const screen = (target: Screen, command: string): Plan => ({ kind: 'screen', screen: target, command });
const error = (message: string, draft?: Draft): Plan => ({ kind: 'error', message, draft });
const usage = (text: string): Plan => ({ kind: 'usage', usage: text });

export const stateLabel: Record<RoundState, string> = {
  pending: 'upcoming',
  active: 'open',
  closed: 'closed',
  cancelled: 'cancelled',
};

export function memberOf(association: Association | undefined, account: Address | undefined): Member | undefined {
  if (!association || !account) return undefined;
  return association.members.find((member) => isAddressEqual(member.account, account));
}

export function isHead(association: Association | undefined, account: Address | undefined): boolean {
  return association !== undefined && account !== undefined && isAddressEqual(association.head, account);
}

/** The round a visitor most likely came for: the open one, else the next one, else the last one. */
export function featuredRound(rounds: readonly Round[], now: number): Round | undefined {
  const inState = (state: RoundState) => rounds.filter((round) => stateOf(round, now) === state);
  return (
    inState('active').at(-1) ??
    inState('pending').sort((a, b) => a.start - b.start)[0] ??
    inState('closed').at(-1) ??
    rounds.at(-1)
  );
}

export function plan(command: Command, ctx: Context): Plan {
  // These four work before anything is known about the DAO.
  if (command.name === 'help') return screen({ name: 'help' }, 'help');
  if (command.name === 'whoami') return screen({ name: 'whoami' }, 'whoami');
  if (command.name === 'connect') return planConnect(command.target, ctx);
  if (command.name === 'disconnect') {
    return ctx.account
      ? { kind: 'action', action: { type: 'disconnect' }, verb: 'disconnect', summary: shortAddress(ctx.account) }
      : error('no wallet is connected');
  }

  const { association, rounds, now } = ctx;
  if (!association || !rounds) return screen({ name: 'loading' }, '');

  const find = (id: number) => rounds.find((round) => round.id === id);
  const missing = (id: number) => error(rounds.length === 0 ? 'there are no rounds yet' : `there is no round ${id}`);
  const headOnly = (): Plan | undefined => {
    if (!ctx.account) return error('connect as the head first');
    if (!isHead(association, ctx.account)) return error('only the head can do that');
    return undefined;
  };

  switch (command.name) {
    case 'home': {
      const featured = featuredRound(rounds, now);
      return featured
        ? screen({ name: 'round', id: featured.id }, `round ${featured.id}`)
        : screen({ name: 'rounds' }, 'rounds');
    }

    case 'rounds':
      return screen({ name: 'rounds' }, 'rounds');

    case 'members':
      return screen({ name: 'members' }, 'members');

    case 'round': {
      const id = command.id ?? ctx.current ?? featuredRound(rounds, now)?.id;
      const round = id === undefined ? undefined : find(id);
      if (!round) return missing(id ?? 1);
      if (command.proposal === undefined) return screen({ name: 'round', id: round.id }, `round ${round.id}`);

      const open = indexOfLetter(command.proposal);
      if (open === null || open >= round.proposals.length) {
        return error(`round ${round.id} has no proposal ${command.proposal}`);
      }
      return screen({ name: 'round', id: round.id, open }, `round ${round.id} ${letter(open)}`);
    }

    case 'ballots': {
      const id = command.id ?? ctx.current ?? featuredRound(rounds, now)?.id;
      const round = id === undefined ? undefined : find(id);
      return round ? screen({ name: 'ballots', id: round.id }, `ballots ${round.id}`) : missing(id ?? 1);
    }

    case 'vote': {
      if (!ctx.account) return error('connect to vote');
      if (!memberOf(association, ctx.account)) return error('only members vote');

      const isOpen = (candidate: Round | undefined) => candidate && stateOf(candidate, now) === 'active';
      const onScreen = ctx.current === undefined ? undefined : find(ctx.current);
      const round =
        command.id !== undefined ? find(command.id) : isOpen(onScreen) ? onScreen : rounds.filter(isOpen).at(-1);
      if (!round) return command.id !== undefined ? missing(command.id) : error('no round is open');

      const state = stateOf(round, now);
      if (state !== 'active') return error(`round ${round.id} is ${stateLabel[state]}`);
      if (round.proposals.length === 0) return error(`round ${round.id} has no proposals`);
      if (command.entries.length === 0) return usage(`vote ${round.id} A=6 C=8`);

      const entries = parseEntries(command.entries, round.proposals.length);
      if (!entries.ok) return error(entries.error);

      const draft = { roundId: round.id, votes: entries.votes };
      const spent = cost(entries.votes);
      if (spent > association.credits) return error(`${spent} of ${association.credits} credits`, draft);
      return {
        kind: 'action',
        action: { type: 'vote', ...draft },
        verb: 'cast vote',
        summary: `${spent} of ${association.credits} credits`,
        draft,
      };
    }

    case 'new round':
      return headOnly() ?? screen({ name: 'new round' }, 'new round');

    case 'propose': {
      const refusal = headOnly();
      if (refusal) return refusal;

      const pending = rounds.filter((candidate) => stateOf(candidate, now) === 'pending');
      const id = command.id ?? pending.find((candidate) => candidate.id === ctx.current)?.id ?? pending.at(-1)?.id;
      if (id === undefined) return error('no upcoming round: start with “new round”');
      const round = find(id);
      if (!round) return missing(id);

      const state = stateOf(round, now);
      if (state !== 'pending') return error(`round ${round.id} is ${stateLabel[state]}: its ballot is final`);
      if (round.proposals.length >= association.limits.proposals)
        return error(`the ballot of round ${round.id} is full`);
      return screen({ name: 'propose', id: round.id }, `propose ${round.id}`);
    }

    case 'cancel': {
      const refusal = headOnly();
      if (refusal) return refusal;

      const id = command.id ?? ctx.current;
      if (id === undefined) return usage('cancel <n>');
      const round = find(id);
      if (!round) return missing(id);

      const state = stateOf(round, now);
      if (state !== 'pending' && state !== 'active') return error(`round ${round.id} is already ${stateLabel[state]}`);
      return {
        kind: 'action',
        action: { type: 'cancel', roundId: round.id },
        verb: 'cancel round',
        summary: `round ${round.id} · ${round.title}`,
      };
    }

    case 'add member': {
      const refusal = headOnly();
      if (refusal) return refusal;

      const { account, handle } = command;
      if (account === undefined || handle === undefined) return usage('add member <address> <handle>');
      if (!isAddress(account)) return error(`“${account}” is not an address`);

      const existing = memberOf(association, account);
      if (existing) return error(`this account is already a member: ${existing.handle}`);
      if (byteLength(handle) > association.limits.handle) {
        return error(`a handle takes at most ${association.limits.handle} bytes`);
      }
      return {
        kind: 'action',
        action: { type: 'add member', account: getAddress(account), handle },
        verb: 'add member',
        summary: `${handle} · ${shortAddress(getAddress(account))}`,
      };
    }

    case 'remove member': {
      const refusal = headOnly();
      if (refusal) return refusal;

      const { target } = command;
      if (target === undefined) return usage('remove member <handle>');

      const wanted = target.toLowerCase();
      const matches = association.members.filter(
        (member) => member.handle.toLowerCase() === wanted || member.account.toLowerCase() === wanted,
      );
      if (matches.length === 0) return error(`no member “${target}”`);
      if (matches.length > 1) return error(`several members are called “${target}”: use the address`);

      const [member] = matches as [Member];
      return {
        kind: 'action',
        action: { type: 'remove member', account: member.account, handle: member.handle },
        verb: 'remove member',
        summary: `${member.handle} · ${shortAddress(member.account)}`,
      };
    }
  }
}

function planConnect(target: string | undefined, ctx: Context): Plan {
  const { targets } = ctx;
  if (targets.length === 0) return error('no wallet found in this browser');

  const connect = (index: number): Plan => {
    const { label, address } = targets[index]!;
    return {
      kind: 'action',
      action: { type: 'connect', target: index },
      verb: 'connect',
      summary: address && label !== shortAddress(address) ? `${label} · ${shortAddress(address)}` : label,
    };
  };

  if (target === undefined) return targets.length === 1 ? connect(0) : screen({ name: 'connect' }, 'connect');

  const wanted = target.toLowerCase();
  const position = /^\d+$/.test(target) ? Number(target) - 1 : -1;
  const index = targets.findIndex(
    (candidate, at) =>
      at === position || candidate.label.toLowerCase() === wanted || candidate.address?.toLowerCase() === wanted,
  );
  return index === -1 ? error(`nothing to connect to called “${target}”`) : connect(index);
}

/** What a line of text would do, or null for an empty line. */
export function analyze(text: string, ctx: Context): Plan | null {
  if (text.trim() === '') return null;
  const parsed = parse(text);
  return parsed.ok ? plan(parsed.command, ctx) : error(parsed.error);
}

/** Commands that make sense right now, most relevant first: the vocabulary of completion. */
export function candidates(ctx: Context): string[] {
  const { association, rounds, now, account } = ctx;
  const list: string[] = [];
  const newestFirst = [...(rounds ?? [])].reverse();
  const head = isHead(association, account);

  if (memberOf(association, account)) {
    const open = newestFirst.find((round) => stateOf(round, now) === 'active');
    if (open) list.push(`vote ${open.id} `);
  }
  list.push('rounds');
  list.push(...newestFirst.map((round) => `round ${round.id}`));
  list.push(...newestFirst.map((round) => `ballots ${round.id}`));
  list.push('members', 'whoami', 'help');

  if (head) {
    list.push('new round');
    for (const round of newestFirst) {
      const state = stateOf(round, now);
      if (state === 'pending') list.push(`propose ${round.id}`);
      if (state === 'pending' || state === 'active') list.push(`cancel ${round.id}`);
    }
    list.push('add member ');
    list.push(...(association?.members ?? []).map((member) => `remove member ${member.handle}`));
  }

  if (account) list.push('disconnect');
  list.push('connect');
  if (ctx.targets.length > 1) list.push(...ctx.targets.map((target) => `connect ${target.label}`));
  return list;
}

/** The rest of the command being typed, if there is exactly one obvious way to finish it. */
export function complete(text: string, ctx: Context): string {
  const typed = text.trimStart();
  if (typed === '') return '';
  const lower = typed.toLowerCase();
  const match = candidates(ctx).find(
    (candidate) => candidate.toLowerCase().startsWith(lower) && candidate.length > typed.length,
  );
  return match ? match.slice(typed.length) : '';
}

export interface Suggestion {
  command: string;
  /** A suggestion either runs at once, or is written in the prompt to be completed or confirmed. */
  mode: 'run' | 'write';
}

/** The few commands offered as shortcuts under the screen on display. */
export function suggestions(ctx: Context, current: Screen): Suggestion[] {
  const { association, rounds, now, account } = ctx;
  const run = (command: string): Suggestion => ({ command, mode: 'run' });
  const write = (command: string): Suggestion => ({ command, mode: 'write' });
  const head = isHead(association, account);
  const list: Suggestion[] = [];

  if (!account && current.name !== 'connect') list.push(run('connect'));

  if (current.name === 'round' || current.name === 'ballots') {
    const round = rounds?.find((candidate) => candidate.id === current.id);
    const state = round && stateOf(round, now);
    if (current.name === 'ballots') list.push(run(`round ${current.id}`));
    else if (state === 'active' || (round?.voterCount ?? 0) > 0) list.push(run(`ballots ${current.id}`));
    if (head && state === 'pending') list.push(run(`propose ${current.id}`));
  }
  if (current.name === 'propose') list.push(run(`round ${current.id}`));
  if (current.name === 'rounds' && head) list.push(run('new round'));
  if (current.name === 'members' && head) list.push(write('add member '));

  for (const command of ['rounds', 'members', 'whoami', 'help']) {
    if (current.name !== command) list.push(run(command));
  }
  return list;
}

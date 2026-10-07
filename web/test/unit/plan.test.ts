import type { Address } from 'viem';
import { describe, expect, it } from 'vitest';
import { parse } from '../../src/lib/commands';
import type { Association, Round } from '../../src/lib/dao';
import {
  analyze,
  candidates,
  complete,
  featuredRound,
  plan,
  suggestions,
  type Context,
  type Plan,
} from '../../src/lib/plan';

const head: Address = '0x00000000000000000000000000000000000000A1';
const ada: Address = '0x00000000000000000000000000000000000000b2';
const grace: Address = '0x00000000000000000000000000000000000000C3';
const guest: Address = '0x00000000000000000000000000000000000000d4';
const NOW = 1_000_000;

const association: Association = {
  head,
  members: [
    { account: head, handle: 'M4RT1N' },
    { account: ada, handle: 'ada' },
    { account: grace, handle: 'grace' },
  ],
  roundCount: 3,
  version: '1.0.0',
  credits: 100,
  limits: { proposals: 4, handle: 32, title: 120, body: 8192 },
};

function round(id: number, start: number, end: number, proposals = 3): Round {
  return {
    id,
    title: `Round ${id}`,
    start: NOW + start,
    end: NOW + end,
    cancelled: false,
    voterCount: 0,
    proposals: Array.from({ length: proposals }, (_, index) => ({ index, title: `P${index}`, body: '', votes: 0 })),
  };
}

const closed = round(1, -200, -100);
const open = round(2, -50, 50);
const upcoming = round(3, 100, 200);

function context(overrides: Partial<Context> = {}): Context {
  return {
    now: NOW,
    association,
    rounds: [closed, open, upcoming],
    account: undefined,
    targets: [],
    current: undefined,
    ...overrides,
  };
}

function run(text: string, overrides: Partial<Context> = {}): Plan {
  const parsed = parse(text);
  if (!parsed.ok) throw new Error(parsed.error);
  return plan(parsed.command, context(overrides));
}

const screenOf = (result: Plan) =>
  result.kind === 'screen' ? result.command : `not a screen: ${JSON.stringify(result)}`;
const errorOf = (result: Plan) =>
  result.kind === 'error' ? result.message : `not an error: ${JSON.stringify(result)}`;
const actionOf = (result: Plan) =>
  result.kind === 'action' ? result.action : `not an action: ${JSON.stringify(result)}`;

describe('screens', () => {
  it('opens on the round a visitor most likely came for', () => {
    expect(screenOf(run(''))).toBe('round 2');
    expect(screenOf(run('', { rounds: [closed, upcoming] }))).toBe('round 3');
    expect(screenOf(run('', { rounds: [closed] }))).toBe('round 1');
    expect(screenOf(run('', { rounds: [] }))).toBe('rounds');
    expect(featuredRound([upcoming, round(4, 10, 20)], NOW)?.id).toBe(4);
  });

  it('defaults to the round on screen', () => {
    expect(screenOf(run('round', { current: 1 }))).toBe('round 1');
    expect(screenOf(run('ballots', { current: 1 }))).toBe('ballots 1');
    expect(screenOf(run('round B', { current: 1 }))).toBe('round 1 B');
    expect(screenOf(run('ballots'))).toBe('ballots 2');
  });

  it('refuses rounds and proposals that do not exist', () => {
    expect(errorOf(run('round 9'))).toBe('there is no round 9');
    expect(errorOf(run('ballots 9'))).toBe('there is no round 9');
    expect(errorOf(run('round 2 D'))).toBe('round 2 has no proposal D');
    expect(errorOf(run('round 1', { rounds: [] }))).toBe('there are no rounds yet');
  });

  it('waits for the data before judging a command', () => {
    expect(run('round 2', { rounds: undefined })).toMatchObject({ kind: 'screen', screen: { name: 'loading' } });
    expect(run('help', { rounds: undefined, association: undefined })).toMatchObject({ screen: { name: 'help' } });
  });
});

describe('vote', () => {
  it('is for connected members', () => {
    expect(errorOf(run('vote A=1'))).toBe('connect to vote');
    expect(errorOf(run('vote A=1', { account: guest }))).toBe('only members vote');
  });

  it('goes to the open round unless told otherwise', () => {
    expect(actionOf(run('vote A=6 C=8', { account: ada }))).toEqual({ type: 'vote', roundId: 2, votes: [6, 0, 8] });
    // Looking at a closed round does not redirect a vote to it.
    expect(actionOf(run('vote A=1', { account: ada, current: 1 }))).toMatchObject({ roundId: 2 });
    expect(errorOf(run('vote A=1', { account: ada, rounds: [closed, upcoming] }))).toBe('no round is open');
  });

  it('refuses rounds that are not open', () => {
    expect(errorOf(run('vote 1 A=1', { account: ada }))).toBe('round 1 is closed');
    expect(errorOf(run('vote 3 A=1', { account: ada }))).toBe('round 3 is upcoming');
    expect(errorOf(run('vote 9 A=1', { account: ada }))).toBe('there is no round 9');
    expect(errorOf(run('vote 2 A=1', { account: ada, rounds: [{ ...open, cancelled: true }] }))).toBe(
      'round 2 is cancelled',
    );
    expect(errorOf(run('vote 2 A=1', { account: ada, rounds: [round(2, -50, 50, 0)] }))).toBe(
      'round 2 has no proposals',
    );
  });

  it('shows the cost of a ballot, affordable or not', () => {
    expect(run('vote 2 A=6 C=8', { account: ada })).toMatchObject({
      kind: 'action',
      verb: 'cast vote',
      summary: '100 of 100 credits',
      draft: { roundId: 2, votes: [6, 0, 8] },
    });
    expect(run('vote 2 A=10 B=1', { account: ada })).toEqual({
      kind: 'error',
      message: '101 of 100 credits',
      draft: { roundId: 2, votes: [10, 1, 0] },
    });
    expect(actionOf(run('vote 2 none', { account: ada }))).toMatchObject({ votes: [0, 0, 0] });
  });

  it('asks for the votes when none are given', () => {
    expect(run('vote', { account: ada })).toEqual({ kind: 'usage', usage: 'vote 2 A=6 C=8' });
    expect(errorOf(run('vote 2 Z=1', { account: ada }))).toBe('no proposal Z');
  });
});

describe('what only the head does', () => {
  it('is refused to anyone else', () => {
    for (const text of ['new round', 'propose 3', 'cancel 2', `add member ${guest} dana`, 'remove member ada']) {
      expect(errorOf(run(text)), text).toBe('connect as the head first');
      expect(errorOf(run(text, { account: ada })), text).toBe('only the head can do that');
    }
  });

  it('schedules rounds and fills upcoming ballots', () => {
    expect(screenOf(run('new round', { account: head }))).toBe('new round');
    expect(screenOf(run('propose', { account: head }))).toBe('propose 3');
    expect(screenOf(run('propose 3', { account: head }))).toBe('propose 3');
    expect(errorOf(run('propose 2', { account: head }))).toBe('round 2 is open: its ballot is final');
    expect(errorOf(run('propose', { account: head, rounds: [closed, open] }))).toMatch(/no upcoming round/);
    expect(errorOf(run('propose 3', { account: head, rounds: [round(3, 100, 200, 4)] }))).toBe(
      'the ballot of round 3 is full',
    );
  });

  it('cancels rounds that have not closed', () => {
    expect(actionOf(run('cancel 2', { account: head }))).toEqual({ type: 'cancel', roundId: 2 });
    expect(actionOf(run('cancel', { account: head, current: 3 }))).toEqual({ type: 'cancel', roundId: 3 });
    expect(run('cancel', { account: head })).toEqual({ kind: 'usage', usage: 'cancel <n>' });
    expect(errorOf(run('cancel 1', { account: head }))).toBe('round 1 is already closed');
  });

  it('adds members', () => {
    expect(run('add member', { account: head })).toEqual({ kind: 'usage', usage: 'add member <address> <handle>' });
    expect(run(`add member ${guest}`, { account: head })).toMatchObject({ kind: 'usage' });
    expect(errorOf(run('add member 0x123 dana', { account: head }))).toBe('“0x123” is not an address');
    expect(errorOf(run(`add member ${ada} again`, { account: head }))).toBe('this account is already a member: ada');
    expect(errorOf(run(`add member ${guest} ${'x'.repeat(33)}`, { account: head }))).toBe(
      'a handle takes at most 32 bytes',
    );
    expect(actionOf(run(`add member ${guest} dana scully`, { account: head }))).toEqual({
      type: 'add member',
      account: '0x00000000000000000000000000000000000000D4',
      handle: 'dana scully',
    });
  });

  it('removes members by handle or address', () => {
    expect(actionOf(run('remove member ADA', { account: head }))).toEqual({
      type: 'remove member',
      account: ada,
      handle: 'ada',
    });
    expect(actionOf(run(`remove member ${grace.toLowerCase()}`, { account: head }))).toMatchObject({ handle: 'grace' });
    expect(errorOf(run('remove member nobody', { account: head }))).toBe('no member “nobody”');
    expect(run('remove member', { account: head })).toEqual({ kind: 'usage', usage: 'remove member <handle>' });

    const twins = { ...association, members: [...association.members, { account: guest, handle: 'Ada' }] };
    expect(errorOf(run('remove member ada', { account: head, association: twins }))).toMatch(/several members/);
  });
});

describe('wallet', () => {
  const targets = [
    { label: 'M4RT1N', address: head },
    { label: 'ada', address: ada },
  ];

  it('connects directly when there is one choice, and asks otherwise', () => {
    expect(errorOf(run('connect'))).toBe('no wallet found in this browser');
    expect(actionOf(run('connect', { targets: [{ label: 'MetaMask' }] }))).toEqual({ type: 'connect', target: 0 });
    expect(screenOf(run('connect', { targets }))).toBe('connect');
  });

  it('finds a target by name, position or address', () => {
    expect(actionOf(run('connect ADA', { targets }))).toEqual({ type: 'connect', target: 1 });
    expect(actionOf(run('connect 1', { targets }))).toEqual({ type: 'connect', target: 0 });
    expect(actionOf(run(`connect ${ada}`, { targets }))).toEqual({ type: 'connect', target: 1 });
    expect(errorOf(run('connect bob', { targets }))).toBe('nothing to connect to called “bob”');
  });

  it('disconnects only what is connected', () => {
    expect(errorOf(run('disconnect'))).toBe('no wallet is connected');
    expect(actionOf(run('disconnect', { account: ada }))).toEqual({ type: 'disconnect' });
  });
});

describe('the prompt', () => {
  it('explains a line before it is run', () => {
    expect(analyze('   ', context())).toBeNull();
    expect(analyze('frobnicate', context())).toEqual({
      kind: 'error',
      message: 'unknown command “frobnicate”',
      draft: undefined,
    });
    expect(analyze('rounds', context())).toMatchObject({ kind: 'screen', command: 'rounds' });
  });

  it('completes with what makes sense now', () => {
    expect(complete('', context())).toBe('');
    expect(complete('rou', context())).toBe('nds');
    expect(complete('round ', context())).toBe('3');
    expect(complete('BAL', context())).toBe('lots 3');
    expect(complete('xyz', context())).toBe('');
    expect(complete('rounds', context())).toBe('');
    // Nothing that the visitor could not do.
    expect(complete('pro', context({ account: ada }))).toBe('');
    expect(complete('pro', context({ account: head }))).toBe('pose 3');
    expect(complete('vo', context({ account: ada }))).toBe('te 2 ');
    expect(complete('vo', context({ account: guest }))).toBe('');
    expect(complete('rem', context({ account: head }))).toBe('ove member M4RT1N');
  });

  it('only offers what parses', () => {
    const everything = candidates(context({ account: head, targets: [{ label: 'a' }, { label: 'b' }] }));
    for (const candidate of everything) {
      expect(parse(candidate).ok, candidate).toBe(true);
    }
    expect(everything).toContain('cancel 2');
    expect(everything).toContain('connect a');
  });

  it('suggests the next step', () => {
    const commands = (overrides: Partial<Context>, screen: Parameters<typeof suggestions>[1]) =>
      suggestions(context(overrides), screen).map((suggestion) => suggestion.command);

    expect(commands({}, { name: 'round', id: 2 })).toEqual([
      'connect',
      'ballots 2',
      'rounds',
      'members',
      'whoami',
      'help',
    ]);
    expect(commands({ account: ada }, { name: 'ballots', id: 2 })[0]).toBe('round 2');
    expect(commands({ account: head }, { name: 'round', id: 3 })).toContain('propose 3');
    expect(commands({ account: ada }, { name: 'round', id: 3 })).not.toContain('propose 3');
    expect(commands({ account: head }, { name: 'rounds' })).toEqual(['new round', 'members', 'whoami', 'help']);
    expect(suggestions(context({ account: head }), { name: 'members' })[0]).toEqual({
      command: 'add member ',
      mode: 'write',
    });
  });
});

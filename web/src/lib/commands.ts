// The command language of the interface: every screen and every operation is a line of text.

export type Command =
  | { name: 'home' }
  | { name: 'rounds' }
  | { name: 'round'; id?: number; proposal?: string }
  | { name: 'ballots'; id?: number }
  | { name: 'members' }
  | { name: 'whoami' }
  | { name: 'help' }
  | { name: 'connect'; target?: string }
  | { name: 'disconnect' }
  | { name: 'vote'; id?: number; entries: string[] }
  | { name: 'new round' }
  | { name: 'propose'; id?: number }
  | { name: 'cancel'; id?: number }
  | { name: 'add member'; account?: string; handle?: string }
  | { name: 'remove member'; target?: string };

export type Parsed = { ok: true; command: Command } | { ok: false; error: string };

export type Audience = 'everyone' | 'members' | 'head';

/** The reference shown by `help`. `start` is what picking an entry writes in the prompt. */
export const catalog: readonly { usage: string; start: string; about: string; audience: Audience }[] = [
  { usage: 'rounds', start: 'rounds', about: 'every funding round', audience: 'everyone' },
  { usage: 'round <n> [letter]', start: 'round ', about: 'a round, with one proposal unfolded', audience: 'everyone' },
  { usage: 'ballots <n>', start: 'ballots ', about: 'who voted what', audience: 'everyone' },
  { usage: 'members', start: 'members', about: 'who can vote', audience: 'everyone' },
  { usage: 'whoami', start: 'whoami', about: 'your account, the contract, the network', audience: 'everyone' },
  { usage: 'connect', start: 'connect', about: 'use a wallet', audience: 'everyone' },
  { usage: 'disconnect', start: 'disconnect', about: 'forget the wallet', audience: 'everyone' },
  { usage: 'vote [n] A=6 C=8', start: 'vote ', about: 'cast or replace your ballot', audience: 'members' },
  { usage: 'vote [n] none', start: 'vote ', about: 'withdraw your votes', audience: 'members' },
  { usage: 'new round', start: 'new round', about: 'schedule a round', audience: 'head' },
  { usage: 'propose <n>', start: 'propose ', about: 'add a proposal to an upcoming round', audience: 'head' },
  { usage: 'cancel <n>', start: 'cancel ', about: 'cancel a round that has not closed', audience: 'head' },
  { usage: 'add member <address> <handle>', start: 'add member ', about: 'let an account vote', audience: 'head' },
  { usage: 'remove member <handle>', start: 'remove member ', about: 'withdraw the right to vote', audience: 'head' },
];

const ok = (command: Command): Parsed => ({ ok: true, command });
const no = (error: string): Parsed => ({ ok: false, error });

const isNumber = (token: string): boolean => /^\d{1,9}$/.test(token);
const isLetters = (token: string): boolean => /^[a-z]{1,2}$/i.test(token);

export function parse(text: string): Parsed {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  const [head, ...rest] = tokens;
  if (head === undefined) return ok({ name: 'home' });

  const bare = (command: Command): Parsed => (rest.length === 0 ? ok(command) : no(`“${head}” takes no argument`));

  switch (head.toLowerCase()) {
    case 'home':
      return bare({ name: 'home' });
    case 'rounds':
      return bare({ name: 'rounds' });
    case 'members':
      return bare({ name: 'members' });
    case 'whoami':
      return bare({ name: 'whoami' });
    case 'help':
    case '?':
      return bare({ name: 'help' });
    case 'disconnect':
      return bare({ name: 'disconnect' });

    case 'round': {
      const [first, second, ...extra] = rest;
      if (extra.length > 0) return no('usage: round <n> [letter]');
      if (first === undefined) return ok({ name: 'round' });
      if (isNumber(first)) {
        if (second === undefined) return ok({ name: 'round', id: Number(first) });
        return isLetters(second)
          ? ok({ name: 'round', id: Number(first), proposal: second.toUpperCase() })
          : no(`“${second}” is not a proposal letter`);
      }
      if (isLetters(first) && second === undefined) return ok({ name: 'round', proposal: first.toUpperCase() });
      return no('usage: round <n> [letter]');
    }

    case 'ballots':
    case 'propose':
    case 'cancel': {
      const name = head.toLowerCase() as 'ballots' | 'propose' | 'cancel';
      // `cancel round 2` reads naturally and means `cancel 2`.
      const args = name === 'cancel' && rest[0]?.toLowerCase() === 'round' ? rest.slice(1) : rest;
      const [id, ...extra] = args;
      if (id === undefined) return ok({ name });
      if (extra.length === 0 && isNumber(id)) return ok({ name, id: Number(id) });
      return no(`usage: ${name} <n>`);
    }

    case 'connect':
      return ok(rest.length > 0 ? { name: 'connect', target: rest.join(' ') } : { name: 'connect' });

    case 'vote': {
      const [first, ...entries] = rest;
      if (first !== undefined && isNumber(first)) return ok({ name: 'vote', id: Number(first), entries });
      return ok({ name: 'vote', entries: rest });
    }

    case 'new':
      if (rest.length === 1 && rest[0]!.toLowerCase() === 'round') return ok({ name: 'new round' });
      return no('usage: new round');

    case 'add': {
      if (rest[0]?.toLowerCase() !== 'member') return no('usage: add member <address> <handle>');
      const [, account, ...handle] = rest;
      return ok({ name: 'add member', account, handle: handle.length > 0 ? handle.join(' ') : undefined });
    }

    case 'remove': {
      if (rest[0]?.toLowerCase() !== 'member') return no('usage: remove member <handle>');
      const target = rest.slice(1).join(' ');
      return ok({ name: 'remove member', target: target || undefined });
    }

    default:
      return no(`unknown command “${head}”`);
  }
}

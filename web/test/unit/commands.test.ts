import { describe, expect, it } from 'vitest';
import { catalog, parse, type Command } from '../../src/lib/commands';
import { commandFromHash, hashFromCommand } from '../../src/lib/router';

const command = (text: string): Command => {
  const parsed = parse(text);
  if (!parsed.ok) throw new Error(`“${text}” did not parse: ${parsed.error}`);
  return parsed.command;
};
const errorOf = (text: string): string | null => {
  const parsed = parse(text);
  return parsed.ok ? null : parsed.error;
};

describe('parse', () => {
  it('reads the screens', () => {
    expect(command('')).toEqual({ name: 'home' });
    expect(command('  rounds  ')).toEqual({ name: 'rounds' });
    expect(command('MEMBERS')).toEqual({ name: 'members' });
    expect(command('whoami')).toEqual({ name: 'whoami' });
    expect(command('help')).toEqual({ name: 'help' });
    expect(command('?')).toEqual({ name: 'help' });
    expect(command('new round')).toEqual({ name: 'new round' });
  });

  it('reads a round and the proposal to unfold', () => {
    expect(command('round')).toEqual({ name: 'round' });
    expect(command('round 2')).toEqual({ name: 'round', id: 2 });
    expect(command('round 2 b')).toEqual({ name: 'round', id: 2, proposal: 'B' });
    expect(command('round B')).toEqual({ name: 'round', proposal: 'B' });
    expect(errorOf('round 2 7')).toMatch(/not a proposal letter/);
    expect(errorOf('round 2 B extra')).toMatch(/usage/);
  });

  it('reads the commands that take a round', () => {
    expect(command('ballots')).toEqual({ name: 'ballots' });
    expect(command('ballots 3')).toEqual({ name: 'ballots', id: 3 });
    expect(command('propose 3')).toEqual({ name: 'propose', id: 3 });
    expect(command('cancel 3')).toEqual({ name: 'cancel', id: 3 });
    expect(command('cancel round 3')).toEqual({ name: 'cancel', id: 3 });
    expect(errorOf('ballots three')).toMatch(/usage: ballots/);
  });

  it('reads a vote, with or without its round', () => {
    expect(command('vote 2 A=6 C=8')).toEqual({ name: 'vote', id: 2, entries: ['A=6', 'C=8'] });
    expect(command('vote A=6')).toEqual({ name: 'vote', entries: ['A=6'] });
    expect(command('vote 2 none')).toEqual({ name: 'vote', id: 2, entries: ['none'] });
    expect(command('vote')).toEqual({ name: 'vote', entries: [] });
  });

  it('reads membership changes, keeping the case of handles', () => {
    expect(command('add member 0xAbC ada lovelace')).toEqual({
      name: 'add member',
      account: '0xAbC',
      handle: 'ada lovelace',
    });
    expect(command('add member')).toEqual({ name: 'add member', account: undefined, handle: undefined });
    expect(command('remove member M4RT1N')).toEqual({ name: 'remove member', target: 'M4RT1N' });
    expect(command('remove member')).toEqual({ name: 'remove member', target: undefined });
    expect(errorOf('add ada')).toMatch(/usage: add member/);
    expect(errorOf('remove ada')).toMatch(/usage: remove member/);
  });

  it('reads wallet commands', () => {
    expect(command('connect')).toEqual({ name: 'connect' });
    expect(command('connect ada')).toEqual({ name: 'connect', target: 'ada' });
    expect(command('disconnect')).toEqual({ name: 'disconnect' });
  });

  it('refuses what it does not know', () => {
    expect(errorOf('sudo rm -rf')).toBe('unknown command “sudo”');
    expect(errorOf('rounds now')).toBe('“rounds” takes no argument');
    expect(errorOf('new')).toBe('usage: new round');
  });

  it('understands the start of every entry of the reference', () => {
    for (const entry of catalog) {
      expect(parse(entry.start).ok, entry.usage).toBe(true);
    }
  });
});

describe('addresses of screens', () => {
  it('turns a command into a path and back', () => {
    for (const text of ['rounds', 'round 2', 'round 2 B', 'ballots 3', 'new round', 'propose 3']) {
      expect(commandFromHash(hashFromCommand(text))).toBe(text);
    }
    expect(hashFromCommand('round 2 B')).toBe('#/round/2/B');
    expect(commandFromHash('')).toBe('');
    expect(commandFromHash('#/')).toBe('');
  });

  it('survives characters that need escaping', () => {
    expect(commandFromHash(hashFromCommand('connect a/b c%d'))).toBe('connect a/b c%d');
    expect(commandFromHash('#/round/%E0%A4%A')).toBe('round %E0%A4%A');
  });
});

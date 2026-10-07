import { describe, expect, it } from 'vitest';
import {
  blank,
  ceiling,
  cost,
  formatEntries,
  indexOfLetter,
  letter,
  parseEntries,
  sameBallot,
} from '../../src/lib/ballot';

describe('letters', () => {
  it('labels proposals A, B, … Z, AA, AB', () => {
    expect([0, 1, 25, 26, 27, 31].map(letter)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'AF']);
  });

  it('reads labels back, whatever the case', () => {
    for (let index = 0; index < 64; index++) {
      expect(indexOfLetter(letter(index))).toBe(index);
      expect(indexOfLetter(letter(index).toLowerCase())).toBe(index);
    }
  });

  it('rejects what is not a label', () => {
    expect(indexOfLetter('')).toBeNull();
    expect(indexOfLetter('A1')).toBeNull();
    expect(indexOfLetter('é')).toBeNull();
  });
});

describe('cost', () => {
  it('charges the square of the votes', () => {
    expect(cost([])).toBe(0);
    expect(cost([10, 0, 0])).toBe(100);
    expect(cost([6, 8])).toBe(100);
    expect(cost([3, 4, 5])).toBe(50);
  });

  it('finds how far one proposal can go within the budget', () => {
    expect(ceiling([0, 0, 0], 0, 100)).toBe(10);
    expect(ceiling([6, 0, 0], 1, 100)).toBe(8);
    expect(ceiling([6, 8, 0], 2, 100)).toBe(0);
    // The votes already on the proposal itself do not count against it.
    expect(ceiling([6, 8, 0], 0, 100)).toBe(6);
    // An over-spent ballot leaves nothing.
    expect(ceiling([10, 5, 0], 2, 100)).toBe(0);
  });
});

describe('ballots as text', () => {
  it('writes the proposals that got votes', () => {
    expect(formatEntries([6, 0, 8])).toBe('A=6 C=8');
    expect(formatEntries([0, 0, 0])).toBe('none');
  });

  it('reads what it writes', () => {
    for (const votes of [
      [6, 0, 8],
      [0, 0, 0],
      [1, 2, 3],
      [0, 10, 0],
    ]) {
      expect(parseEntries(formatEntries(votes).split(' '), 3)).toEqual({ ok: true, votes });
    }
  });

  it('accepts lower case and colons', () => {
    expect(parseEntries(['a:6', 'c=8'], 3)).toEqual({ ok: true, votes: [6, 0, 8] });
  });

  it('explains what it cannot read', () => {
    const errorOf = (tokens: string[]) => {
      const parsed = parseEntries(tokens, 3);
      return parsed.ok ? null : parsed.error;
    };
    expect(errorOf([])).toMatch(/A=6/);
    expect(errorOf(['A'])).toMatch(/can’t read/);
    expect(errorOf(['A=x'])).toMatch(/can’t read/);
    expect(errorOf(['A=-1'])).toMatch(/can’t read/);
    expect(errorOf(['D=1'])).toBe('no proposal D');
    expect(errorOf(['A=1', 'a=2'])).toBe('A appears twice');
    expect(errorOf(['none', 'A=1'])).toMatch(/can’t read/);
  });
});

describe('comparison', () => {
  it('tells equal ballots from different ones', () => {
    expect(sameBallot([1, 2], [1, 2])).toBe(true);
    expect(sameBallot([1, 2], [2, 1])).toBe(false);
    expect(sameBallot([1, 2], [1, 2, 0])).toBe(false);
    expect(blank(3)).toEqual([0, 0, 0]);
  });
});

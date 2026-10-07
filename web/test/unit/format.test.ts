import { describe, expect, it } from 'vitest';
import { stateOf, totalVotes } from '../../src/lib/dao';
import { byteLength, formatDuration, fromLocalInput, percent, shortAddress, toLocalInput } from '../../src/lib/format';
import { colorOf, inkOn } from '../../src/lib/palette';

describe('durations', () => {
  it('keeps the two units that matter', () => {
    expect(formatDuration(0)).toBe('0s');
    expect(formatDuration(59)).toBe('59s');
    expect(formatDuration(249)).toBe('4m 09s');
    expect(formatDuration(3 * 3600 + 12 * 60 + 40)).toBe('3h 12m');
    expect(formatDuration(10 * 86_400 + 21 * 3600 + 59 * 60)).toBe('10d 21h');
    expect(formatDuration(-5)).toBe('0s');
  });
});

describe('numbers and text', () => {
  it('shares a total in whole percents', () => {
    expect(percent(22, 90)).toBe(24);
    expect(percent(0, 90)).toBe(0);
    expect(percent(5, 0)).toBe(0);
  });

  it('counts bytes, as the contract does', () => {
    expect(byteLength('ada')).toBe(3);
    expect(byteLength('Zoë')).toBe(4);
    expect(byteLength('研究')).toBe(6);
  });

  it('shortens an address without losing its ends', () => {
    expect(shortAddress('0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266')).toBe('0xf39F…2266');
  });

  it('takes a date to a form field and back', () => {
    const timestamp = Math.floor(new Date(2026, 9, 7, 9, 0).getTime() / 1000);
    expect(toLocalInput(timestamp)).toBe('2026-10-07T09:00');
    expect(fromLocalInput(toLocalInput(timestamp))).toBe(timestamp);
    expect(fromLocalInput('')).toBeNull();
  });
});

describe('the state of a round', () => {
  const round = { start: 100, end: 200, cancelled: false };

  it('follows the clock, like the contract', () => {
    expect(stateOf(round, 99)).toBe('pending');
    expect(stateOf(round, 100)).toBe('active');
    expect(stateOf(round, 199)).toBe('active');
    expect(stateOf(round, 200)).toBe('closed');
  });

  it('stays cancelled whatever the time', () => {
    for (const now of [0, 150, 500]) {
      expect(stateOf({ ...round, cancelled: true }, now)).toBe('cancelled');
    }
  });

  it('adds up the votes of the proposals', () => {
    const proposals = [3, 0, 9].map((votes, index) => ({ index, title: '', body: '', votes }));
    expect(totalVotes({ proposals })).toBe(12);
  });
});

describe('colours of proposals', () => {
  it('gives each of the first eight its own hue, and the rest a neutral one', () => {
    const hues = Array.from({ length: 8 }, (_, index) => colorOf(index));
    expect(new Set(hues).size).toBe(8);
    expect(colorOf(8)).toBe(colorOf(31));
    expect(hues).not.toContain(colorOf(8));
  });

  it('writes on a fill in the ink that reads best', () => {
    expect(inkOn('#ffffff')).toBe('#0b0b0b');
    expect(inkOn('#0b0b0b')).toBe('#ffffff');
    for (let index = 0; index < 9; index++) {
      expect(['#0b0b0b', '#ffffff']).toContain(inkOn(colorOf(index)));
    }
  });
});

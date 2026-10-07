// Quadratic voting arithmetic and the textual form of a ballot: `A=6 C=8`.

/** Label of the proposal at `index` on a ballot: A, B, … Z, AA, AB, … */
export function letter(index: number): string {
  let label = '';
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    label = String.fromCharCode(65 + (n % 26)) + label;
  }
  return label;
}

/** Inverse of `letter`, case-insensitive. */
export function indexOfLetter(label: string): number | null {
  if (!/^[a-z]+$/i.test(label)) return null;
  let n = 0;
  for (const character of label.toUpperCase()) {
    n = n * 26 + (character.charCodeAt(0) - 64);
  }
  return n - 1;
}

/** Credits a ballot costs: every proposal costs the square of the votes it gets. */
export function cost(votes: readonly number[]): number {
  return votes.reduce((sum, value) => sum + value * value, 0);
}

/** Most votes proposal `index` can get before the ballot costs more than `credits`. */
export function ceiling(votes: readonly number[], index: number, credits: number): number {
  const others = cost(votes) - (votes[index] ?? 0) ** 2;
  return Math.floor(Math.sqrt(Math.max(0, credits - others)));
}

export function blank(count: number): number[] {
  return Array<number>(count).fill(0);
}

export function sameBallot(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

/** `A=6 C=8`, or `none` for a blank ballot. */
export function formatEntries(votes: readonly number[]): string {
  const entries = votes.flatMap((value, index) => (value > 0 ? [`${letter(index)}=${value}`] : []));
  return entries.length > 0 ? entries.join(' ') : 'none';
}

export type ParsedEntries = { ok: true; votes: number[] } | { ok: false; error: string };

/** Reads `A=6 C=8` (or `none`) into one entry per proposal of a round with `count` proposals. */
export function parseEntries(tokens: readonly string[], count: number): ParsedEntries {
  if (tokens.length === 0) return { ok: false, error: 'give votes like A=6 C=8, or none' };
  if (tokens.length === 1 && tokens[0]!.toLowerCase() === 'none') return { ok: true, votes: blank(count) };

  const votes = blank(count);
  const seen = new Set<number>();
  for (const token of tokens) {
    const match = /^([a-z]+)[=:](\d{1,3})$/i.exec(token);
    if (!match) return { ok: false, error: `can’t read “${token}”, expected something like A=6` };
    const index = indexOfLetter(match[1]!);
    if (index === null || index >= count) return { ok: false, error: `no proposal ${match[1]!.toUpperCase()}` };
    if (seen.has(index)) return { ok: false, error: `${letter(index)} appears twice` };
    seen.add(index);
    votes[index] = Number(match[2]);
  }
  return { ok: true, votes };
}

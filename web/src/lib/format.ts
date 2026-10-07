import type { Address } from 'viem';

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
const dayWithYear = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const moment = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** `3 Oct → 17 Oct 2026`, with the year on both sides when they differ. */
export function formatWindow(start: number, end: number): string {
  const from = new Date(start * 1000);
  const to = new Date(end * 1000);
  const first = from.getFullYear() === to.getFullYear() ? day.format(from) : dayWithYear.format(from);
  return `${first} → ${dayWithYear.format(to)}`;
}

export function formatMoment(timestamp: number): string {
  return moment.format(new Date(timestamp * 1000));
}

/** The two most significant units of a duration: `10d 21h`, `3h 12m`, `4m 09s`, `12s`. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const days = Math.floor(s / 86_400);
  const hours = Math.floor((s % 86_400) / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${String(s % 60).padStart(2, '0')}s`;
  return `${s}s`;
}

/** Share of `part` in `total` as a whole percentage, 0 when there is nothing to share. */
export function percent(part: number, total: number): number {
  return total === 0 ? 0 : Math.round((part / total) * 100);
}

/** Value of a `datetime-local` input for a timestamp, in the local time zone. */
export function toLocalInput(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/** Timestamp of the value of a `datetime-local` input, or null when it is not a date. */
export function fromLocalInput(value: string): number | null {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? null : Math.floor(time / 1000);
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

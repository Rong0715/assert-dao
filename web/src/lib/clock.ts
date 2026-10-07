import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let seconds = Math.floor(Date.now() / 1000);
let timer: ReturnType<typeof setInterval> | undefined;

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    seconds = Math.floor(Date.now() / 1000);
    listeners.forEach((notify) => {
      notify();
    });
  }, 1000);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

/** The current time in seconds, ticking: rounds open and close on screen without a reload. */
export function useNow(): number {
  return useSyncExternalStore(subscribe, () => seconds);
}

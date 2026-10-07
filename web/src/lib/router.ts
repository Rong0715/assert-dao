// The address bar holds the command of the screen on display: `#/round/2/B` is `round 2 B`. Links, the back
// button and bookmarks all work on commands.
import { useSyncExternalStore } from 'react';

export function commandFromHash(hash: string): string {
  return hash
    .replace(/^#\/?/, '')
    .split('/')
    .filter(Boolean)
    .map((part) => {
      try {
        return decodeURIComponent(part);
      } catch {
        return part;
      }
    })
    .join(' ');
}

export function hashFromCommand(command: string): string {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  return `#/${parts.map(encodeURIComponent).join('/')}`;
}

function subscribe(listener: () => void): () => void {
  window.addEventListener('hashchange', listener);
  return () => {
    window.removeEventListener('hashchange', listener);
  };
}

/** The command in the address bar. */
export function useRoute(): string {
  return useSyncExternalStore(subscribe, () => commandFromHash(window.location.hash));
}

export function navigate(command: string, { replace = false } = {}): void {
  const hash = hashFromCommand(command);
  if (hash === window.location.hash) return;
  if (replace) {
    window.history.replaceState(null, '', hash);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    window.location.hash = hash;
  }
}

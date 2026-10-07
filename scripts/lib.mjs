// Helpers shared by the project scripts.
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
export const contracts = fileURLToPath(new URL('../contracts', import.meta.url));

/** Runs a command and returns what it printed. Its diagnostics go straight to the terminal. */
export function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: contracts,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

export function fail(message) {
  console.error(`\n✗ ${message}\n`);
  process.exit(1);
}

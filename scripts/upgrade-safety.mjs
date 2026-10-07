#!/usr/bin/env node
// Validates that the contract is safe to deploy behind a proxy and, given the build of a released version, that
// its storage is compatible with it.
//
//   node scripts/upgrade-safety.mjs                    check the contract on its own
//   node scripts/upgrade-safety.mjs <build-info dir>   also check it as an upgrade of that build
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { contracts, fail, root, run } from './lib.mjs';

const reference = process.argv[2] && resolve(process.argv[2]);
if (reference && !existsSync(reference)) fail(`No build-info directory at ${reference}`);

// The validator wants the build-info of exactly one full compilation, and directories with distinct names.
const work = mkdtempSync(join(tmpdir(), 'assert-dao-upgrade-'));
try {
  run(
    'forge',
    [
      'build',
      '--force',
      '--skip',
      './test/**',
      './script/**',
      '--out',
      join(work, 'out'),
      '--cache-path',
      join(work, 'cache'),
    ],
    { stdio: 'ignore' },
  );
  const args = ['validate', join(work, 'out/build-info'), '--contract', 'AssertDAO'];
  if (reference) {
    cpSync(reference, join(work, 'released'), { recursive: true });
    args.push('--reference', 'released:AssertDAO', '--referenceBuildInfoDirs', join(work, 'released'));
  }
  run(join(root, 'node_modules/.bin/openzeppelin-upgrades-core'), args, { stdio: 'inherit' });
} catch {
  fail('The contract is not safe to upgrade to.');
} finally {
  rmSync(work, { recursive: true, force: true });
}

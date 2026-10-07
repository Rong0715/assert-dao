#!/usr/bin/env node
// Packages what a release publishes: everything needed to deploy, verify and later upgrade the contract.
//
//   node scripts/package.mjs           write release/
//
//   AssertDAO.abi.json        interface
//   AssertDAO.bin             creation bytecode: what a deployment must reproduce bit for bit
//   AssertDAO.metadata.json   compiler settings and source hashes, for source verification
//   AssertDAO.storage.json    storage layout
//   build-info.tar.gz         compiler input and output: the reference of the next upgrade-safety check
//   docs.tar.gz               reference generated from the NatSpec comments
//   SHA256SUMS                checksums of the above
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { contracts, root, run } from './lib.mjs';

const out = join(root, 'release');
const work = join(out, '.work');
rmSync(out, { recursive: true, force: true });
mkdirSync(work, { recursive: true });

// A clean build of the sources alone, exactly as the upgrade-safety check builds them.
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
  {
    stdio: ['ignore', 'ignore', 'inherit'],
  },
);
const artifact = JSON.parse(readFileSync(join(work, 'out/AssertDAO.sol/AssertDAO.json'), 'utf8'));
writeFileSync(join(out, 'AssertDAO.abi.json'), `${JSON.stringify(artifact.abi, null, 2)}\n`);
writeFileSync(join(out, 'AssertDAO.bin'), artifact.bytecode.object);
writeFileSync(join(out, 'AssertDAO.metadata.json'), `${JSON.stringify(artifact.metadata, null, 2)}\n`);
cpSync(join(contracts, 'storage/AssertDAO.json'), join(out, 'AssertDAO.storage.json'));
run('tar', ['-czf', join(out, 'build-info.tar.gz'), '-C', join(work, 'out'), 'build-info']);

run('forge', ['doc', '--out', join(work, 'docs')], { stdio: ['ignore', 'ignore', 'inherit'] });
run('tar', ['-czf', join(out, 'docs.tar.gz'), '-C', work, 'docs']);
rmSync(work, { recursive: true, force: true });

const files = readdirSync(out).sort();
const sums = files.map(
  (file) =>
    `${createHash('sha256')
      .update(readFileSync(join(out, file)))
      .digest('hex')}  ${file}`,
);
writeFileSync(join(out, 'SHA256SUMS'), `${sums.join('\n')}\n`);
console.log(sums.join('\n'));

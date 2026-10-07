#!/usr/bin/env node
// Snapshots the storage layout of the upgradeable contract, so that any change to it shows up in review.
//
//   node scripts/storage-layout.mjs           write contracts/storage/AssertDAO.json
//   node scripts/storage-layout.mjs --check   fail if the committed snapshot is out of date
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { contracts, fail, root, run } from './lib.mjs';

const target = join(contracts, 'storage/AssertDAO.json');

// Type identifiers embed compiler-internal numbers that change with unrelated edits: `t_struct(Round)1234_storage`.
const stable = (identifier) => identifier.replace(/\)\d+/g, ')');

const layout = JSON.parse(run('forge', ['inspect', 'AssertDAO', 'storageLayout', '--json']));

const variable = ({ label, slot, offset, type }) => ({ label, slot, offset, type: stable(type) });
const snapshot = {
  storage: layout.storage.map(variable),
  types: Object.fromEntries(
    Object.entries(layout.types ?? {})
      .map(([identifier, type]) => [
        stable(identifier),
        {
          label: type.label,
          encoding: type.encoding,
          numberOfBytes: type.numberOfBytes,
          ...(type.key && { key: stable(type.key) }),
          ...(type.value && { value: stable(type.value) }),
          ...(type.base && { base: stable(type.base) }),
          ...(type.members && { members: type.members.map(variable) }),
        },
      ])
      .sort(([a], [b]) => a.localeCompare(b)),
  ),
};
const source = `${JSON.stringify(snapshot, null, 2)}\n`;

if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    // A missing file is out of date.
  }
  if (current !== source) {
    fail(
      `${relative(root, target)} is out of date: the storage layout changed.\n` +
        `  State of an upgradeable contract is append-only. If the change is intended and safe,\n` +
        `  run \`npm run storage\` and commit the result so that it is reviewed.`,
    );
  }
  console.log(`✓ ${relative(root, target)} matches the contract`);
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, source);
  console.log(`✓ wrote ${relative(root, target)}`);
}

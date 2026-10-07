#!/usr/bin/env node
// Measures how much of the contracts the test suite executes, and fails below the given thresholds.
//
//   node scripts/coverage.mjs --lines 100 --branches 100
import { appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contracts, fail, run } from './lib.mjs';

const threshold = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at === -1 ? 0 : Number(process.argv[at + 1]);
};

// Coverage is measured on a build of its own: instrumentation changes the bytecode and the gas it uses. The gas
// tests are left out, or they would overwrite the snapshot with figures of that build.
run(
  'forge',
  [
    'coverage',
    '--no-match-coverage',
    '(script|test)/',
    '--no-match-contract',
    'GasTest',
    '--report',
    'lcov',
    '--report-file',
    'lcov.info',
  ],
  { stdio: ['ignore', 'ignore', 'inherit'] },
);

const totals = { lines: [0, 0], branches: [0, 0], functions: [0, 0] };
const keys = {
  LF: ['lines', 1],
  LH: ['lines', 0],
  BRF: ['branches', 1],
  BRH: ['branches', 0],
  FNF: ['functions', 1],
  FNH: ['functions', 0],
};
for (const line of readFileSync(join(contracts, 'lcov.info'), 'utf8').split('\n')) {
  const [key, value] = line.split(':');
  if (key in keys) totals[keys[key][0]][keys[key][1]] += Number(value);
}

const percent = ([hit, found]) => (found === 0 ? 100 : (hit / found) * 100);
const rows = Object.entries(totals).map(([name, [hit, found]]) => ({
  name,
  hit,
  found,
  percent: percent([hit, found]),
  minimum: threshold(name),
}));

for (const row of rows) {
  const mark = row.percent >= row.minimum ? '✓' : '✗';
  console.log(`${mark} ${row.name.padEnd(9)} ${row.percent.toFixed(2).padStart(6)}%  ${row.hit}/${row.found}`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  const table = ['| | covered | of | % |', '| --- | ---: | ---: | ---: |']
    .concat(rows.map((row) => `| ${row.name} | ${row.hit} | ${row.found} | ${row.percent.toFixed(2)} |`))
    .join('\n');
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Coverage of the contracts\n\n${table}\n`);
}

const short = rows.filter((row) => row.percent < row.minimum);
if (short.length > 0) {
  fail(
    short
      .map((row) => `${row.name} coverage is ${row.percent.toFixed(2)}%, below the required ${row.minimum}%`)
      .join('\n  '),
  );
}

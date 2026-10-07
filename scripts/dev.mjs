#!/usr/bin/env node
// One command to work on the project: a local chain, the DAO deployed on it by the same script as in production,
// sample data, and the web app. Stop it with ctrl-c.
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contracts, fail, root, run } from './lib.mjs';
import { ACCOUNTS, seed } from './seed.mjs';

const RPC = 'http://127.0.0.1:8545';
const CHAIN_ID = 31337;
// First account of the local chain, the head named in contracts/config/31337.json.
const HEAD = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266';
const DAY = 86_400;

const children = [];
let stopping = false;

function start(name, command, args, options = {}) {
  const child = spawn(command, args, { stdio: 'inherit', ...options });
  child.on('exit', (code) => {
    if (stopping) return;
    console.error(`\n✗ ${name} stopped${code === null ? '' : ` with code ${code}`}`);
    stop(1);
  });
  children.push(child);
  return child;
}

function stop(code = 0) {
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(code);
}

process.on('SIGINT', () => stop());
process.on('SIGTERM', () => stop());

async function rpc(method, params = []) {
  const response = await fetch(RPC, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const { result, error } = await response.json();
  if (error) throw new Error(error.message);
  return result;
}

async function chainId() {
  try {
    return Number(await rpc('eth_chainId'));
  } catch {
    return undefined;
  }
}

/** A chain left running by an earlier session, with the DAO on it, is used as it is. */
async function reusable() {
  const record = join(contracts, 'deployments', `${CHAIN_ID}.json`);
  if ((await chainId()) !== CHAIN_ID || !existsSync(record)) return false;
  const { proxy } = JSON.parse(readFileSync(record, 'utf8'));
  return (await rpc('eth_getCode', [proxy, 'latest'])) !== '0x';
}

if (await reusable()) {
  console.log(`● chain   reusing the local chain at ${RPC}`);
} else {
  if ((await chainId()) !== undefined) fail(`Something else answers at ${RPC}. Stop it and try again.`);

  // The chain starts in the past, so that the sample data can have a history.
  const genesis = Math.floor(Date.now() / 1000) - 200 * DAY;
  start('anvil', 'anvil', [
    '--port',
    '8545',
    '--chain-id',
    String(CHAIN_ID),
    '--accounts',
    String(ACCOUNTS),
    '--timestamp',
    String(genesis),
    '--silent',
  ]);
  for (let attempt = 0; (await chainId()) === undefined; attempt++) {
    if (attempt > 100) fail('The local chain did not start.');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  console.log(`● chain   ${RPC}`);

  run('forge', ['build'], { stdio: ['ignore', 'ignore', 'inherit'] });
  run('forge', ['script', 'script/Deploy.s.sol', '--rpc-url', RPC, '--broadcast', '--unlocked', '--sender', HEAD], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  const { proxy, members, rounds } = await seed(RPC);
  console.log(`● dao     ${proxy}  ${members} members, ${rounds} rounds`);
}

start('web', join(root, 'node_modules/.bin/vite'), [], { cwd: join(root, 'web') });

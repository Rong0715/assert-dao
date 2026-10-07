#!/usr/bin/env node
// Watches the deployed DAO.
//
// Two things are checked on every run, for every chain that has a record in contracts/deployments:
//
//   drift    the chain must agree with the repository: the proxy runs the recorded implementation, reports the
//            recorded version, and answers to the configured head. A difference means an upgrade or a transfer
//            of the head role that the repository does not know about, and fails the run.
//   events   what happened since the last run is reported: membership, rounds, proposals, ballots.
//
//   node ops/monitor.mjs                     every deployed chain but the local one
//   node ops/monitor.mjs --chain 84532       one chain, by identifier
//   node ops/monitor.mjs --check             drift only, no events
//   node ops/monitor.mjs --cursor <file>     remember the last block seen, and resume from it
//
// Environment: BASE_RPC_URL, BASE_SEPOLIA_RPC_URL (endpoints, the public ones by default), MONITOR_WEBHOOK_URL
// (a Slack-compatible webhook that receives the report when there is something to say).
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPublicClient, getAddress, http, isAddressEqual, parseEventLogs, zeroAddress } from 'viem';
import { anvil, base, baseSepolia } from 'viem/chains';
import { assertDaoAbi } from '../web/src/abi/AssertDAO.ts';

const contracts = fileURLToPath(new URL('../contracts', import.meta.url));

const chains = {
  [anvil.id]: { chain: anvil, name: 'local', rpcUrl: 'http://127.0.0.1:8545' },
  [baseSepolia.id]: { chain: baseSepolia, name: 'Base Sepolia', rpcUrl: process.env.BASE_SEPOLIA_RPC_URL },
  [base.id]: { chain: base, name: 'Base', rpcUrl: process.env.BASE_RPC_URL },
};

// ERC-1967: where a proxy keeps the address of its implementation.
const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
// Public endpoints refuse wide log queries, and a monitor that was off for a month should not replay it all.
const WINDOW = 5_000n;
const MAX_LOOKBACK = 500_000n;

function parseArguments(argv) {
  const options = { chains: [], check: false, cursor: undefined };
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--chain') options.chains.push(Number(argv[++index]));
    else if (argument === '--cursor') options.cursor = argv[++index];
    else throw new Error(`unknown argument ${argument}`);
  }
  return options;
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const short = (address) => `${address.slice(0, 6)}…${address.slice(-4)}`;

/** One line per event, in the words of the association. */
function describe({ eventName, args }, handleOf) {
  const who = (address) => handleOf.get(address.toLowerCase()) ?? short(address);
  switch (eventName) {
    case 'Upgraded':
      return ['critical', `implementation changed to ${args.implementation}`];
    case 'OwnershipTransferStarted':
      return ['critical', `head role offered to ${args.newOwner}`];
    case 'OwnershipTransferred':
      return ['critical', `head is now ${args.newOwner} (was ${args.previousOwner})`];
    case 'MemberAdded':
      return ['notice', `member added: ${args.handle} (${args.account})`];
    case 'MemberRemoved':
      return ['notice', `member removed: ${who(args.account)}`];
    case 'RoundCreated':
      return ['notice', `round ${args.roundId} created: ${args.title}`];
    case 'RoundCancelled':
      return ['notice', `round ${args.roundId} cancelled`];
    case 'ProposalAdded':
      return ['notice', `round ${args.roundId}: proposal added: ${args.title}`];
    case 'VoteCast':
      return ['activity', `round ${args.roundId}: ballot from ${who(args.voter)}`];
    default:
      return undefined;
  }
}

async function inspect(chainId, options, cursors) {
  const known = chains[chainId];
  if (!known) throw new Error(`chain ${chainId} is not supported`);
  const record = readJson(join(contracts, 'deployments', `${chainId}.json`));
  const config = readJson(join(contracts, 'config', `${chainId}.json`));
  const client = createPublicClient({ chain: known.chain, transport: http(known.rpcUrl) });
  const dao = { address: record.proxy, abi: assertDaoAbi };
  const report = { name: known.name, chainId, proxy: record.proxy, drift: [], events: [] };

  // Drift: the chain against the repository.
  const code = await client.getCode({ address: record.proxy });
  if (!code || code === '0x') {
    report.drift.push(`no contract at the recorded address ${record.proxy}`);
    return report;
  }
  const [slot, version, head, pendingHead, members] = await Promise.all([
    client.getStorageAt({ address: record.proxy, slot: IMPLEMENTATION_SLOT }),
    client.readContract({ ...dao, functionName: 'version' }),
    client.readContract({ ...dao, functionName: 'owner' }),
    client.readContract({ ...dao, functionName: 'pendingOwner' }),
    client.readContract({ ...dao, functionName: 'getMembers' }),
  ]);
  const implementation = getAddress(`0x${slot.slice(-40)}`);
  if (!isAddressEqual(implementation, record.implementation)) {
    report.drift.push(`the proxy runs ${implementation}, the record says ${record.implementation}`);
  }
  if (version !== record.version) {
    report.drift.push(`the contract reports version ${version}, the record says ${record.version}`);
  }
  if (!isAddressEqual(head, config.head)) {
    report.drift.push(`the head is ${head}, the configuration says ${config.head}`);
  }
  if (!isAddressEqual(pendingHead, zeroAddress)) {
    report.drift.push(`the head role is on offer to ${pendingHead}`);
  }
  report.state = `version ${version}, ${members.length} members, head ${short(head)}`;
  if (options.check) return report;

  // Events since the last run.
  const latest = await client.getBlockNumber();
  const resume = cursors[chainId] === undefined ? BigInt(record.startBlock) : BigInt(cursors[chainId]) + 1n;
  const from = latest - resume > MAX_LOOKBACK ? latest - MAX_LOOKBACK : resume;
  if (from !== resume) report.skipped = `blocks ${resume} to ${from - 1n} were not scanned`;

  const handleOf = new Map(members.map((member) => [member.account.toLowerCase(), member.handle]));
  for (let start = from; start <= latest; start += WINDOW) {
    const end = start + WINDOW - 1n < latest ? start + WINDOW - 1n : latest;
    const logs = await client.getLogs({ address: record.proxy, fromBlock: start, toBlock: end });
    for (const log of parseEventLogs({ abi: assertDaoAbi, logs })) {
      const described = describe(log, handleOf);
      if (described) report.events.push({ block: log.blockNumber, level: described[0], text: described[1] });
    }
  }
  report.range = [from, latest];
  cursors[chainId] = Number(latest);
  return report;
}

function render(report) {
  const lines = [`${report.name} · ${report.proxy}`];
  if (report.state) lines.push(`  ${report.state}`);
  for (const problem of report.drift) lines.push(`  ✗ drift: ${problem}`);
  if (report.skipped) lines.push(`  ! ${report.skipped}`);

  const loud = report.events.filter((event) => event.level !== 'activity');
  for (const event of loud) lines.push(`  ${event.level === 'critical' ? '!' : '·'} ${event.text}`);
  const ballots = report.events.length - loud.length;
  if (ballots > 0) lines.push(`  · ${ballots} ${ballots === 1 ? 'ballot' : 'ballots'} cast`);
  if (report.range && report.events.length === 0) lines.push('  nothing new');
  return lines.join('\n');
}

const options = parseArguments(process.argv.slice(2));
const deployed = readdirSync(join(contracts, 'deployments'))
  .filter((file) => /^\d+\.json$/.test(file))
  .map((file) => Number(file.slice(0, -5)));
const selected = options.chains.length > 0 ? options.chains : deployed.filter((id) => id !== anvil.id);
const cursors = options.cursor && existsSync(options.cursor) ? readJson(options.cursor) : {};

if (selected.length === 0) {
  console.log('Nothing is deployed yet: nothing to watch.');
  process.exit(0);
}

const reports = [];
for (const chainId of selected) {
  reports.push(await inspect(chainId, options, cursors));
}

const text = reports.map(render).join('\n\n');
console.log(text);

if (options.cursor) {
  mkdirSync(dirname(options.cursor), { recursive: true });
  writeFileSync(options.cursor, `${JSON.stringify(cursors, null, 2)}\n`);
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `\`\`\`\n${text}\n\`\`\`\n`);
}

const drifted = reports.some((report) => report.drift.length > 0);
const newsworthy = drifted || reports.some((report) => report.events.some((event) => event.level !== 'activity'));
if (process.env.MONITOR_WEBHOOK_URL && newsworthy) {
  // `text` is read by Slack-compatible webhooks, `content` by Discord.
  const response = await fetch(process.env.MONITOR_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text: `ASSERT DAO\n${text}`, content: `ASSERT DAO\n${text}`.slice(0, 1900) }),
  });
  if (!response.ok) console.error(`The webhook answered ${response.status}.`);
}

// A failed run is the alert of last resort: it reaches the maintainers even without a webhook.
process.exit(drifted ? 1 : 0);

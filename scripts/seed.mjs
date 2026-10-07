// Gives the local chain a past: members, a closed round with its result, an open round with a few ballots, and an
// upcoming one. Sample content, for development only.
//
// Every transaction is mined at a chosen time, months apart, and the clock of the chain is handed back to the
// present at the end.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPublicClient, createTestClient, createWalletClient, http } from 'viem';
import { anvil } from 'viem/chains';
import { contracts } from './lib.mjs';

const DAY = 86_400;
const HOUR = 3_600;

// Placeholder members. The first is the head.
const handles = [
  'M4RT1N',
  'carminecesarano',
  'sirui6011',
  'tsuki017',
  'pontaberglund',
  'frank-rg',
  'NicholasOgenstad',
  'YouyaZhang',
  'ccr17',
  'adahen',
  'TuHan',
  'avid-faz666',
  'vivi365',
  'GGmorello',
  'MojtabaEshghie',
  'baudry',
  'Kiki-sen',
  'sbobadilla',
  'andre15silva',
  'martinezmatias',
  'Bobbi',
];

/** Accounts the local chain must sign for: one per member, and one left out to play the visitor. */
export const ACCOUNTS = handles.length + 1;

const rounds = [
  {
    title: '2026 H1',
    created: -180 * DAY,
    start: -175 * DAY,
    end: -161 * DAY,
    proposals: [
      {
        title: 'Reproducible builds for the Java ecosystem',
        body: `## Problem

Two builds of the same commit rarely produce the same artifact: timestamps, file ordering and plugin versions leak in. Without bit-for-bit reproducibility nobody can check that a published jar comes from its source.

## Plan

1. Rebuild the 500 most depended-upon artifacts of the central repository and classify every source of divergence.
2. Fix the ten most frequent causes upstream, in the build plugins themselves.
3. Publish a rebuilder that anyone can run, and a public dashboard of the results.

## Asks

| Item | Amount |
| --- | --- |
| Research engineer, 4 months | 60% |
| Build infrastructure | 30% |
| Travel to upstream projects | 10% |

## Outcome

A measurable rise in reproducible releases, and tooling that maintainers keep using after the project ends.`,
      },
      {
        title: 'A benchmark of machine-generated patches',
        body: `## Problem

Program repair tools report success on benchmarks that language models have already seen. We do not know how much of the progress is real.

## Plan

- Collect bugs **fixed after the training cut-off** of current models, from projects with executable test suites.
- Keep the benchmark rolling: new bugs every month, old ones retired.
- Report \`plausible\` and \`correct\` patches separately, with human-checked labels on a sample.

## Outcome

A leaderboard that cannot be gamed by memorisation, and a dataset released under an open licence.`,
      },
      {
        title: 'Chaos engineering for containerised services',
        body: `## Problem

Failure injection is well understood at the level of machines and networks, far less at the level of **system calls** inside a container, where most real faults surface.

## Plan

1. A fault model for system calls, derived from production incident reports.
2. An injector that needs no change to the application image.
3. An evaluation on five open-source services.

> The aim is not to break things, but to find which failures a service already tolerates and which it silently does not.

## Outcome

A tool, a paper, and a set of resilience reports sent to the maintainers of the services under study.`,
      },
      {
        title: 'An open dataset of software bills of materials',
        body: `## Problem

Bills of materials are becoming mandatory, yet there is no shared corpus to evaluate the tools that produce them. Two generators run on the same project disagree on a third of the dependencies.

## Plan

- Generate bills of materials for 1,000 projects with six generators.
- Establish ground truth by resolving dependencies with the build tool itself.
- Release the corpus and the comparison scripts.

## Outcome

The reference dataset for accuracy studies of bills of materials.`,
      },
    ],
    ballots: [
      ['M4RT1N', [6, 5, 3, 4]],
      ['carminecesarano', [8, 6, 0, 0]],
      ['sirui6011', [3, 7, 5, 4]],
      ['pontaberglund', [9, 0, 4, 1]],
      ['frank-rg', [5, 5, 5, 5]],
      ['NicholasOgenstad', [2, 9, 3, 2]],
      ['YouyaZhang', [7, 4, 5, 3]],
      ['adahen', [0, 6, 8, 0]],
      ['avid-faz666', [4, 4, 8, 2]],
      ['vivi365', [1, 8, 5, 3]],
      ['GGmorello', [6, 2, 2, 7]],
      ['MojtabaEshghie', [3, 3, 9, 1]],
      ['baudry', [5, 6, 6, 1]],
      ['Kiki-sen', [7, 7, 1, 1]],
      ['sbobadilla', [8, 0, 0, 6]],
      ['andre15silva', [2, 9, 2, 3]],
      ['martinezmatias', [4, 8, 4, 2]],
      ['Bobbi', [6, 3, 7, 2]],
    ],
  },
  {
    title: '2026 H2',
    created: -6 * DAY,
    start: -3 * DAY,
    end: 11 * DAY,
    proposals: [
      {
        title: 'Self-healing smart contracts',
        body: `## Problem

A deployed contract cannot be patched like ordinary software. When a vulnerability is found, the window between disclosure and exploitation is measured in minutes.

## Plan

1. Detect exploit attempts in pending transactions, before they are mined.
2. Synthesise a guard that rejects the attack while preserving every legitimate call seen so far.
3. Ship the guard through the upgrade path of the contract, with the evidence attached.

\`\`\`solidity
// A synthesised guard: the invariant the attack would have broken.
require(totalAssets() >= totalDebt(), "Guard: insolvent");
\`\`\`

## Asks

| Item | Share |
| --- | --- |
| Doctoral student, 6 months | 70% |
| Archive node and compute | 20% |
| Security review of the prototype | 10% |

## Outcome

A prototype evaluated on every major exploit of the last three years, replayed on a fork.`,
      },
      {
        title: 'Dependency debloating at build time',
        body: `## Problem

Most of the code an application ships is never executed. It still has to be audited, patched and loaded, and it widens the attack surface.

## Plan

- Trace which classes and functions a test suite and a production workload actually reach.
- Remove the rest **at build time**, and prove with the test suite that nothing observable changed.
- Measure the effect on known vulnerabilities: how many disappear because the vulnerable code is gone?

## Outcome

A build plugin, and numbers on a hundred real applications.`,
      },
      {
        title: 'Agentic code review, measured',
        body: `## Problem

Review agents are being adopted faster than they are evaluated. Vendors report acceptance rates; nobody reports the defects that went through.

## Plan

1. Run three review agents on the full history of ten projects, blind to the outcome.
2. Compare their comments with the defects later fixed in the same code.
3. Interview maintainers on what they ignored, and why.

## Outcome

An honest measure of **recall on real defects**, not of how agreeable the comments are.`,
      },
      {
        title: 'Provenance for machine-written code',
        body: `## Problem

Once merged, code written by a model is indistinguishable from the rest. Maintenance, licensing and security all need to know where a line came from.

## Plan

- Record provenance at the moment of generation, in the commit itself.
- Make the record verifiable without trusting the editor that wrote it.
- Study how provenance decays through refactoring.

## Outcome

A specification, a reference implementation for two editors, and an empirical study over one year of commits.`,
      },
      {
        title: 'A summer school on software supply chain security',
        body: `## Why

The field has grown fast and is taught nowhere as a whole. A week together would train the next cohort and connect the groups working on it.

## Format

- Five days, forty students, lectures in the morning and a build-and-break lab in the afternoon.
- Recordings and lab material published afterwards.

## Asks

Travel grants for students who could not otherwise attend, and the venue.`,
      },
    ],
    ballots: [
      ['carminecesarano', [7, 0, 6, 3, 2]],
      ['sirui6011', [4, 6, 5, 0, 4]],
      ['pontaberglund', [0, 8, 0, 6, 0]],
      ['frank-rg', [5, 3, 6, 4, 3]],
      ['YouyaZhang', [6, 2, 7, 0, 3]],
      ['GGmorello', [9, 1, 3, 2, 2]],
      ['MojtabaEshghie', [8, 2, 4, 4, 0]],
      ['baudry', [3, 6, 4, 5, 3]],
      ['sbobadilla', [2, 5, 3, 7, 3]],
      ['andre15silva', [4, 3, 8, 3, 1]],
      ['Bobbi', [1, 7, 5, 2, 4]],
    ],
  },
  {
    title: '2027 H1',
    created: -1 * DAY,
    start: 21 * DAY,
    end: 35 * DAY,
    proposals: [
      {
        title: 'The energy footprint of continuous integration',
        body: `## Problem

Every push triggers hours of machine time, most of it spent re-running tests that could not have been affected by the change.

## Plan

1. Measure the energy drawn by the pipelines of fifty projects.
2. Estimate what test selection and caching would save.
3. Give maintainers a report they can act on.

## Outcome

The first public figures on what continuous integration costs, and a tool to track it.`,
      },
      {
        title: 'Formal specifications mined from tests',
        body: `## Problem

Formal verification needs specifications that almost no project has. Test suites encode the intended behaviour, informally.

## Plan

- Infer candidate specifications from the assertions of existing tests.
- Let a verifier discard those that do not hold.
- Hand the survivors to maintainers for review.

## Outcome

Verified properties for libraries that never had a specification.`,
      },
    ],
    ballots: [],
  },
];

export async function seed(rpcUrl) {
  const { abi } = JSON.parse(readFileSync(join(contracts, 'out/AssertDAO.sol/AssertDAO.json'), 'utf8'));
  const { proxy } = JSON.parse(readFileSync(join(contracts, 'deployments/31337.json'), 'utf8'));

  const transport = http(rpcUrl);
  const chain = { ...anvil, rpcUrls: { default: { http: [rpcUrl] } } };
  const reader = createPublicClient({ chain, transport });
  const clock = createTestClient({ chain, transport, mode: 'anvil' });
  const signer = createWalletClient({ chain, transport });

  // The local chain signs for its own accounts: the first is the head, the next ones join as members.
  const accounts = await signer.getAddresses();
  if (accounts.length < handles.length) {
    throw new Error(`The local chain has ${accounts.length} accounts, the sample data needs ${handles.length}.`);
  }
  const accountOf = Object.fromEntries(handles.map((handle, index) => [handle, accounts[index]]));
  const head = accountOf.M4RT1N;
  const now = Math.floor(Date.now() / 1000);

  /** Mines one call to the DAO at the given time, relative to now. */
  let previous = Number((await reader.getBlock()).timestamp);
  const send = async (offset, account, functionName, args) => {
    // Calls scheduled at the same moment are mined one second apart.
    previous = Math.max(now + offset, previous + 1);
    await clock.setNextBlockTimestamp({ timestamp: BigInt(previous) });
    const hash = await signer.writeContract({ address: proxy, abi, functionName, args, account });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== 'success') throw new Error(`${functionName} reverted while seeding`);
  };

  for (const handle of handles.slice(1)) {
    await send(-190 * DAY, head, 'addMember', [accountOf[handle], handle]);
  }

  for (const [index, round] of rounds.entries()) {
    const id = BigInt(index + 1);
    await send(round.created, head, 'createRound', [round.title, BigInt(now + round.start), BigInt(now + round.end)]);
    for (const proposal of round.proposals) {
      await send(round.created + HOUR, head, 'propose', [id, proposal.title, proposal.body]);
    }
    // Ballots trickle in, evenly, over the part of the voting window that has already passed.
    const pace = Math.floor((Math.min(round.end, 0) - round.start) / (round.ballots.length + 1));
    for (const [position, [handle, votes]] of round.ballots.entries()) {
      if (!accountOf[handle]) throw new Error(`The sample ballots name ${handle}, who is not a member.`);
      await send(round.start + (position + 1) * pace, accountOf[handle], 'vote', [id, votes]);
    }
  }

  // Back to the present: from here on the chain keeps real time.
  await clock.setNextBlockTimestamp({ timestamp: BigInt(Math.max(Math.floor(Date.now() / 1000), previous + 1)) });
  await clock.mine({ blocks: 1 });

  return { proxy, members: handles.length, rounds: rounds.length };
}

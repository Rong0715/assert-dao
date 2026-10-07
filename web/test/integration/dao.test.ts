// The client library against the real contract on a local chain: what the interface does, minus the pixels.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  addMember,
  cancelRound,
  createRound,
  propose,
  readAssociation,
  readBallots,
  readRound,
  readRounds,
  removeMember,
  stateOf,
  vote,
} from '../../src/lib/dao';
import { explain } from '../../src/lib/errors';
import { startChain, type LocalChain } from './chain';

const HOUR = 3600;
const DAY = 24 * HOUR;

let chain: LocalChain;
let snapshot: `0x${string}`;

beforeAll(async () => {
  chain = await startChain();
});

afterAll(() => {
  chain.stop();
});

// Every test starts from the freshly deployed DAO.
beforeEach(async () => {
  snapshot = await chain.clock.snapshot();
});

afterEach(async () => {
  await chain.clock.revert({ id: snapshot });
});

/** A round with three proposals, opening in an hour for two weeks. */
async function scheduleRound(): Promise<{ id: number; start: number; end: number }> {
  const start = (await chain.now()) + HOUR;
  const end = start + 14 * DAY;
  const id = await createRound(chain.dao, chain.head, '2026 H2', start, end);
  for (const title of ['Program repair', 'Chaos engineering', 'Supply chain']) {
    await propose(chain.dao, chain.head, id, title, `# ${title}\n\nWhy it matters.`);
  }
  return { id, start, end };
}

const refusal = async (attempt: Promise<unknown>): Promise<string> => {
  try {
    await attempt;
  } catch (error) {
    return explain(error);
  }
  throw new Error('the contract accepted what it should have refused');
};

describe('the association', () => {
  it('reads what was deployed', async () => {
    const association = await readAssociation(chain.dao);

    expect(association.head).toBe(chain.head.account.address);
    expect(association.members).toEqual([
      { account: chain.alice.account.address, handle: 'alice' },
      { account: chain.bob.account.address, handle: 'bob' },
    ]);
    expect(association.roundCount).toBe(0);
    expect(association.version).toBe('1.0.0');
    expect(association.credits).toBe(100);
    expect(association.limits).toEqual({ proposals: 32, handle: 32, title: 120, body: 8192 });
    expect(await readRounds(chain.dao)).toEqual([]);
  });

  it('gains and loses members at the word of the head', async () => {
    const newcomer = chain.stranger.account.address;

    await addMember(chain.dao, chain.head, newcomer, 'carol');
    expect((await readAssociation(chain.dao)).members).toContainEqual({ account: newcomer, handle: 'carol' });

    await removeMember(chain.dao, chain.head, newcomer);
    expect((await readAssociation(chain.dao)).members).toHaveLength(2);

    expect(await refusal(addMember(chain.dao, chain.alice, newcomer, 'carol'))).toBe('only the head can do that');
    expect(await refusal(addMember(chain.dao, chain.head, chain.alice.account.address, 'again'))).toBe(
      'this account is already a member',
    );
    expect(await refusal(removeMember(chain.dao, chain.head, newcomer))).toBe('only members can do that');
  });
});

describe('a round', () => {
  it('goes from schedule to result', async () => {
    const { id, start, end } = await scheduleRound();
    expect(id).toBe(1);

    let round = await readRound(chain.dao, id);
    expect(round).toMatchObject({ id: 1, title: '2026 H2', start, end, cancelled: false, voterCount: 0 });
    expect(round.proposals.map((proposal) => proposal.title)).toEqual([
      'Program repair',
      'Chaos engineering',
      'Supply chain',
    ]);
    expect(round.proposals[0]!.body).toBe('# Program repair\n\nWhy it matters.');
    expect(stateOf(round, await chain.now())).toBe('pending');

    await chain.travelTo(start);
    expect(stateOf(round, await chain.now())).toBe('active');
    await vote(chain.dao, chain.alice, id, [6, 0, 8]);
    await vote(chain.dao, chain.bob, id, [1, 2, 3]);

    round = await readRound(chain.dao, id);
    expect(round.voterCount).toBe(2);
    expect(round.proposals.map((proposal) => proposal.votes)).toEqual([7, 2, 11]);
    expect(await readBallots(chain.dao, id)).toEqual([
      { voter: chain.alice.account.address, votes: [6, 0, 8] },
      { voter: chain.bob.account.address, votes: [1, 2, 3] },
    ]);

    // A second ballot replaces the first.
    await vote(chain.dao, chain.alice, id, [0, 10, 0]);
    round = await readRound(chain.dao, id);
    expect(round.voterCount).toBe(2);
    expect(round.proposals.map((proposal) => proposal.votes)).toEqual([1, 12, 3]);

    await chain.travelTo(end);
    expect(stateOf(round, await chain.now())).toBe('closed');
    expect(await refusal(vote(chain.dao, chain.alice, id, [1, 1, 1]))).toBe('round 1 is closed');
    expect((await readRound(chain.dao, id)).proposals.map((proposal) => proposal.votes)).toEqual([1, 12, 3]);
  });

  it('numbers proposals in the order they join the ballot', async () => {
    const start = (await chain.now()) + HOUR;
    const id = await createRound(chain.dao, chain.head, 'Round', start, start + DAY);

    expect(await propose(chain.dao, chain.head, id, 'First', '')).toBe(0);
    expect(await propose(chain.dao, chain.head, id, 'Second', '')).toBe(1);
    expect((await readRounds(chain.dao)).map((round) => round.proposals.length)).toEqual([2]);
  });

  it('accepts a vote as soon as the clock says so, before any block does', async () => {
    const { id, start } = await scheduleRound();

    // Time passes and nothing is mined: the latest block still predates the opening.
    await chain.clock.increaseTime({ seconds: 2 * HOUR });
    expect(await chain.now()).toBeLessThan(start);

    await vote(chain.dao, chain.alice, id, [5, 5, 5]);
    expect((await readRound(chain.dao, id)).voterCount).toBe(1);
  });

  it('can be cancelled until it closes', async () => {
    const { id, start } = await scheduleRound();
    await chain.travelTo(start);
    await vote(chain.dao, chain.alice, id, [6, 0, 8]);

    await cancelRound(chain.dao, chain.head, id);

    const round = await readRound(chain.dao, id);
    expect(round.cancelled).toBe(true);
    expect(stateOf(round, await chain.now())).toBe('cancelled');
    expect(await refusal(vote(chain.dao, chain.bob, id, [1, 1, 1]))).toBe('round 1 is cancelled');
    expect(await refusal(cancelRound(chain.dao, chain.head, id))).toBe('round 1 is cancelled');
  });
});

describe('refusals, in plain words', () => {
  it('explains every way a vote can be refused', async () => {
    const { id, start } = await scheduleRound();

    expect(await refusal(vote(chain.dao, chain.alice, id, [1, 1, 1]))).toBe('round 1 is upcoming');
    await chain.travelTo(start);

    expect(await refusal(vote(chain.dao, chain.stranger, id, [1, 1, 1]))).toBe('only members can do that');
    expect(await refusal(vote(chain.dao, chain.alice, id, [10, 1, 0]))).toBe(
      'the ballot costs 101 credits, the budget is 100',
    );
    expect(await refusal(vote(chain.dao, chain.alice, id, [1, 1]))).toBe(
      'the ballot covers 2 proposals, the round has 3',
    );
    expect(await refusal(vote(chain.dao, chain.alice, 7, [1, 1, 1]))).toBe('there is no round 7');
  });

  it('explains what the head got wrong', async () => {
    const now = await chain.now();
    const { id, start } = await scheduleRound();

    expect(await refusal(createRound(chain.dao, chain.alice, 'Round', now + DAY, now + 2 * DAY))).toBe(
      'only the head can do that',
    );
    expect(await refusal(createRound(chain.dao, chain.head, 'Round', now - DAY, now + DAY))).toBe(
      'voting must open in the future and close after it opens',
    );
    expect(await refusal(createRound(chain.dao, chain.head, '', now + DAY, now + 2 * DAY))).toBe(
      'a title takes 1 to 120 bytes',
    );
    expect(await refusal(propose(chain.dao, chain.head, id, 'Title', 'x'.repeat(8193)))).toBe(
      'the text is 8193 bytes long, the limit is 8192',
    );

    await chain.travelTo(start);
    expect(await refusal(propose(chain.dao, chain.head, id, 'Too late', ''))).toBe('round 1 is open');
  });
});

// Everything the app asks of the contract, typed. The interface and the integration tests go through this module.
import {
  parseEventLogs,
  type Account,
  type Address,
  type Chain,
  type Hash,
  type PublicClient,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from 'viem';
import { assertDaoAbi } from '../abi/AssertDAO';

export type Reader = PublicClient<Transport, Chain>;
export type Writer = WalletClient<Transport, Chain, Account>;

/** A deployed DAO and the client to read it with. */
export interface Dao {
  client: Reader;
  address: Address;
}

export type RoundState = 'pending' | 'active' | 'closed' | 'cancelled';

export interface Member {
  account: Address;
  handle: string;
}

export interface Proposal {
  index: number;
  title: string;
  body: string;
  votes: number;
}

export interface Round {
  id: number;
  title: string;
  /** Timestamp at which voting opens, in seconds. */
  start: number;
  /** Timestamp at which voting closes, in seconds. */
  end: number;
  cancelled: boolean;
  voterCount: number;
  proposals: Proposal[];
}

export interface Ballot {
  voter: Address;
  votes: number[];
}

export interface Association {
  head: Address;
  members: Member[];
  roundCount: number;
  version: string;
  /** Voice credits of each member in each round. */
  credits: number;
  limits: { proposals: number; handle: number; title: number; body: number };
}

const CANCELLED = 3;

/** State of a round at `now`, in seconds. Mirrors the contract, without waiting for a block to tell the time. */
export function stateOf(round: Pick<Round, 'start' | 'end' | 'cancelled'>, now: number): RoundState {
  if (round.cancelled) return 'cancelled';
  if (now < round.start) return 'pending';
  if (now < round.end) return 'active';
  return 'closed';
}

export function totalVotes(round: Pick<Round, 'proposals'>): number {
  return round.proposals.reduce((sum, proposal) => sum + proposal.votes, 0);
}

export async function readAssociation({ client, address }: Dao): Promise<Association> {
  const contract = { address, abi: assertDaoAbi } as const;
  const [head, members, roundCount, version, credits, proposals, handle, title, body] = await Promise.all([
    client.readContract({ ...contract, functionName: 'owner' }),
    client.readContract({ ...contract, functionName: 'getMembers' }),
    client.readContract({ ...contract, functionName: 'roundCount' }),
    client.readContract({ ...contract, functionName: 'version' }),
    client.readContract({ ...contract, functionName: 'CREDITS' }),
    client.readContract({ ...contract, functionName: 'MAX_PROPOSALS' }),
    client.readContract({ ...contract, functionName: 'MAX_HANDLE_LENGTH' }),
    client.readContract({ ...contract, functionName: 'MAX_TITLE_LENGTH' }),
    client.readContract({ ...contract, functionName: 'MAX_BODY_LENGTH' }),
  ]);
  return {
    head,
    members: members.map(({ account, handle: name }) => ({ account, handle: name })),
    roundCount: Number(roundCount),
    version,
    credits: Number(credits),
    limits: { proposals: Number(proposals), handle: Number(handle), title: Number(title), body: Number(body) },
  };
}

export async function readRound({ client, address }: Dao, id: number): Promise<Round> {
  const contract = { address, abi: assertDaoAbi } as const;
  const [info, proposals] = await Promise.all([
    client.readContract({ ...contract, functionName: 'getRound', args: [BigInt(id)] }),
    client.readContract({ ...contract, functionName: 'getProposals', args: [BigInt(id)] }),
  ]);
  return {
    id,
    title: info.title,
    start: Number(info.start),
    end: Number(info.end),
    cancelled: info.state === CANCELLED,
    voterCount: Number(info.voterCount),
    proposals: proposals.map((proposal, index) => ({
      index,
      title: proposal.title,
      body: proposal.body,
      votes: Number(proposal.votes),
    })),
  };
}

/** Every round, oldest first. */
export async function readRounds(dao: Dao): Promise<Round[]> {
  const count = await dao.client.readContract({ address: dao.address, abi: assertDaoAbi, functionName: 'roundCount' });
  return Promise.all(Array.from({ length: Number(count) }, (_, index) => readRound(dao, index + 1)));
}

/** Ballots of a round, in the order members first voted. */
export async function readBallots({ client, address }: Dao, id: number): Promise<Ballot[]> {
  const ballots = await client.readContract({
    address,
    abi: assertDaoAbi,
    functionName: 'getBallots',
    args: [BigInt(id)],
  });
  return ballots.map(({ voter, votes }) => ({ voter, votes: [...votes] }));
}

async function settle({ client }: Dao, hash: Hash): Promise<TransactionReceipt> {
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== 'success') throw new Error('the transaction was reverted');
  return receipt;
}

// Every write is simulated first, so that a refusal by the contract surfaces as its own error rather than as a
// failed gas estimation in a wallet. The simulation runs on the pending block: its timestamp is the current
// time, where the latest block can be arbitrarily old on a chain that only mines on demand.
const simulation = { abi: assertDaoAbi, blockTag: 'pending' } as const;

export async function vote(dao: Dao, wallet: Writer, roundId: number, votes: readonly number[]) {
  const { request } = await dao.client.simulateContract({
    ...simulation,
    address: dao.address,
    account: wallet.account,
    functionName: 'vote',
    args: [BigInt(roundId), votes],
  });
  return settle(dao, await wallet.writeContract(request));
}

/** Creates a round and returns its identifier. */
export async function createRound(dao: Dao, wallet: Writer, title: string, start: number, end: number) {
  const { request } = await dao.client.simulateContract({
    ...simulation,
    address: dao.address,
    account: wallet.account,
    functionName: 'createRound',
    args: [title, BigInt(start), BigInt(end)],
  });
  const receipt = await settle(dao, await wallet.writeContract(request));
  const [created] = parseEventLogs({ abi: assertDaoAbi, logs: receipt.logs, eventName: 'RoundCreated' });
  if (!created) throw new Error('the round was not created');
  return Number(created.args.roundId);
}

export async function cancelRound(dao: Dao, wallet: Writer, roundId: number) {
  const { request } = await dao.client.simulateContract({
    ...simulation,
    address: dao.address,
    account: wallet.account,
    functionName: 'cancelRound',
    args: [BigInt(roundId)],
  });
  return settle(dao, await wallet.writeContract(request));
}

/** Adds a proposal to a pending round and returns its position on the ballot. */
export async function propose(dao: Dao, wallet: Writer, roundId: number, title: string, body: string) {
  const { request } = await dao.client.simulateContract({
    ...simulation,
    address: dao.address,
    account: wallet.account,
    functionName: 'propose',
    args: [BigInt(roundId), title, body],
  });
  const receipt = await settle(dao, await wallet.writeContract(request));
  const [added] = parseEventLogs({ abi: assertDaoAbi, logs: receipt.logs, eventName: 'ProposalAdded' });
  if (!added) throw new Error('the proposal was not added');
  return Number(added.args.index);
}

export async function addMember(dao: Dao, wallet: Writer, account: Address, handle: string) {
  const { request } = await dao.client.simulateContract({
    ...simulation,
    address: dao.address,
    account: wallet.account,
    functionName: 'addMember',
    args: [account, handle],
  });
  return settle(dao, await wallet.writeContract(request));
}

export async function removeMember(dao: Dao, wallet: Writer, account: Address) {
  const { request } = await dao.client.simulateContract({
    ...simulation,
    address: dao.address,
    account: wallet.account,
    functionName: 'removeMember',
    args: [account],
  });
  return settle(dao, await wallet.writeContract(request));
}

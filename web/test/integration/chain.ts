// A throwaway local chain with the DAO deployed on it, for tests that go through the real contract.
import { spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import {
  createPublicClient,
  createTestClient,
  createWalletClient,
  encodeFunctionData,
  http,
  type Abi,
  type Address,
  type Hex,
} from 'viem';
import { anvil } from 'viem/chains';
import { assertDaoAbi } from '../../src/abi/AssertDAO';
import type { Dao, Reader, Writer } from '../../src/lib/dao';

// Not the port of the development chain: both can run at once.
const PORT = 18_545;
const url = `http://127.0.0.1:${PORT}`;
const chain = { ...anvil, rpcUrls: { default: { http: [url] } } };
const transport = http(url);

interface Artifact {
  abi: Abi;
  bytecode: { object: Hex };
}

/** Reads what `forge build` compiled: the tests deploy exactly what the pipeline ships. */
function artifact(name: string): Artifact {
  const path = new URL(`../../../contracts/out/${name}.sol/${name}.json`, import.meta.url);
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Artifact;
  } catch {
    throw new Error(`${name} is not compiled. Run \`forge build\` in contracts/ first.`);
  }
}

export interface LocalChain {
  dao: Dao;
  reader: Reader;
  clock: ReturnType<typeof createTestClient>;
  head: Writer;
  alice: Writer;
  bob: Writer;
  stranger: Writer;
  /** Timestamp of the latest block, in seconds. */
  now: () => Promise<number>;
  /** Mines a block at the given timestamp. */
  travelTo: (timestamp: number) => Promise<void>;
  stop: () => void;
}

export async function startChain(): Promise<LocalChain> {
  const node: ChildProcess = spawn('anvil', ['--port', String(PORT), '--silent'], { stdio: 'ignore' });
  const stop = () => {
    node.kill('SIGTERM');
  };

  try {
    const reader: Reader = createPublicClient({ chain, transport });
    const clock = createTestClient({ chain, transport, mode: 'anvil' });

    for (let attempt = 0; ; attempt++) {
      try {
        await reader.getChainId();
        break;
      } catch (error) {
        if (attempt > 100) throw new Error('The local chain did not start. Is anvil installed?', { cause: error });
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    // The chain signs for its own accounts: no key is handled here.
    const accounts = await createWalletClient({ chain, transport }).getAddresses();
    const signer = (index: number): Writer => createWalletClient({ account: accounts[index]!, chain, transport });
    const [head, alice, bob, stranger] = [signer(0), signer(1), signer(2), signer(3)];

    const deploy = async (name: string, args: unknown[] = []): Promise<Address> => {
      const { abi, bytecode } = artifact(name);
      const hash = await head.deployContract({ abi, bytecode: bytecode.object, args });
      const receipt = await reader.waitForTransactionReceipt({ hash });
      if (!receipt.contractAddress) throw new Error(`${name} was not deployed`);
      return receipt.contractAddress;
    };

    const implementation = await deploy('AssertDAO');
    const founders = [
      { account: alice.account.address, handle: 'alice' },
      { account: bob.account.address, handle: 'bob' },
    ];
    const proxy = await deploy('ERC1967Proxy', [
      implementation,
      encodeFunctionData({ abi: assertDaoAbi, functionName: 'initialize', args: [head.account.address, founders] }),
    ]);

    return {
      dao: { client: reader, address: proxy },
      reader,
      clock,
      head,
      alice,
      bob,
      stranger,
      now: async () => Number((await reader.getBlock()).timestamp),
      travelTo: async (timestamp) => {
        await clock.setNextBlockTimestamp({ timestamp: BigInt(timestamp) });
        await clock.mine({ blocks: 1 });
      },
      stop,
    };
  } catch (error) {
    stop();
    throw error;
  }
}

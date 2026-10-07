# ASSERT DAO

The members of the ASSERT Association vote on the research to fund next.

The head of the association opens a round and puts proposals on its ballot. Every member gets 100 voice credits
per round and spreads them over the proposals: _n_ votes for one proposal cost _n²_ credits, so strong
preferences are expressed, and paid for. Ballots are public and can be changed until the round closes. The
result is the share of the votes each proposal received. Money never moves on-chain: the association acts on
the result.

The contract runs on [Base](https://base.org), an Ethereum layer 2, behind an upgradeable proxy. The interface
is a web page driven by commands.

## Run it

Node 24 and [Foundry](https://getfoundry.sh) 1.5 are required.

```bash
git clone --recurse-submodules <repository url> assert-dao
cd assert-dao
npm install
npm run dev
```

This starts a local chain, deploys the DAO on it with the production script, fills it with sample rounds and
serves the app at <http://localhost:5173>. The local chain signs for its own accounts: `connect` lists them.

## Use it

Everything is a command. Type it, or click: clicking writes the command for you.

| Command                         | Who     |                                                  |
| ------------------------------- | ------- | ------------------------------------------------ |
| `rounds`                        | anyone  | every round                                      |
| `round 2`, `round 2 B`          | anyone  | a round, with proposal B unfolded                |
| `ballots 2`                     | anyone  | who voted what                                   |
| `members`, `whoami`             | anyone  | the association, your account and the contract   |
| `connect`, `disconnect`         | anyone  | use a wallet                                     |
| `vote 2 A=6 C=8`, `vote 2 none` | members | cast, replace or withdraw a ballot               |
| `new round`, `propose 3`        | head    | schedule a round, fill the ballot until it opens |
| `cancel 2`                      | head    | cancel a round that has not closed               |
| `add member 0x… ada`            | head    | let an account vote                              |
| `remove member ada`             | head    | withdraw the right to vote                       |

`tab` completes, `↑` recalls, `/` focuses the prompt. The address bar holds the command of the screen on display:
`#/round/2/B` is a link to proposal B of round 2.

## Layout

```
contracts/            Foundry project
  src/                AssertDAO.sol and its interface
  test/               unit, fuzz, invariant, upgrade and fork tests
  script/             deployment and upgrade, the same code for every chain
  config/             head and founding members, per chain
  deployments/        what runs where, per chain
  storage/            snapshot of the storage layout
  snapshots/          gas per operation
web/                  the app: Vite, React, viem
  src/lib/            contract client, command language, ballot arithmetic
  test/               unit tests, and integration tests on a local chain
ops/monitor.mjs       watches the deployed contract
scripts/              development and pipeline helpers
.github/workflows/    the pipeline
```

## Pipeline

A change travels from an editor to the chain through six stages. Each has a command that runs it locally.

| Stage   | What happens                                                                                                                                                       | Run it                                                          |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| Code    | Git hooks format, lint and scan staged files for secrets                                                                                                           | `npm run lint`                                                  |
| Build   | Compile with a pinned compiler; ABI, storage layout and reference docs are regenerated and compared with the committed ones                                        | `npm run build`, `abi:check`, `storage:check`                   |
| Test    | Unit, fuzz and invariant tests; coverage held at 100%; gas per operation; Slither; upgrade safety against the latest release; client library against a local chain | `npm test`, `coverage`, `gas:check`, `analyze`, `upgrade:check` |
| Release | A version tag on main is checked again, packaged, attested and published                                                                                           | `npm run package`                                               |
| Deploy  | Staging on every release, production by hand behind an approval; the upgrade is rehearsed on a fork first                                                          | `forge script`                                                  |
| Operate | Sources are published on the explorer; an hourly job compares the chain with the repository                                                                        | `npm run monitor`                                               |

Mutation testing (`npm run mutate`) runs weekly: it is slow, and it informs rather than blocks.

Three files are generated and committed, so that a change to them is seen in review:
`web/src/abi/AssertDAO.ts`, `contracts/storage/AssertDAO.json` and `contracts/snapshots/GasTest.json`.

## Releasing

1. Change the version returned by `version()` in the contract, through a pull request.
2. Tag the merge commit `v1.2.3` and push the tag. The release workflow publishes the artifacts and deploys them
   to Base Sepolia.
3. To go to production, run the **Deploy** workflow with the tag and `production`, and approve it.
4. The deployer only pays for gas. If it is not the head, the workflow deploys the new implementation and prints
   the call the head has to send to switch the proxy to it. Until then the monitor reports the difference.
5. Merge the pull request the workflow opens: it records what now runs on the chain, and the web app follows.

The first deployment on a chain needs `contracts/config/<chainId>.json`: the head, and the founding members.

## Repository settings

The pipeline expects, on GitHub:

- **Branch protection** on `main`: pull requests only, with the `CI` check required.
- **Actions → General**: allow GitHub Actions to create pull requests.
- **Environments** `staging` and `production`, each with the secrets `RPC_URL`, `DEPLOYER_PRIVATE_KEY` and
  `ETHERSCAN_API_KEY`; `production` with required reviewers.
- **Secrets** `BASE_RPC_URL`, `BASE_SEPOLIA_RPC_URL` and `MONITOR_WEBHOOK_URL` for the monitor.
- **Variables** `WEB_CHAIN_ID` (`84532` or `8453`) and optionally `WEB_RPC_URL` for the web app.
- **Pages** built from GitHub Actions.

## Security

See [SECURITY.md](SECURITY.md) for what the head can do, what nobody can, and how to report a vulnerability.

## License

[MIT](LICENSE)

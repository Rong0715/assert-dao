# Security

## Reporting a vulnerability

Report privately, through **Security → Report a vulnerability** on this repository. Do not open a public issue,
and do not test against the deployed contract: a fork of the chain reproduces it exactly.

A useful report says what an attacker gains, and shows it with a failing test or a transaction on a fork. You can
expect an acknowledgement within a week.

## Scope

- `contracts/src`, and the proxies recorded in `contracts/deployments`.
- The web app, where it could make a member sign something other than what it shows.
- The delivery pipeline, where it could ship something other than what was reviewed.

The contract holds no funds: a vote decides nothing on-chain beyond its own tally. The worst outcomes are a
falsified tally, a member prevented from voting, and the loss of the head role.

## What the head can do

The head is trusted by design. It can add and remove members, schedule and cancel rounds, write the ballot of a
round until voting opens, and upgrade the contract. It cannot vote for a member, change a ballot paper once voting
is open, or alter a round that has closed, short of an upgrade, which is public, announced by an event and
reported by the monitor.

import { BaseError, ContractFunctionRevertedError, UserRejectedRequestError } from 'viem';

const states = ['upcoming', 'open', 'closed', 'cancelled'];

/** What a custom error of the contract means to the person who triggered it. */
function describe(name: string, args: readonly unknown[]): string | null {
  switch (name) {
    case 'NotMember':
      return 'only members can do that';
    case 'AlreadyMember':
      return 'this account is already a member';
    case 'OwnableUnauthorizedAccount':
      return 'only the head can do that';
    case 'ZeroAddress':
      return 'the zero address cannot be a member';
    case 'InvalidHandle':
      return 'a handle takes 1 to 32 bytes';
    case 'InvalidTitle':
      return 'a title takes 1 to 120 bytes';
    case 'BodyTooLong':
      return `the text is ${String(args[0])} bytes long, the limit is ${String(args[1])}`;
    case 'InvalidWindow':
      return 'voting must open in the future and close after it opens';
    case 'UnknownRound':
      return `there is no round ${String(args[0])}`;
    case 'WrongRoundState':
      return `round ${String(args[0])} is ${states[Number(args[1])] ?? 'in another state'}`;
    case 'TooManyProposals':
      return 'the ballot of this round is full';
    case 'NoProposals':
      return 'this round has no proposals';
    case 'BallotLengthMismatch':
      return `the ballot covers ${String(args[1])} proposals, the round has ${String(args[0])}`;
    case 'CreditsExceeded':
      return `the ballot costs ${String(args[0])} credits, the budget is ${String(args[1])}`;
    case 'RenounceDisabled':
      return 'the association cannot be left without a head';
    default:
      return null;
  }
}

/** One short sentence for anything that can go wrong between a click and a mined transaction. */
export function explain(error: unknown): string {
  if (error instanceof BaseError) {
    if (error.walk((cause) => cause instanceof UserRejectedRequestError)) return 'rejected in the wallet';

    const revert = error.walk((cause) => cause instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError && revert.data) {
      return (
        describe(revert.data.errorName, revert.data.args ?? []) ?? `refused by the contract: ${revert.data.errorName}`
      );
    }
    return error.shortMessage;
  }
  return error instanceof Error ? error.message : 'something went wrong';
}

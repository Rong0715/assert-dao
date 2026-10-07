import { useQuery } from '@tanstack/react-query';
import { dao, network } from './chains';
import { readAssociation, readBallots, readRounds } from './dao';

// The tally is public and live: the screen follows the chain without being asked.
const refetchInterval = network.local ? 4_000 : 12_000;

export function useAssociation() {
  return useQuery({
    queryKey: ['association'],
    queryFn: () => readAssociation(dao!),
    enabled: dao !== undefined,
    refetchInterval,
  });
}

export function useRounds() {
  return useQuery({
    queryKey: ['rounds'],
    queryFn: () => readRounds(dao!),
    enabled: dao !== undefined,
    refetchInterval,
  });
}

export function useBallots(roundId: number | undefined) {
  return useQuery({
    queryKey: ['ballots', roundId],
    queryFn: () => readBallots(dao!, roundId!),
    enabled: dao !== undefined && roundId !== undefined,
    refetchInterval,
  });
}

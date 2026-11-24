import { useQuery } from '@tanstack/react-query';

import { type BrokerStreamProbe, brokerStreamsService } from './broker-streams';

export const BROKER_STREAM_PROBE_QUERY_KEY = 'broker-stream-probe';

const PROBE_BASE_REFETCH_MS = 5000;
const PROBE_MAX_REFETCH_MS = 30000;
const PROBE_MAX_UNKNOWN_ATTEMPTS = 5;

export function probeRefetchInterval(
  probe: BrokerStreamProbe | undefined,
  attempts: number,
): number | false {
  if (probe === 'has-records') return false;
  if (probe === 'unknown' && attempts >= PROBE_MAX_UNKNOWN_ATTEMPTS) {
    return false;
  }
  const step = Math.max(0, attempts - 1);
  return Math.min(PROBE_BASE_REFETCH_MS * 2 ** step, PROBE_MAX_REFETCH_MS);
}

export const useBrokerStreamProbe = (
  memory: string,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: [BROKER_STREAM_PROBE_QUERY_KEY, memory],
    queryFn: () => brokerStreamsService.probeAll(memory),
    enabled: (options?.enabled ?? true) && !!memory,
    refetchInterval: query =>
      probeRefetchInterval(query.state.data, query.state.dataUpdateCount),
  });
};

import { useQuery } from '@tanstack/react-query';

import { brokerStreamsService } from './broker-streams';

export const BROKER_STREAM_PROBE_QUERY_KEY = 'broker-stream-probe';

const PROBE_REFETCH_MS = 5000;

export const useBrokerStreamProbe = (
  memory: string,
  options?: { enabled?: boolean },
) => {
  return useQuery({
    queryKey: [BROKER_STREAM_PROBE_QUERY_KEY, memory],
    queryFn: () => brokerStreamsService.probeAll(memory),
    enabled: (options?.enabled ?? true) && !!memory,
    refetchInterval: query =>
      query.state.data?.hasRecords ? false : PROBE_REFETCH_MS,
  });
};

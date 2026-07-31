import { apiUrl } from '@/lib/api/config';
import type { paths } from '@/lib/api/generated/types';

type BrokerStreamPath = Extract<keyof paths, `/v1/broker/${string}`>;

export const BROKER_STREAM_ENDPOINTS = {
  traces: '/v1/broker/traces',
  messages: '/v1/broker/messages',
  chunks: '/v1/broker/chunks',
  events: '/v1/broker/events',
  sessions: '/v1/broker/sessions',
} as const satisfies Record<string, BrokerStreamPath>;

export type BrokerStreamKey = keyof typeof BROKER_STREAM_ENDPOINTS;

export const BROKER_STREAM_KEYS = Object.keys(
  BROKER_STREAM_ENDPOINTS,
) as BrokerStreamKey[];

export interface BrokerStreamProbe {
  hasRecords: boolean;
  isEmpty: boolean;
}

interface PaginatedProbePayload {
  items?: unknown[];
  total?: number;
}

async function countStream(
  path: BrokerStreamPath,
  memory: string,
): Promise<number | null> {
  try {
    const response = await fetch(
      apiUrl(
        `/api${path}?memory=${encodeURIComponent(memory)}&limit=1&_t=${Date.now()}`,
      ),
    );
    if (!response.ok) return null;
    const data: PaginatedProbePayload = await response.json();
    if (!Array.isArray(data.items)) return null;
    return typeof data.total === 'number' ? data.total : data.items.length;
  } catch {
    return null;
  }
}

export const brokerStreamsService = {
  async probeAll(memory: string): Promise<BrokerStreamProbe> {
    const counts = await Promise.all(
      BROKER_STREAM_KEYS.map(key =>
        countStream(BROKER_STREAM_ENDPOINTS[key], memory),
      ),
    );

    return {
      hasRecords: counts.some(count => count !== null && count > 0),
      isEmpty: counts.every(count => count === 0),
    };
  },
};

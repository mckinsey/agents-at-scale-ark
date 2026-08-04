import { apiUrl } from '@/lib/api/config';
import type { paths } from '@/lib/api/generated/types';

type BrokerStreamPath = Extract<keyof paths, `/v1/broker/${string}`>;

export const BROKER_STREAM_KEYS = [
  'traces',
  'messages',
  'chunks',
  'events',
  'sessions',
] as const;

export type BrokerStreamKey = (typeof BROKER_STREAM_KEYS)[number];

export const BROKER_STREAM_ENDPOINTS = {
  traces: '/v1/broker/traces',
  messages: '/v1/broker/messages',
  chunks: '/v1/broker/chunks',
  events: '/v1/broker/events',
  sessions: '/v1/broker/sessions',
} as const satisfies Record<BrokerStreamKey, BrokerStreamPath>;

export type BrokerStreamProbe = 'empty' | 'has-records' | 'unknown';

interface PaginatedProbePayload {
  items?: unknown[];
  total?: number;
}

async function probeStream(
  path: BrokerStreamPath,
  memory: string,
): Promise<BrokerStreamProbe> {
  try {
    const response = await fetch(
      apiUrl(`/api${path}?memory=${encodeURIComponent(memory)}&limit=1`),
      { cache: 'no-store' },
    );
    if (!response.ok) return 'unknown';
    const data: PaginatedProbePayload = await response.json();
    if (!Array.isArray(data.items)) return 'unknown';
    const count =
      typeof data.total === 'number' ? data.total : data.items.length;
    return count > 0 ? 'has-records' : 'empty';
  } catch {
    return 'unknown';
  }
}

export const brokerStreamsService = {
  async probeAll(memory: string): Promise<BrokerStreamProbe> {
    const results = await Promise.all(
      BROKER_STREAM_KEYS.map(key =>
        probeStream(BROKER_STREAM_ENDPOINTS[key], memory),
      ),
    );

    if (results.includes('has-records')) return 'has-records';
    return results.every(result => result === 'empty') ? 'empty' : 'unknown';
  },
};

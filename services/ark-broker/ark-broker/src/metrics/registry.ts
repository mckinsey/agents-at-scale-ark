import {collectDefaultMetrics, Gauge, Registry} from 'prom-client';

export type CacheSizeSources = {
  messages?: () => number;
  chunks?: () => number;
  spans?: () => number;
  events?: () => number;
};

const GAUGES: Record<keyof CacheSizeSources, {name: string; help: string}> = {
  messages: {
    name: 'broker_messages_count',
    help: 'Messages currently held in the in-process message cache',
  },
  chunks: {
    name: 'broker_chunks_count',
    help: 'Completion chunks currently held in the in-process chunk cache',
  },
  spans: {
    name: 'broker_spans_count',
    help: 'OTEL spans currently held in the in-process trace cache',
  },
  events: {
    name: 'broker_events_count',
    help: 'Operation events currently held in the in-process event cache',
  },
};

export function createMetricsRegistry(sources: CacheSizeSources): Registry {
  const registry = new Registry();
  collectDefaultMetrics({register: registry});

  for (const key of Object.keys(GAUGES) as (keyof CacheSizeSources)[]) {
    const count = sources[key];
    if (!count) continue;
    const {name, help} = GAUGES[key];
    registry.registerMetric(
      new Gauge({
        name,
        help,
        registers: [],
        collect(): void {
          this.set(count());
        },
      })
    );
  }

  return registry;
}

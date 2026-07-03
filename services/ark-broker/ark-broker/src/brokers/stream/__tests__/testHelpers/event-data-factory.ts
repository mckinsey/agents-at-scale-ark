import {faker} from '@faker-js/faker';
import type {EventData} from '../../../event-broker.js';

const defaults = (): EventData => ({
  timestamp: new Date().toISOString(),
  eventType: 'QueryExecutionComplete',
  reason: 'Completed',
  message: faker.lorem.sentence(),
  data: {
    queryId: faker.string.uuid(),
    queryName: faker.lorem.word(),
    queryNamespace: 'default',
    sessionId: faker.string.uuid(),
  },
});

export function makeEventData(overrides?: Partial<EventData>): EventData {
  return {...defaults(), ...overrides};
}

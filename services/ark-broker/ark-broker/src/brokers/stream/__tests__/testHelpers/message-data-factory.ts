import {faker} from '@faker-js/faker';
import type {MessageData} from '../../../memory-broker.js';

const defaults = (): MessageData => ({
  conversationId: faker.string.uuid(),
  queryId: faker.string.uuid(),
  message: {role: 'user', content: faker.lorem.word()},
});

export function makeMessageData(overrides?: Partial<MessageData>): MessageData {
  return {...defaults(), ...overrides};
}

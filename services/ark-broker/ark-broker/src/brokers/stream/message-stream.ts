import type {MessageData} from '../memory-broker.js';
import type {Stream} from './stream.js';

export interface MessageStream extends Stream<MessageData> {
  deleteByQuery(queryId: string): Promise<void>;
}

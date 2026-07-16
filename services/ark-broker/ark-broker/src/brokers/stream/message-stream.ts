import type {MessageData} from '../memory-broker.js';
import type {PaginatedList, PaginationParams} from '../pagination.js';
import type {BrokerItem} from './broker-item.js';
import type {Stream} from './stream.js';

export interface MessageFilter {
  conversationId?: string;
  queryId?: string;
  afterSequence?: number;
}

export interface ConversationStats {
  conversationId: string;
  messageCount: number;
  queryCount: number;
}

export interface MessageStream extends Stream<MessageData> {
  deleteByQuery(queryId: string): Promise<void>;
  paginateBy(
    params: PaginationParams,
    filter?: MessageFilter
  ): Promise<PaginatedList<BrokerItem<MessageData>>>;
  filterBy(filter: MessageFilter): Promise<BrokerItem<MessageData>[]>;
  deleteBy(filter: MessageFilter): Promise<void>;
  distinctConversationIds(): Promise<string[]>;
  conversationStats(): Promise<ConversationStats[]>;
  appendMany(
    dataList: MessageData[],
    ttlSeconds?: number
  ): Promise<BrokerItem<MessageData>[]>;
}

import {createLogger} from '@ark-broker/logging/logger';
import {InMemoryChunkStream} from '../in-memory-chunk-stream';
import {runChunkStreamContract} from './testHelpers/chunk-stream-contract';

describe('InMemoryChunkStream — chunk stream contract', () => {
  const logger = createLogger({level: 'silent', pretty: false});
  runChunkStreamContract(() => new InMemoryChunkStream(logger));
});

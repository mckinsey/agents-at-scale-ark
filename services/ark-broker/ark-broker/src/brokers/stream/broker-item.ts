/**
 * A wrapper for items stored in a broker stream.
 * Provides consistent sequencing and timestamping across all broker types.
 *
 * @template T - The type of data being stored (e.g., MessageData, ChunkData, OTELSpan)
 */
export interface BrokerItem<T> {
  /** Sequence number, guaranteed to be correctly ordered within the stream */
  sequenceNumber: number;

  /** Timestamp when the item was added. Serialized as ISO 8601 string in JSON. */
  timestamp: Date;

  /** The actual data payload */
  data: T;
}

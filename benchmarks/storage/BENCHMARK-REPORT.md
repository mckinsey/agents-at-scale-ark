# Storage Backend Benchmark Report

**Date:** 2026-01-23
**Test Duration:** 30 seconds per benchmark
**Key Count:** 5,000 keys
**Value Size:** 512 bytes

## Test Environment

| Component | Version/Config |
|-----------|----------------|
| etcd | v3.5.17 (via kind cluster port-forward) |
| PostgreSQL | 16 (Docker container) |
| SQLite | 3.x (WAL mode, NORMAL sync) |
| Go | 1.23 |
| OS | Linux 6.18.3-arch1-1 |

## Executive Summary

| Use Case | Recommended Backend | Rationale |
|----------|---------------------|-----------|
| **Single-threaded reads** | SQLite | 47.8k ops/sec, lowest latency (19µs) |
| **Concurrent reads (50+)** | PostgreSQL | 120k ops/sec, scales with connections |
| **Single-threaded writes** | SQLite | 37.5k ops/sec vs 89-108 ops/sec (etcd/PG) |
| **Concurrent writes** | SQLite | 38k ops/sec despite single-writer lock |
| **Watch/Subscribe** | SQLite (in-process) | 33k events/sec; etcd for cross-process |
| **Mixed workloads** | PostgreSQL | Best scaling at high concurrency |

## Detailed Results

### Read Performance

| Concurrency | etcd | PostgreSQL | SQLite | Winner |
|-------------|------|------------|--------|--------|
| **1** | 2,771 ops/sec (358µs p50) | 15,963 ops/sec (59µs p50) | **47,842 ops/sec** (19µs p50) | SQLite |
| **10** | 19,361 ops/sec (495µs p50) | **85,232 ops/sec** (105µs p50) | 42,642 ops/sec (171µs p50) | PostgreSQL |
| **50** | 55,703 ops/sec (840µs p50) | **120,577 ops/sec** (360µs p50) | 42,987 ops/sec (808µs p50) | PostgreSQL |

**Analysis:**
- SQLite dominates single-threaded reads due to zero network overhead
- PostgreSQL scales well with connection pooling (64 connections)
- etcd performance limited by port-forward latency through kind

### Write Performance

| Concurrency | etcd | PostgreSQL | SQLite | Winner |
|-------------|------|------------|--------|--------|
| **1** | 89 ops/sec (9.26ms p50) | 108 ops/sec (8.89ms p50) | **37,497 ops/sec** (22µs p50) | SQLite |
| **10** | 446 ops/sec (17.63ms p50) | 110 ops/sec (87.10ms p50) | **36,303 ops/sec** (25µs p50) | SQLite |
| **50** | 2,202 ops/sec (17.77ms p50) | 108 ops/sec (451ms p50) | **38,139 ops/sec** (1.26ms p50) | SQLite |

**Analysis:**
- SQLite's in-process writes with WAL mode are extremely fast
- etcd write performance limited by Raft consensus (expected)
- PostgreSQL NOTIFY triggers add significant write overhead
- PostgreSQL write throughput collapses at high concurrency due to NOTIFY serialization

### Watch/Subscribe Performance

| Concurrency | etcd | PostgreSQL | SQLite | Winner |
|-------------|------|------------|--------|--------|
| **1** | 77 events/sec | 93 events/sec | **903 events/sec** | SQLite |
| **10** | 446 events/sec | 107 events/sec | **7,705 events/sec** | SQLite |
| **50** | 2,184 events/sec | 109 events/sec | **33,132 events/sec** | SQLite |

**Analysis:**
- SQLite's in-process channel notification is fastest (but process-local only)
- PostgreSQL LISTEN/NOTIFY is consistent (~100-110 events/sec) but doesn't scale
- etcd watch throughput limited by write rate (watch events = writes)
- Note: etcd/SQLite report 0µs latency due to measurement at write time, not receive time

### Mixed Workload (80% Read, 20% Write)

| Concurrency | etcd | PostgreSQL | SQLite | Winner |
|-------------|------|------------|--------|--------|
| **1** | 2,733 ops/sec | 15,984 ops/sec | **47,565 ops/sec** | SQLite |
| **10** | 414 ops/sec | **83,226 ops/sec** | 37,269 ops/sec | PostgreSQL |
| **50** | 1,424 ops/sec | **124,411 ops/sec** | 40,194 ops/sec | PostgreSQL |

**Analysis:**
- SQLite best for single-user/low-concurrency scenarios
- PostgreSQL excels at concurrent mixed workloads
- etcd mixed performance poor due to write portion dragging down averages

## Latency Percentiles (p99)

### Read p99 Latency

| Concurrency | etcd | PostgreSQL | SQLite |
|-------------|------|------------|--------|
| 1 | 523µs | 93µs | **32µs** |
| 10 | 925µs | 269µs | 982µs |
| 50 | 1.96ms | 1.36ms | 5.30ms |

### Write p99 Latency

| Concurrency | etcd | PostgreSQL | SQLite |
|-------------|------|------------|--------|
| 1 | 28ms | 18.8ms | **46µs** |
| 10 | 59.8ms | 125ms | 1.2ms |
| 50 | 53ms | 556ms | **1.91ms** |

## Recommendations

### Choose SQLite when:
- Single process/embedded use case
- Low-medium concurrency (< 10 concurrent users)
- Fastest possible single-threaded performance needed
- Watch/events are process-local only

### Choose PostgreSQL when:
- High concurrency (50+ concurrent connections)
- Need for cross-process notifications
- Scaling read throughput is priority
- Complex queries beyond KV operations needed

### Choose etcd when:
- Need distributed consensus (multi-node HA)
- Kubernetes-native integration required
- Watch semantics with strong consistency
- Configuration/coordination store use case

## Caveats

1. **etcd test environment**: Running through kind port-forward adds network latency; bare-metal etcd would be faster
2. **PostgreSQL NOTIFY**: Known scalability issue - serializes commits, causing write throughput collapse at high load
3. **SQLite watch**: In-process only; not comparable to cross-process etcd/PostgreSQL watch
4. **Watch latency**: Current measurement captures processing time, not end-to-end notification latency

## Raw Data

See `results.json` for complete benchmark data including all percentiles and timestamps.

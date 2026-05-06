# ark-apiserver

Helm chart for the aggregated API server that backs the `ark.mckinsey.com` API groups when the storage backend is `postgresql`. Pairs with the `ark-controller` chart, which runs the reconciler manager.

## Quickstart

```bash
helm upgrade --install ark-apiserver ./dist/chart-apiserver \
  --namespace ark-system \
  --create-namespace \
  --set image.repository=<registry>/ark-controller \
  --set image.tag=<tag> \
  --set postgresql.host=ark-storage-dev \
  --set postgresql.user=postgres \
  --set postgresql.passwordSecretName=ark-storage-dev-password
```

## Operational notes

### Replication slot lifecycle

The apiserver creates a **persistent** logical replication slot named `ark_cdc` on the configured PostgreSQL database to drive its watch stream. The slot survives apiserver pod restarts, which is what lets watchers resume from the last confirmed WAL position rather than missing events from the restart gap.

Because the slot is persistent, **it is not removed by `helm uninstall`**. An orphaned slot will pin WAL retention on the postgres database indefinitely and can fill the disk. After uninstalling ark-apiserver, drop the slot manually:

```sql
SELECT pg_drop_replication_slot('ark_cdc');
```

If you redeploy the apiserver later, it detects the existing slot on startup and reuses it; if the slot was invalidated (`wal_status = 'lost'`, e.g. after `max_slot_wal_keep_size` was exceeded), it is dropped and recreated automatically.

### Multi-replica behaviour

The chart defaults to a single replica. The chart grants the apiserver ServiceAccount the RBAC needed for `controller-runtime` leader election (`Lease/ark-apiserver-leader`). If you scale to multiple replicas, only one instance acquires the lease and runs the WAL consumer — the persistent replication slot's `active` flag also serves as a backstop, so even without leader election only one replica can hold the slot at a time.

### Required PostgreSQL configuration

The database must allow logical replication. Typical settings:

```
wal_level = logical
max_replication_slots >= 1
max_wal_senders >= 1
```

The `ark-storage-dev` Helm chart in this repo sets these for development; production deployments must verify them on the managed postgres service.

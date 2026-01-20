# Query Execution Queue Deployment Guide

## Overview

This guide covers deploying the postgres-backed work queue for query execution scaling.

## Architecture

**Postgres Database:**
- Always deployed as shared Ark infrastructure
- All controller replicas connect to postgres
- Future use cases can leverage the same database

**Queue Feature (Optional):**
- Enabled via `queue.enabled: true`
- Leader dynamically enqueues jobs during reconciliation
- All replicas (leader + non-leaders) run workers consuming jobs
- Leader election determines who enqueues, not helm configuration

## Prerequisites

- Kubernetes cluster with sufficient resources
- Ark controller deployed
- Storage provisioner for postgres PVC

## Quick Start

### 1. Enable Queue in Helm Values

```yaml
queue:
  enabled: true
  postgres:
    storage:
      size: 10Gi
      storageClass: ""  # Use default storage class
  workers:
    count: 4
    pollInterval: 1s
```

### 2. Deploy with Queue Enabled

```bash
helm upgrade --install ark ./dist/chart \
  --set queue.enabled=true \
  --set controllerManager.replicas=3
```

### 3. Verify Deployment

```bash
# Check postgres is running
kubectl get statefulset -n ark-system ark-postgres
kubectl get pods -n ark-system -l app.kubernetes.io/component=postgres

# Check postgres logs
kubectl logs -n ark-system ark-postgres-0

# Check controller logs for queue initialization
kubectl logs -n ark-system -l control-plane=ark -c manager | grep -i queue
```

### 4. Test Query Execution

```bash
# Submit a test query
kubectl apply -f - <<EOF
apiVersion: ark.mckinsey.com/v1alpha1
kind: Query
metadata:
  name: test-queue
  namespace: default
spec:
  type: user
  input: "What is 2+2?"
  target:
    type: model
    name: gpt-4
EOF

# Watch query status
kubectl get query test-queue -w

# Check River jobs in postgres
kubectl exec -it -n ark-system ark-postgres-0 -- psql -U river -d river -c "SELECT id, kind, state, created_at FROM river_job ORDER BY created_at DESC LIMIT 10;"
```

## Architecture

### Components

1. **Postgres StatefulSet** - Always deployed
   - Shared Ark infrastructure (not queue-specific)
   - 1 replica with persistent storage
   - All controller replicas connect to it

2. **Queue Feature** - When enabled
   - Leader enqueues jobs during Query reconciliation
   - All replicas run River workers
   - Workers consume jobs from postgres queue

### Job Flow

**Without Queue (default):**
```
Query Created → Leader Reconciler → Execute in Goroutine
```

**With Queue Enabled:**
```
Query Created → Leader Reconciler → Enqueue to Postgres → Any Replica Worker → Execute Query → Update Status
```

### Scaling Behavior

- **Replicas: 1** - Leader reconciles + enqueues + works on jobs
- **Replicas: 3** - Leader enqueues, all 3 replicas work on jobs (3x parallelism)
- **Leader Failover** - New leader automatically starts enqueueing, workers continue

### Scaling

- **Horizontal**: Add more controller replicas (workers scale automatically)
- **Vertical**: Increase `queue.workers.count` per replica

## Configuration

### Environment Variables

Set in controller deployment:

```yaml
env:
- name: QUEUE_ENABLE
  value: "true"
- name: POSTGRES_HOST
  value: "ark-postgres"
- name: POSTGRES_PORT
  value: "5432"
- name: POSTGRES_DB
  value: "river"
- name: POSTGRES_USER
  value: "river"
- name: POSTGRES_PASSWORD
  valueFrom:
    secretKeyRef:
      name: ark-postgres
      key: password
- name: QUEUE_WORKER_COUNT
  value: "4"
- name: QUEUE_WORKER_POLL_INTERVAL
  value: "1s"
```

### Helm Values

```yaml
queue:
  enabled: true
  postgres:
    image: postgres:16-alpine
    database: river
    username: river
    password: ""  # Auto-generated if not provided
    storage:
      size: 10Gi
      storageClass: ""
    resources:
      requests:
        memory: 256Mi
        cpu: 100m
      limits:
        memory: 512Mi
        cpu: 250m
  workers:
    count: 4          # Workers per replica
    pollInterval: 1s  # How often to poll for jobs
```

## Monitoring

### River Job States

Query River job table:
```sql
SELECT
  state,
  COUNT(*) as count
FROM river_job
WHERE kind = 'QueryExecutionJob'
GROUP BY state;
```

### Job History

```sql
SELECT
  id,
  args->>'QueryName' as name,
  args->>'QueryNamespace' as namespace,
  state,
  attempt,
  created_at,
  finalized_at
FROM river_job
WHERE kind = 'QueryExecutionJob'
ORDER BY created_at DESC
LIMIT 20;
```

## Troubleshooting

### Jobs Not Processing

1. Check worker count:
```bash
kubectl logs -n ark-system -l control-plane=ark | grep "Queue infrastructure initialized"
```

2. Verify postgres connection:
```bash
kubectl exec -it -n ark-system ark-postgres-0 -- psql -U river -d river -c "SELECT version();"
```

3. Check for stuck jobs:
```sql
SELECT * FROM river_job WHERE state = 'running' AND created_at < NOW() - INTERVAL '10 minutes';
```

### Query Stuck in Running

1. Check if job was enqueued:
```bash
kubectl logs -n ark-system -l control-plane=ark | grep "Query enqueued"
```

2. Find the job:
```sql
SELECT * FROM river_job WHERE args->>'QueryUID' = '<query-uid>';
```

3. Check job errors:
```sql
SELECT errors FROM river_job WHERE id = <job-id>;
```

### Postgres Issues

1. Check postgres logs:
```bash
kubectl logs -n ark-system ark-postgres-0
```

2. Check PVC:
```bash
kubectl get pvc -n ark-system
```

3. Verify postgres is ready:
```bash
kubectl exec -n ark-system ark-postgres-0 -- pg_isready -U river
```

## Migration from Goroutine Execution

The queue system is **opt-in** and maintains full backward compatibility:

- **Before**: Queries executed via goroutines in leader replica
- **After**: Queries executed via River workers on all replicas
- **Migration**: Enable queue, no code changes needed
- **Rollback**: Disable queue, falls back to goroutines

### Migration Steps

1. Deploy postgres infrastructure (queue.enabled=true)
2. Restart controller to initialize queue
3. New queries automatically use queue
4. In-flight queries (goroutines) complete normally

## Performance Tuning

### Worker Count

- **Low volume** (< 10 queries/min): 2-4 workers per replica
- **Medium volume** (10-100 queries/min): 4-8 workers per replica
- **High volume** (> 100 queries/min): 8-16 workers per replica

### Poll Interval

- **Low latency**: 500ms-1s
- **Normal**: 1s-2s
- **High volume/cost conscious**: 2s-5s

### Postgres Resources

Adjust based on job volume:
```yaml
queue:
  postgres:
    resources:
      requests:
        memory: 256Mi  # Increase for high job volume
        cpu: 100m
      limits:
        memory: 512Mi
        cpu: 250m
    storage:
      size: 10Gi  # Increase for longer job retention
```

## Security Considerations

1. **Password Management**
   - Auto-generated if not provided
   - Stored in Kubernetes Secret
   - Can use external secret management (e.g., Vault)

2. **Network Policies**
   - Postgres only accessible within cluster
   - Headless service (no external IP)

3. **RBAC**
   - Workers use controller's service account
   - Impersonation for Query execution (if enabled)

## Next Steps

1. **Add Metrics** - Prometheus metrics for job counts and duration
2. **Add Integration Tests** - E2E tests with multiple replicas
3. **Add Load Tests** - Performance validation
4. **Add Observability** - Grafana dashboards for queue health

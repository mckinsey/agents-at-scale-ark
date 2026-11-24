# apiserver-audit

Validates that the aggregated (PostgreSQL) apiserver emits its own Kubernetes audit trail in apiserver mode.

## What it tests
- Create, update, and delete of an Ark `Agent` over the proxied path each produce an `audit.k8s.io/v1` record in the apiserver's stdout logs.
- A create issued over the **direct service path** (`https://ark-apiserver.ark-system.svc:6443`, bypassing the main kube-apiserver) is also audited — proving the previously invisible direct path is now covered (#2684).
- Audit is on by default via the `chart-apiserver` chart (JSON to stdout, `Metadata` level).

## Running
```bash
chainsaw test
```

Runs only in the `postgresql` backend matrix. Successful completion validates that the aggregated apiserver records resource operations, including access that never transits the main kube-apiserver.

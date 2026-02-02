# Embedded Apiserver with PostgreSQL

Tests the embedded apiserver functionality when using PostgreSQL as the storage backend instead of etcd/CRDs.

## What it tests

- PostgreSQL storage backend connectivity
- APIService registration and availability
- CRUD operations (Create, Read, Update, Delete) on Model resources
- Status subresource updates
- Data persistence across controller restarts

## Prerequisites

**IMPORTANT: This test requires an isolated cluster without existing Ark installation.**

The embedded apiserver uses cluster-scoped resources (APIService, ClusterRoleBinding) that conflict with standard CRD-based Ark installations. Run this test on:

- A fresh Kind/K3s cluster
- CI environments with dedicated test clusters
- Clusters where Ark has been fully uninstalled

The test will fail fast if it detects an existing Ark installation.

## Running

```bash
# Ensure no existing Ark installation
kubectl get deployment -A | grep ark-controller

# Run the test
chainsaw test tests/apiserver-embedded-postgresql/
```

## What happens

1. Deploys PostgreSQL via Bitnami Helm chart
2. Deploys Ark controller with `storage.backend=postgresql`
3. Validates APIService becomes available
4. Runs CRUD tests against the embedded apiserver
5. Tests data persistence by restarting the controller
6. Cleans up all resources

Successful completion validates that Ark resources can be stored in PostgreSQL and survive controller restarts.

## Labels

- `requires-images: "true"` - Needs ark-controller image
- `storage-backend: "postgresql"` - Uses PostgreSQL backend
- `isolated-cluster: "true"` - Requires isolated cluster without existing Ark

# Apiserver Auth

Validates that the aggregated apiserver enforces delegated authentication and authorization on direct service access.

## What it tests
- An unauthenticated request straight to the ark-apiserver service is rejected (401/403), not served.
- A valid service account token without RBAC on Ark resources is denied (403) via delegated SubjectAccessReview.
- Granting a Role on agents makes the same direct request succeed, proving Kubernetes RBAC governs the direct path.
- kubectl through the aggregation layer keeps working under delegated auth.

## Running
```bash
chainsaw test
```

Successful completion validates that direct access to the aggregated apiserver cannot bypass Kubernetes RBAC.

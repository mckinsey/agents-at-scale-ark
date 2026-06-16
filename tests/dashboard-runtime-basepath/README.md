# Dashboard runtime basepath

Validates that the published `ark-dashboard` image honours `ARK_DASHBOARD_BASE_PATH` at container startup — same image, different runtime prefix — without rebuild.

## What it tests
- With `ARK_DASHBOARD_BASE_PATH=/tenant-a`, the pod serves the dashboard at `/tenant-a` and returns 404 at `/`.
- With `ARK_DASHBOARD_BASE_PATH=""` (or unset), the pod serves at `/` (legacy behaviour).
- Static asset URLs emitted in the HTML are prefixed with the configured base path.
- No sentinel string (`/__ark_base_path__`) leaks into the served HTML.

## Running
```bash
chainsaw test
```

A successful run confirms the placeholder-substitution mechanism in `services/ark-dashboard/entrypoint.sh` produces a working dashboard under any prefix, including the empty default.

## Limitations
- Does not exercise the cluster Ingress that routes `/<basePath>/api/v1/*` to ark-api. That is the cluster operator's responsibility (see `docs/operations-guide/multi-tenant-dashboard-hosting.mdx`); a full e2e of that path requires an ingress controller in the test cluster, which this test does not assume.
- Requires the image label `requires-images: "true"` because it depends on the dashboard image built from the same commit.

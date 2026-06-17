# Dashboard runtime basepath

Verifies the published `ark-dashboard` image honours `ARK_DASHBOARD_BASE_PATH` at container startup — the entrypoint substitutes a sentinel into the standalone Next.js output and the dashboard serves correctly under a non-empty URL prefix, no image rebuild required.

## What it tests
- Installing the chart with `app.config.basePath=/tenant-a` produces a pod that serves at `/tenant-a` and returns 404 at `/`.
- Static asset URLs emitted in the rendered HTML are prefixed with `/tenant-a/`.
- No sentinel string (`/__ark_base_path__`) leaks into the served HTML.

The empty-basepath case is implicitly covered by every other dashboard usage (`devspace deploy`, `ark dashboard`) and isn't duplicated here.

## Running
```bash
chainsaw test
```

A successful run confirms the placeholder-substitution mechanism in `services/ark-dashboard/entrypoint.sh` produces a working dashboard under any prefix.

## CI
Labelled `requires-images: "true"`. CI plumbs `ARK_DASHBOARD_IMAGE` and `ARK_DASHBOARD_IMAGE_TAG` into the standard E2E step so the test uses the image built from the current commit.

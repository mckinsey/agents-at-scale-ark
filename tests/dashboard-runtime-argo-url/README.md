# Dashboard runtime Argo URL

Verifies the `ark-dashboard` image reads `app.config.argoUrl` at container startup, so each tenant dashboard links to its own Argo UI and a dashboard without the value shows no Argo links.

## What it tests
- Two tenant namespaces, each with its own Argo URL, get `ARGO_URL` set to their own value on the dashboard Deployment.
- Each tenant's served page contains its own Argo URL and not the other tenant's.
- A trailing slash on the configured URL is stripped.
- A dashboard installed without `app.config.argoUrl`, in a third namespace, has no `ARGO_URL` env var and renders no Argo URL.

The page check joins the chunks of the inlined RSC payload before matching, because Next.js splits `self.__next_f.push()` calls at arbitrary offsets (see `tests/dashboard-runtime-basepath/README.md`).

## Running
```bash
chainsaw test
```

A successful run confirms one dashboard image serves the Argo URL configured for each tenant, with no image rebuild.

## CI
Labelled `requires-images: "true"`. CI plumbs `ARK_DASHBOARD_IMAGE` and `ARK_DASHBOARD_IMAGE_TAG` into the standard E2E step so the test uses the image built from the current commit.

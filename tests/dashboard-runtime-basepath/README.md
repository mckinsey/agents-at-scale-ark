# Dashboard runtime basepath

Verifies the published `ark-dashboard` image honours `ARK_DASHBOARD_BASE_PATH` at container startup — the entrypoint substitutes a sentinel into the standalone Next.js output and the dashboard serves correctly under a non-empty URL prefix, no image rebuild required.

## What it tests
- Installing the chart with `app.config.basePath=/tenant-a` produces a pod that serves at `/tenant-a` and returns 404 at `/`.
- Every `/_next/` asset referenced from a `src`/`href` attribute is prefixed with `/tenant-a/` and returns HTTP 200.
- No sentinel string (`/__ark_base_path__`) leaks into the served HTML.

The empty-basepath case is implicitly covered by every other dashboard usage (`devspace deploy`, `ark dashboard`) and isn't duplicated here.

### Why asset checks scan attributes, not raw HTML

Next.js inlines the RSC flight payload as a series of `self.__next_f.push([1,"…"])` scripts and splits that payload at arbitrary byte offsets, including mid-string. A boundary landing inside an asset URL leaves a fragment like `nant-a/_next/static/chunks/x.js` in the raw HTML, even though the browser concatenates the pushes before parsing and the URL is intact at runtime.

An earlier version of this test scrubbed `/tenant-a/_next/…` from the whole response and grepped the remainder for `/_next/`. That produced false failures whenever a boundary happened to land after `/te`, which any change to dashboard page content can cause by shifting byte offsets. It also could not distinguish a healthy page from a genuinely broken one — both reported a single leftover.

Scanning `src`/`href` attributes avoids this: attribute values are always emitted whole. Fetching each one additionally verifies the asset actually resolves under the prefix, which is the property that matters.

## Running
```bash
chainsaw test
```

A successful run confirms the placeholder-substitution mechanism in `services/ark-dashboard/entrypoint.sh` produces a working dashboard under any prefix.

## CI
Labelled `requires-images: "true"`. CI plumbs `ARK_DASHBOARD_IMAGE` and `ARK_DASHBOARD_IMAGE_TAG` into the standard E2E step so the test uses the image built from the current commit.

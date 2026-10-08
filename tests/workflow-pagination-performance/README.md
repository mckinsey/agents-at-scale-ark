# Workflow Pagination Performance

Proves, against a real ark-api deployment and real Kubernetes objects, that
listing Argo `Workflow` resources through `/v1/resources/apis/argoproj.io/v1alpha1/Workflow`
paginates at the Kubernetes API (via `limit`/`continue`) instead of ark-api
loading the whole collection and slicing a page out of memory. See
[#3605](https://github.com/mckinsey/agents-at-scale-ark/issues/3605).

## What it tests

- Deploys the `ark-api` chart with this build's image (`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG`)
  and the Argo Workflow CRD (controller/server disabled - only the CRD is
  needed, nothing actually executes).
- Creates 250 real `Workflow` objects in the test namespace.
- Hits the live endpoint with `limit=20` vs `limit=1000` and compares the
  real response byte size and latency reported by `curl`, asserting the
  small page is meaningfully smaller than the full-collection fetch.
- Walks every page via the `continue` cursor and asserts the union of pages
  is exactly the 250 created workflows, with no duplicates or gaps.

## Running

```bash
ARK_API_IMAGE=ghcr.io/mckinsey/agents-at-scale-ark/ark-api \
ARK_API_IMAGE_TAG=<tag> \
chainsaw test ./workflow-pagination-performance
```

`ARK_API_IMAGE`/`ARK_API_IMAGE_TAG` are optional - omit them to use the
chart's default published image.

Successful completion proves server-side pagination is real: a small page
costs a fraction of the bytes and time of loading the whole collection, and
the cursor-based pages never lose or duplicate an item.

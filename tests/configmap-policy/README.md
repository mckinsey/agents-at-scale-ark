# Configmap Policy Test

Checks the ValidatingAdmissionPolicy that limits ark-api to the configmaps it owns.

## What it tests

- Denies a configmap without the `ark.mckinsey.com/resource-type: configuration` marker
- Allows `ark-export-metadata` and `marketplace-sources`, which the export and
  marketplace endpoints write without a marker
- Allows creating and updating a configuration
- Denies adding the marker to an existing configmap, so ark-api cannot adopt one
  it did not create

The policy is rendered from `services/ark-api/chart` into the test namespace and
exercised with `kubectl --as`, since it matches on the service account username.

Requires Kubernetes 1.30 or later.

## Running
```bash
chainsaw test
```

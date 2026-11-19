# Marketplace install fixture

Test chart for marketplace installs, shared by the ark-api preview tests and the `tests/marketplace-install` chainsaw suite.

```bash
# Render one variant.
helm template demo mkt-fixture --namespace tenant-a --include-crds --set variant=rbac

# Publish every variant to a local registry as oci://localhost:5000/charts/fixture-<variant>.
docker run -d -p 5000:5000 registry:2
./package.sh localhost:5000
```

The variants and what each one tests are listed in `mkt-fixture/values.yaml`.

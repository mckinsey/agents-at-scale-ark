# marketplace-install

Marketplace installs through a real ark-api in `AUTH_MODE=sso` with impersonation, users from Dex (`alice@ark.local`, `bob@ark.local`) and the real `ark-tenant` chart in two namespaces: `<ns>-ta` (Pod Security `restricted`, alice installs) and `<ns>-tb` (bob installs).

The fixture chart (`fixture/`) is published to an in-cluster `registry:2` through a port-forward, and a catalogue served by nginx lists its variants with `ark.installable: true`. ark-api allows that registry through `MARKETPLACE_INSTALL_REGISTRY_ALLOWLIST` and pulls it over plain HTTP through `MARKETPLACE_INSTALL_PLAIN_HTTP_REGISTRIES`.

ark-api runs with short install limits (helm 120 s, outer timeout 40 s, Job deadline 90 s) so that `fixture-slow` times out through the pod failure policy and a zero pod quota ends in `timed-out` within the test. Between cases the test removes releases and install Jobs as the cleanup runbook does, and deletes the install lock as ark-api's ServiceAccount, the only identity the admission policy lets touch it.

Needs `helm`, `jq` and `kubectl` on the host, and the ark-api image in `ARK_API_IMAGE` / `ARK_API_IMAGE_TAG`.

```bash
chainsaw test --test-dir tests/marketplace-install
```

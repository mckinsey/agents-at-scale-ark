# marketplace-install

Marketplace installs through a real ark-api in `AUTH_MODE=sso` with impersonation, users from Dex (`alice@ark.local`, `bob@ark.local`) and the real `ark-tenant` chart in two namespaces: `<ns>-ta` (Pod Security `restricted`, alice installs) and `<ns>-tb` (bob installs).

The fixture chart (`fixture/`) is published to an in-cluster `registry:2` through a port-forward, and a catalogue served by nginx lists its variants with `ark.installable: true`. ark-api allows that registry through `MARKETPLACE_INSTALL_REGISTRY_ALLOWLIST` and pulls it over plain HTTP through `MARKETPLACE_INSTALL_PLAIN_HTTP_REGISTRIES`.

Needs `helm`, `jq` and `kubectl` on the host, and the ark-api image in `ARK_API_IMAGE` / `ARK_API_IMAGE_TAG`.

```bash
chainsaw test --test-dir tests/marketplace-install
```

# Inline Tool Negative Egress Test

A runner cannot open an egress connection to an internal endpoint.

## What it tests
- The runner NetworkPolicy denies all egress (its `policyTypes` include `Egress`
  with no egress rules).
- An inline tool that attempts a TCP connection to the Kubernetes API service
  ClusterIP — an internal endpoint the runner must not reach — reports the
  connection was refused/timed out, while the call itself still completes
  (ingress from the activator is unaffected).

## Prerequisites
Labelled `inline-tools: "true"` and excluded from the standard e2e run. This
assertion only holds on an **enforcing CNI** (k3s flannel does not enforce
NetworkPolicy). The dedicated inline e2e job installs Calico, which enforces it;
locally, start a Colima profile with `--k3s-arg='--flannel-backend=none'
--k3s-arg='--disable-network-policy'` and install Calico. The test pins to the
watched `default` namespace.

## Running
```bash
chainsaw test --test-dir inline-tool-egress --selector inline-tools
```

# apiserver-policy

Validates native `ValidatingAdmissionPolicy` (CEL) enforcement on Ark resources in apiserver mode — the supported alternative to third-party webhook engines, which cannot fire on aggregated resources (#2684).

## What it tests
- A CEL `ValidatingAdmissionPolicy` (require the `example.com/reviewed` label on Agents) **blocks** a non-conforming Agent over the proxied path.
- A conforming Agent (with the label) is **accepted**.
- The same policy **blocks** a non-conforming Agent submitted over the **direct service path** (`ark-apiserver.ark-system.svc:6443`), proving enforcement covers the path that bypasses the main kube-apiserver.

## Requirements
- Host cluster **k8s ≥1.30** (`ValidatingAdmissionPolicy` is GA). CI runs k8s 1.35. On older hosts ARK logs a warning and CEL enforcement is disabled (in-process validation + audit still apply), so this test targets the `postgresql` backend matrix on modern clusters.

## Running
```bash
chainsaw test
```

Successful completion validates that operators can enforce policy on Ark resources in apiserver mode via a Kubernetes-native, in-process enforcement point.

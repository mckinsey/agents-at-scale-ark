# Demo Namespaces

Example namespace configurations for Ark demos. These namespaces will automatically appear on the landing page.

## Creating Demo Namespaces

```bash
kubectl apply -f kyc-demo.yaml
```

## Labels Required

For a namespace to appear as a demo on the landing page:

- **Label:** `ark.mckinsey.com/demo: "true"` (required)
- **Annotation:** `ark.mckinsey.com/demo-name: "Display Name"` (optional, defaults to namespace name)
- **Annotation:** `ark.mckinsey.com/demo-description: "Description text"` (optional)

## Next Steps

After creating namespaces, deploy Ark services into each:

```bash
# Deploy Ark dashboard and API to kyc-demo namespace
cd services/ark-dashboard
devspace deploy -n kyc-demo

cd ../ark-api
devspace deploy -n kyc-demo
```

## Accessing Demos

### Local Development (minikube)

Run `minikube tunnel` to expose LoadBalancer:
```bash
minikube tunnel
# Keep this running - requires sudo
```

Then access the same URLs above.

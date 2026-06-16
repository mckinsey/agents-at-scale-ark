# ARK Dashboard

Next.js web application for managing ARK models, teams, agents, and runtime resources.

## Quickstart
```bash
make help                    # Show available commands
make ark-dashboard-install   # Setup dependencies
make ark-dashboard-dev       # Run development server
```

## Environment Variables

### Authentication
| Variable | Description | Values |
|----------|-------------|--------|
| `AUTH_MODE` | Authentication mode | `sso` or empty (open mode) |

### Analytics / Observability
| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_ANALYTICS_PROVIDER` | Analytics provider | `dynatrace` or `noop` |
| `NEXT_PUBLIC_DYNATRACE_RUM_URL` | Dynatrace RUM script URL | `https://{env}.live.dynatrace.com/...` |

To enable Dynatrace RUM:
1. Set `NEXT_PUBLIC_ANALYTICS_PROVIDER=dynatrace`
2. Set `NEXT_PUBLIC_DYNATRACE_RUM_URL` to your Dynatrace JavaScript agent URL (found in Settings > Web and mobile monitoring > RUM JavaScript tag)

### Dashboard Settings
| Variable | Description |
|----------|-------------|
| `ARK_DASHBOARD_BASE_PATH` | URL prefix the dashboard is served under (e.g. `/namespace1`). Substituted at container startup; no rebuild required. Default empty (root hosting). |
| `NEXT_PUBLIC_BASE_PATH` | Mirror of `ARK_DASHBOARD_BASE_PATH` exposed to client code via the API URL helper. Substituted at the same time. Set this and `ARK_DASHBOARD_BASE_PATH` to the same value. |
| `ARK_DASHBOARD_ASSET_PREFIX` | Asset prefix for CDN-hosted static files. Default empty (assets served from the same origin). |

When `ARK_DASHBOARD_BASE_PATH` is set, the cluster's Ingress or Gateway must
also route `<basePath>/api/v1/*` to ark-api (with the prefix stripped) and
`<basePath>/*` to the dashboard. See the multi-tenant hosting guide in
`docs/` for the full per-tenant deployment pattern and chart example
`chart/values-multi-tenant.example.yaml`.

## Notes
- Requires Node.js 24+ and npm
- Run commands from repository root directory
- Accesses ARK API backend (default: http://localhost:8080/api)

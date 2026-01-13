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
| `ARK_DASHBOARD_BASE_PATH` | Base path if serving under a subpath |
| `ARK_DASHBOARD_ASSET_PREFIX` | Asset prefix for CDN |

## Notes
- Requires Node.js 24+ and npm
- Run commands from repository root directory
- Accesses ARK API backend (default: http://localhost:8080/api)

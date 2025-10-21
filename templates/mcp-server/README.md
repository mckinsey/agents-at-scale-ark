# {{ .Values.mcpServerName }} MCP Server

{{ .Values.description }}

## Prerequisites

- Kubernetes 1.19+
- Helm 3.2.0+
  {{- if .Values.requiresAuth }}
- Authentication credentials configured
  {{- end }}

## Installation

### 1. Build the Docker Image

```bash
cd /path/to/{{ .Values.mcpServerName }}
docker build -t {{ .Values.mcpServerName }}:latest .
```

### 2. Install the Helm Chart

```bash
# Install the MCP server
helm install {{ .Values.mcpServerName }}-mcp ./chart \
{{- if .Values.requiresAuth }}
  --set auth.token="your-auth-token"
{{- end }}
{{- if .Values.hasCustomConfig }}
  --set config.customValue="your-config-value"
{{- end }}

# Or install with values file
helm install {{ .Values.mcpServerName }}-mcp ./chart \
  --values example-values.yaml
```

### 3. Deploy Agent and Query (Optional)

```bash
# Deploy the example agent and query that use the MCP server
kubectl apply -f examples/{{ .Values.mcpServerName }}-agent.yaml
```

### 4. Verify Installation

```bash
kubectl get pods -l app.kubernetes.io/name={{ .Values.mcpServerName }}
kubectl get mcpservers
kubectl get agents
kubectl get queries
```

## Configuration

### Helm Values

| Key                | Type   | Default                         | Description        |
| ------------------ | ------ | ------------------------------- | ------------------ |
| `replicaCount`     | int    | `1`                             | Number of replicas |
| `image.repository` | string | `"{{ .Values.mcpServerName }}"` | Image repository   |
| `image.tag`        | string | `"latest"`                      | Image tag          |
| `service.port`     | int    | `8080`                          | Service port       |
| `mcpServer.timeout` | string | `"30s"`                        | Timeout for MCP tool calls (e.g., "5m", "10m") |

{{- if .Values.requiresAuth }}
| `auth.token` | string | `""` | Authentication token |
| `auth.existingSecret` | string | `""` | Existing secret name for auth |
{{- end }}
{{- if .Values.hasCustomConfig }}
| `config.customValue` | string | `""` | Custom configuration value |
{{- end }}

### Environment Variables

{{- if .Values.requiresAuth }}

- `AUTH_TOKEN`: Authentication token for the service
  {{- end }}
  {{- if .Values.hasCustomConfig }}
- `CUSTOM_CONFIG`: Custom configuration for the MCP server
  {{- end }}

## MCP Tools

The {{ .Values.mcpServerName }} MCP server provides these tools:

{{- range .Values.tools }}

- `{{ .name }}` - {{ .description }}
  {{- end }}

## Docker Usage

Run the container directly:

```bash
docker build -t {{ .Values.mcpServerName }} .
docker run -p 8080:8080 {{ .Values.mcpServerName }}
```

The server will be available at `http://localhost:8080/mcp`

## Development

### Local Development

1. Install dependencies:

```bash
{{ .Values.packageManager }} install
```

2. Run the server:

```bash
{{ .Values.packageManager }} start
```

3. Test the MCP server:

```bash
# Using MCP Inspector or similar tool
mcp-inspector http://localhost:8080/mcp
```

### Testing

```bash
{{ .Values.packageManager }} test
```

## Architecture

This MCP server is built using:

- **{{ .Values.technology }}**: Core MCP server implementation
- **mcp-proxy**: HTTP transport layer for the MCP protocol
- **Kubernetes**: Container orchestration and deployment
- **Helm**: Package management and configuration

## Examples

See the `examples/` directory for:

- Agent configurations using this MCP server
- Query examples
- Integration patterns

## Troubleshooting

### Common Issues

1. **Connection refused**: Check if the service is running and port 8080 is accessible
2. **Authentication failed**: Verify auth token configuration
3. **Tool not found**: Ensure the MCP server is properly registered

### Logs

```bash
# Check pod logs
kubectl logs -l app.kubernetes.io/name={{ .Values.mcpServerName }}

# Check MCP server registration
kubectl describe mcpserver {{ .Values.mcpServerName }}
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

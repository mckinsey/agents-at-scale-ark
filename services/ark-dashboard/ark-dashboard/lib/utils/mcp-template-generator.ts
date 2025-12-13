interface McpProxyConfig {
  name: string;
  namespace: string;
  image: string;
  command: string[];
  args: string[];
  env?: Record<string, string>;
}

export function generateMcpProxyYaml(config: McpProxyConfig): string {
  const { name, namespace, image, command, args, env } = config;
  const safeName = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
  const appLabel = `mcp-server-${safeName}`;

  const envBlock = env
    ? `
        env:
${Object.entries(env)
  .map(([k, v]) => `        - name: ${k}\n          value: "${v}"`)
  .join('\n')}`
    : '';

  // Construct the command string for mcpproxy to execute
  // We join commands and args. Be careful with quoting in a real shell,
  // but here we pass it as a single string to mcpproxy --stdio "..."
  const fullCommand = [...command, ...args].join(' ');

  return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${safeName}
  namespace: ${namespace}
  labels:
    app: ${appLabel}
spec:
  replicas: 1
  selector:
    matchLabels:
      app: ${appLabel}
  template:
    metadata:
      labels:
        app: ${appLabel}
    spec:
      volumes:
      - name: mcp-bin
        emptyDir: {}
      initContainers:
      - name: inject-mcpproxy
        image: ghcr.io/anthropics/mcpproxy:latest
        command: ["/bin/sh", "-c"]
        args: ["cp $(which mcpproxy) /mcp-bin/mcpproxy"]
        volumeMounts:
        - name: mcp-bin
          mountPath: /mcp-bin
      containers:
      - name: mcp-server
        image: ${image}
        command: ["/mcp-bin/mcpproxy"]
        args:
        - "--stdio"
        - "${fullCommand}"${envBlock}
        start: true
        ports:
        - containerPort: 8080
        volumeMounts:
        - name: mcp-bin
          mountPath: /mcp-bin
---
apiVersion: v1
kind: Service
metadata:
  name: ${safeName}
  namespace: ${namespace}
spec:
  selector:
    app: ${appLabel}
  ports:
  - port: 80
    targetPort: 8080
---
apiVersion: ark.mckinsey.com/v1alpha1
kind: MCPServer
metadata:
  name: ${safeName}
  namespace: ${namespace}
spec:
  transport: sse
  address:
    value: http://${safeName}.${namespace}.svc.cluster.local:80/sse
`;
}

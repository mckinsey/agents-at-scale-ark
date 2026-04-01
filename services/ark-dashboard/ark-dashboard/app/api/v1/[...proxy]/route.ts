import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

// Mock YAML export data for different resource types
const generateYAML = (resourceType: string, resourceName: string) => {
  const templates: Record<string, string> = {
    agents: `apiVersion: v1alpha1
kind: Agent
metadata:
  name: ${resourceName}
  namespace: default
spec:
  model: openai-gpt-4
  prompt: |
    You are a helpful assistant.
  tools:
    - type: "Tool"
      name: "calculator"`,

    models: `apiVersion: v1alpha1
kind: Model
metadata:
  name: ${resourceName}
  namespace: default
spec:
  provider: openai
  endpoint: https://api.openai.com/v1
  model: gpt-4
  parameters:
    temperature: 0.7
    maxTokens: 2000`,

    secrets: `apiVersion: v1
kind: Secret
metadata:
  name: ${resourceName}
  namespace: default
type: Opaque
data:
  # Secret values are not exported for security reasons
  key: <REDACTED>`,

    teams: `apiVersion: v1alpha1
kind: Team
metadata:
  name: ${resourceName}
  namespace: default
spec:
  agents:
    - name: agent-1
    - name: agent-2
  hierarchy:
    type: flat`,

    'mcp-servers': `apiVersion: v1alpha1
kind: MCPServer
metadata:
  name: ${resourceName}
  namespace: default
spec:
  image: mcpserver/github:latest
  port: 3000
  env:
    - name: GITHUB_TOKEN
      valueFrom:
        secretKeyRef:
          name: github-credentials
          key: token`,

    memories: `apiVersion: v1alpha1
kind: Memory
metadata:
  name: ${resourceName}
  namespace: default
spec:
  type: vector
  provider: pgvector
  capacity: 1000`,

    'workflow-templates': `apiVersion: v1alpha1
kind: WorkflowTemplate
metadata:
  name: ${resourceName}
  namespace: default
spec:
  steps:
    - name: step1
      agent: agent-1
      input: "Process data"
    - name: step2
      agent: agent-2
      dependsOn: [step1]`,

  };

  return (
    templates[resourceType] ||
    `# ${resourceType} - ${resourceName}\n# No template available`
  );
};

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ proxy: string[] }> },
) {
  const params = await context.params;
  const path = params.proxy.join('/');

  // Handle export endpoints
  const exportMatch = path.match(
    /^(agents|models|secrets|teams|mcp-servers|memories|workflow-templates)\/(.+)\/export$/,
  );

  if (exportMatch) {
    const [, resourceType, resourceName] = exportMatch;
    const yaml = generateYAML(resourceType, resourceName);

    return new NextResponse(yaml, {
      status: 200,
      headers: {
        'Content-Type': 'text/yaml',
        'Content-Disposition': `attachment; filename="${resourceName}.yaml"`,
      },
    });
  }

  // For other endpoints, return mock data or proxy to actual backend
  // This is a simplified mock - in production, you would proxy to the actual backend
  return NextResponse.json(
    {
      message: 'API endpoint not implemented',
      path: path,
    },
    { status: 501 },
  );
}

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    {
      message: 'API endpoint not implemented',
    },
    { status: 501 },
  );
}

export async function PUT(_request: NextRequest) {
  return NextResponse.json(
    {
      message: 'API endpoint not implemented',
    },
    { status: 501 },
  );
}

export async function DELETE(_request: NextRequest) {
  return NextResponse.json(
    {
      message: 'API endpoint not implemented',
    },
    { status: 501 },
  );
}

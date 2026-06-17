import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { SESSION_COOKIE_NAME } from '@/lib/auth/auth-config';

interface RouteContext {
  params: Promise<{ proxy: string[] }>;
}

interface BackendFetchOptions extends RequestInit {
  duplex?: 'half';
}

const MOCK_EXPORT_TEMPLATES: Record<string, (name: string) => string> = {
  agents: (name) => `apiVersion: v1alpha1
kind: Agent
metadata:
  name: ${name}
  namespace: default
spec:
  model: openai-gpt-4
  prompt: |
    You are a helpful assistant.
  tools:
    - type: "Tool"
      name: "calculator"`,
  models: (name) => `apiVersion: v1alpha1
kind: Model
metadata:
  name: ${name}
  namespace: default
spec:
  provider: openai
  endpoint: https://api.openai.com/v1
  model: gpt-4
  parameters:
    temperature: 0.7
    maxTokens: 2000`,
  secrets: (name) => `apiVersion: v1
kind: Secret
metadata:
  name: ${name}
  namespace: default
type: Opaque
data:
  # Secret values are not exported for security reasons
  key: <REDACTED>`,
  teams: (name) => `apiVersion: v1alpha1
kind: Team
metadata:
  name: ${name}
  namespace: default
spec:
  agents:
    - name: agent-1
    - name: agent-2
  hierarchy:
    type: flat`,
  'mcp-servers': (name) => `apiVersion: v1alpha1
kind: MCPServer
metadata:
  name: ${name}
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
  memories: (name) => `apiVersion: v1alpha1
kind: Memory
metadata:
  name: ${name}
  namespace: default
spec:
  type: vector
  provider: pgvector
  capacity: 1000`,
  'workflow-templates': (name) => `apiVersion: v1alpha1
kind: WorkflowTemplate
metadata:
  name: ${name}
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

function generateYAML(resourceType: string, resourceName: string): string {
  const template = MOCK_EXPORT_TEMPLATES[resourceType];
  return template
    ? template(resourceName)
    : `# ${resourceType} - ${resourceName}\n# No template available`;
}

function backendBaseUrl(): string {
  const host = process.env.ARK_API_SERVICE_HOST || 'localhost';
  const port = process.env.ARK_API_SERVICE_PORT || '8000';
  const protocol = process.env.ARK_API_SERVICE_PROTOCOL || 'http';
  return `${protocol}://${host}:${port}`;
}

async function proxyToArkApi(
  request: NextRequest,
  proxyPath: string[],
): Promise<Response> {
  const backendPath = `/v1/${proxyPath.join('/')}`;
  const targetUrl = `${backendBaseUrl()}${backendPath}${request.nextUrl.search}`;

  // Mint a bearer for ark-api from the NextAuth session JWT. In open mode the
  // cookie is absent and getToken returns null, so no Authorization header is
  // added — matching the prior in-process middleware (proxy.ts before commit
  // b16307122) so SSO deployments keep authenticating against ark-api.
  const token = await getToken({
    req: request,
    secret: process.env.AUTH_SECRET,
    cookieName: SESSION_COOKIE_NAME,
  });

  const headers = new Headers(request.headers);
  headers.set('X-Forwarded-Prefix', '/api');
  const hostHeader = request.headers.get('host');
  if (hostHeader) {
    headers.set('X-Forwarded-Host', hostHeader);
  }
  headers.set('X-Forwarded-Proto', request.nextUrl.protocol.slice(0, -1));
  // The dashboard pod talks to ark-api on its cluster Service; drop the
  // browser-side Host header so the backend sees the right authority.
  headers.delete('host');

  if (
    token &&
    typeof token === 'object' &&
    'access_token' in token &&
    typeof token.access_token === 'string'
  ) {
    headers.set('Authorization', `Bearer ${token.access_token}`);
  }

  const fetchOptions: BackendFetchOptions = {
    method: request.method,
    headers,
    signal: request.signal,
  };

  if (request.body && request.method !== 'GET' && request.method !== 'HEAD') {
    fetchOptions.body = request.body;
    fetchOptions.duplex = 'half';
  }

  const backendResponse = await fetch(targetUrl, fetchOptions);

  const responseHeaders = new Headers(backendResponse.headers);
  // Hop-by-hop and content-length headers can confuse Next.js's response
  // pipeline when the body is streamed back; let Node recompute them.
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');
  responseHeaders.delete('connection');

  return new Response(backendResponse.body, {
    status: backendResponse.status,
    statusText: backendResponse.statusText,
    headers: responseHeaders,
  });
}

export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const params = await context.params;
  const path = params.proxy.join('/');

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

  return proxyToArkApi(request, params.proxy);
}

export async function POST(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const params = await context.params;
  return proxyToArkApi(request, params.proxy);
}

export async function PUT(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const params = await context.params;
  return proxyToArkApi(request, params.proxy);
}

export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const params = await context.params;
  return proxyToArkApi(request, params.proxy);
}

export async function DELETE(
  request: NextRequest,
  context: RouteContext,
): Promise<Response> {
  const params = await context.params;
  return proxyToArkApi(request, params.proxy);
}

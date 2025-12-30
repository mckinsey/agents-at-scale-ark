import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ARGO_SERVER_URL =
  process.env.ARGO_SERVER_URL ||
  'http://argo-workflows-server.argo-workflows.svc.cluster.local:2746';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const namespace = searchParams.get('namespace') || 'default';

  try {
    const response = await fetch(
      `${ARGO_SERVER_URL}/api/v1/workflow-templates/${namespace}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const data = await response.json();

    if (!response.ok || data.code) {
      console.warn(
        `Argo API error for namespace ${namespace}:`,
        data.message || response.status,
      );
      return NextResponse.json([]);
    }

    const templates = (data.items || []).map(
      (item: {
        metadata: {
          name: string;
          namespace: string;
          annotations?: Record<string, string>;
        };
        spec: {
          arguments?: {
            parameters?: Array<{
              name: string;
              default?: string;
              description?: string;
            }>;
          };
          templates?: Array<{ name: string }>;
        };
      }) => ({
        name: item.metadata.name,
        namespace: item.metadata.namespace,
        description:
          item.metadata.annotations?.['workflows.argoproj.io/description'],
        parameters: (item.spec.arguments?.parameters || []).map(p => ({
          name: p.name,
          value: p.default || '',
          description: p.description,
        })),
      }),
    );

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching workflow templates:', error);
    return NextResponse.json(
      { error: 'Failed to connect to Argo server' },
      { status: 500 },
    );
  }
}

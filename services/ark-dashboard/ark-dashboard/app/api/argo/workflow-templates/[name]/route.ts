import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ARGO_SERVER_URL =
  process.env.ARGO_SERVER_URL ||
  'http://argo-workflows-server.argo-workflows.svc.cluster.local:2746';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params;
  const searchParams = request.nextUrl.searchParams;
  const namespace = searchParams.get('namespace') || 'default';

  try {
    const response = await fetch(
      `${ARGO_SERVER_URL}/api/v1/workflow-templates/${namespace}/${name}`,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json(
          { error: 'Workflow template not found' },
          { status: 404 },
        );
      }
      return NextResponse.json(
        { error: 'Failed to fetch workflow template' },
        { status: response.status },
      );
    }

    const item = await response.json();

    const template = {
      name: item.metadata.name,
      namespace: item.metadata.namespace,
      description:
        item.metadata.annotations?.['workflows.argoproj.io/description'],
      parameters: item.spec.arguments?.parameters || [],
    };

    return NextResponse.json(template);
  } catch (error) {
    console.error('Error fetching workflow template:', error);
    return NextResponse.json(
      { error: 'Failed to connect to Argo server' },
      { status: 500 },
    );
  }
}

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ARGO_SERVER_URL =
  process.env.ARGO_SERVER_URL ||
  'http://argo-workflows-server.argo-workflows.svc.cluster.local:2746';

interface SubmitWorkflowRequest {
  templateName: string;
  namespace: string;
  parameters: Array<{ name: string; value: string }>;
  labels?: Record<string, string>;
}

interface ArgoWorkflow {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    labels?: Record<string, string>;
  };
  spec: {
    workflowTemplateRef?: { name: string };
  };
  status?: {
    phase?: string;
    startedAt?: string;
    finishedAt?: string;
    message?: string;
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const namespace = searchParams.get('namespace') || '';
  const templateName = searchParams.get('templateName') || '';
  const labelSelector = searchParams.get('labelSelector') || '';

  try {
    const namespaces = namespace ? [namespace] : ['default', 'argo-workflows'];

    const allWorkflows: ArgoWorkflow[] = [];

    for (const ns of namespaces) {
      let url = `${ARGO_SERVER_URL}/api/v1/workflows/${ns}`;
      if (labelSelector) {
        url += `?listOptions.labelSelector=${encodeURIComponent(labelSelector)}`;
      }

      const response = await fetch(url, {
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const data = await response.json();
        allWorkflows.push(...(data.items || []));
      }
    }

    let workflows = allWorkflows.map((w: ArgoWorkflow) => ({
      name: w.metadata.name,
      namespace: w.metadata.namespace,
      templateName: w.spec.workflowTemplateRef?.name || '',
      phase: w.status?.phase || 'Pending',
      startedAt: w.status?.startedAt || w.metadata.creationTimestamp,
      finishedAt: w.status?.finishedAt,
      message: w.status?.message,
      labels: w.metadata.labels,
    }));

    if (templateName) {
      workflows = workflows.filter(w => w.templateName === templateName);
    }

    workflows.sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

    return NextResponse.json(workflows);
  } catch (error) {
    console.error('Error fetching workflows:', error);
    return NextResponse.json(
      { error: 'Failed to connect to Argo server' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body: SubmitWorkflowRequest = await request.json();
    const { templateName, namespace, parameters, labels } = body;

    const nonEmptyParameters = parameters.filter(p => p.value !== '');

    const workflowSpec = {
      apiVersion: 'argoproj.io/v1alpha1',
      kind: 'Workflow',
      metadata: {
        generateName: `${templateName}-`,
        namespace,
        labels: {
          ...labels,
          'ark-managed': 'true',
        },
      },
      spec: {
        workflowTemplateRef: {
          name: templateName,
        },
        ...(nonEmptyParameters.length > 0 && {
          arguments: {
            parameters: nonEmptyParameters.map(p => ({
              name: p.name,
              value: p.value,
            })),
          },
        }),
      },
    };

    const response = await fetch(
      `${ARGO_SERVER_URL}/api/v1/workflows/${namespace}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workflow: workflowSpec }),
      },
    );

    if (!response.ok) {
      const errorData = await response.text();
      console.error('Argo API error:', errorData);
      return NextResponse.json(
        { error: 'Failed to submit workflow', details: errorData },
        { status: response.status },
      );
    }

    const result = await response.json();
    return NextResponse.json({
      name: result.metadata.name,
      namespace: result.metadata.namespace,
      status: result.status?.phase || 'Pending',
    });
  } catch (error) {
    console.error('Error submitting workflow:', error);
    return NextResponse.json(
      { error: 'Failed to submit workflow' },
      { status: 500 },
    );
  }
}

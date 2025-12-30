import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

const ARGO_SERVER_URL =
  process.env.ARGO_SERVER_URL ||
  'http://argo-workflows-server.argo-workflows.svc.cluster.local:2746';

interface WorkflowNode {
  id: string;
  displayName: string;
  type: string;
  phase: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  templateName?: string;
  outputs?: {
    parameters?: Array<{ name: string; value?: string }>;
    exitCode?: string;
  };
}

interface RouteContext {
  params: Promise<{ namespace: string; name: string }>;
}

export async function GET(request: NextRequest, context: RouteContext) {
  const { namespace, name } = await context.params;

  try {
    const workflowResponse = await fetch(
      `${ARGO_SERVER_URL}/api/v1/workflows/${namespace}/${name}`,
      { headers: { 'Content-Type': 'application/json' } },
    );

    if (!workflowResponse.ok) {
      return NextResponse.json(
        { error: 'Workflow not found' },
        { status: workflowResponse.status },
      );
    }

    const workflow = await workflowResponse.json();

    const nodes: WorkflowNode[] = [];
    if (workflow.status?.nodes) {
      for (const [id, node] of Object.entries(
        workflow.status.nodes as Record<string, WorkflowNode>,
      )) {
        nodes.push({
          id,
          displayName: (node as WorkflowNode).displayName,
          type: (node as WorkflowNode).type,
          phase: (node as WorkflowNode).phase,
          startedAt: (node as WorkflowNode).startedAt,
          finishedAt: (node as WorkflowNode).finishedAt,
          message: (node as WorkflowNode).message,
          templateName: (node as WorkflowNode).templateName,
          outputs: (node as WorkflowNode).outputs,
        });
      }
    }

    nodes.sort(
      (a, b) =>
        new Date(a.startedAt || 0).getTime() -
        new Date(b.startedAt || 0).getTime(),
    );

    const logsResponse = await fetch(
      `${ARGO_SERVER_URL}/api/v1/workflows/${namespace}/${name}/log?logOptions.container=main`,
      { headers: { 'Content-Type': 'application/json' } },
    );

    const logsByPod: Record<string, string[]> = {};

    if (logsResponse.ok) {
      const logsText = await logsResponse.text();
      const lines = logsText.trim().split('\n');

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line);
          const podName = parsed.result?.podName || 'unknown';
          const content = parsed.result?.content;
          if (content !== undefined) {
            if (!logsByPod[podName]) logsByPod[podName] = [];
            logsByPod[podName].push(content);
          }
        } catch {
          // Skip malformed lines
        }
      }
    }

    return NextResponse.json({
      name: workflow.metadata.name,
      namespace: workflow.metadata.namespace,
      templateName: workflow.spec.workflowTemplateRef?.name,
      phase: workflow.status?.phase || 'Pending',
      startedAt: workflow.status?.startedAt,
      finishedAt: workflow.status?.finishedAt,
      message: workflow.status?.message,
      nodes: nodes.filter(n => n.type === 'Pod'),
      logsByPod,
    });
  } catch (error) {
    console.error('Error fetching workflow:', error);
    return NextResponse.json(
      { error: 'Failed to fetch workflow' },
      { status: 500 },
    );
  }
}

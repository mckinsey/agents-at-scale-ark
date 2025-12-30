export interface WorkflowRun {
  name: string;
  namespace: string;
  templateName: string;
  phase: string;
  startedAt: string;
  finishedAt?: string;
  message?: string;
  labels?: Record<string, string>;
}

export interface WorkflowNode {
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

export interface WorkflowDetail {
  name: string;
  namespace: string;
  templateName?: string;
  phase: string;
  startedAt?: string;
  finishedAt?: string;
  message?: string;
  nodes: WorkflowNode[];
  logsByPod: Record<string, string[]>;
}

export interface WorkflowTemplate {
  name: string;
  namespace: string;
  description?: string;
  parameters: {
    name: string;
    value?: string;
    description?: string;
  }[];
}

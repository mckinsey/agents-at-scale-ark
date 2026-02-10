export interface ArgoWorkflowMetadata {
  name: string;
  namespace: string;
  creationTimestamp: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
  uid: string;
}

export interface ArgoWorkflowParameter {
  name: string;
  value: string;
}

export interface ArgoWorkflowSpec {
  arguments?: {
    parameters?: ArgoWorkflowParameter[];
  };
  entrypoint?: string;
  workflowTemplateRef?: {
    name: string;
  };
}

export interface ArgoNodeStatus {
  id: string;
  name: string;
  displayName: string;
  type:
    | 'Pod'
    | 'Steps'
    | 'StepGroup'
    | 'DAG'
    | 'Container'
    | 'Script'
    | 'Suspend';
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Error' | 'Skipped';
  startedAt?: string;
  finishedAt?: string;
  estimatedDuration?: number;
  progress?: string;
  message?: string;
  templateName?: string;
  children?: string[];
  outboundNodes?: string[];
  boundaryID?: string;
  hostNodeName?: string;
  podName?: string;
  inputs?: {
    parameters?: ArgoWorkflowParameter[];
    artifacts?: unknown[];
  };
  outputs?: {
    exitCode?: string;
    parameters?: ArgoWorkflowParameter[];
    artifacts?: unknown[];
  };
  resourcesDuration?: {
    cpu?: number;
    memory?: number;
  };
}

export interface ArgoWorkflowStatus {
  phase: 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Error';
  startedAt?: string;
  finishedAt?: string;
  estimatedDuration?: number;
  progress?: string;
  message?: string;
  nodes?: Record<string, ArgoNodeStatus>;
  artifactRepositoryRef?: {
    configMap: string;
    key: string;
    namespace: string;
  };
  conditions?: Array<{
    type: string;
    status: string;
  }>;
  resourcesDuration?: {
    cpu?: number;
    memory?: number;
  };
}

export interface ArgoWorkflow {
  apiVersion: string;
  kind: string;
  metadata: ArgoWorkflowMetadata;
  spec: ArgoWorkflowSpec;
  status: ArgoWorkflowStatus;
}

export interface ArgoWorkflowList {
  apiVersion: string;
  kind: string;
  items: ArgoWorkflow[];
}

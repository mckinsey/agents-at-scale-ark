export interface ArkConfig {
  defaultModel?: string;
  defaultAgent?: string;
  defaultNamespace?: string;
  apiBaseUrl?: string;
  kubeconfig?: string;
  currentContext?: string;
  kubeNamespace?: string;
}

export interface KubernetesConfig {
  kubeconfig: string;
  currentContext?: string;
  namespace?: string;
  inCluster: boolean;
}

export type DeploymentStatus =
  | 'available' // All replicas ready and available
  | 'progressing' // Deployment is rolling out
  | 'replicafailure' // Failed to create replicas
  | 'failed' // Deployment failed
  | 'not found' // Deployment doesn't exist
  | 'unknown'; // Unable to determine status

export type ServiceStatus = {
  name: string;
  status: 'healthy' | 'warning' | 'unhealthy' | 'not installed' | 'not ready';
  deploymentStatus?: DeploymentStatus;
  url?: string;
  version?: string;
  revision?: string;
  details?: string;
  isDev?: boolean;
  namespace?: string;
};

export interface DependencyStatus {
  name: string;
  installed: boolean;
  version?: string;
  details?: string;
}

export interface ModelStatus {
  exists: boolean;
  available?: boolean;
  provider?: string;
  details?: string;
}

export interface StatusData {
  services: ServiceStatus[];
  dependencies: DependencyStatus[];
  arkReady?: boolean;
  defaultModelExists?: boolean;
  defaultModel?: ModelStatus;
}

export interface CommandVersionConfig {
  command: string;
  versionArgs: string;
  versionExtract: (_output: string) => string;
}

// Minimal Kubernetes types - only fields we actually use
export interface K8sMetadata {
  name: string;
  namespace?: string;
  creationTimestamp?: string;
}

export interface K8sCondition {
  type: string;
  status: string;
  message?: string;
}

export interface K8sListResource<T> {
  items: T[];
}

// Helm types - only fields we use
export interface HelmRelease {
  name: string;
  app_version?: string;
  revision?: string;
}

// Deployment K8s types - only fields we use
export interface K8sDeployment {
  metadata: K8sMetadata;
  spec?: {
    replicas?: number;
  };
  status?: {
    readyReplicas?: number;
    availableReplicas?: number;
    conditions?: K8sCondition[];
  };
}

// ARK Model types - only fields we use
export interface Model {
  metadata: K8sMetadata;
  status?: ModelStatus;
}

// ARK Agent types - only fields we use
export interface Agent {
  metadata: K8sMetadata;
}

// ARK Team types - only fields we use
export interface Team {
  metadata: K8sMetadata;
}

// ARK Query types - only fields we use
export interface QueryTarget {
  type: string;
  name: string;
}

export interface QueryResponse {
  content?: string;
  a2a?: {
    contextId?: string;
  };
}

export interface QueryStatus {
  phase?: 'initializing' | 'running' | 'done' | 'error' | 'canceled';
  conditions?: K8sCondition[];
  response?: QueryResponse;
  message?: string;
  error?: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
  a2a?: {
    contextId?: string;
    taskId?: string;
  };
}

export interface Query {
  apiVersion: string;
  kind: 'Query';
  metadata: K8sMetadata;
  spec?: {
    input: string;
    target: QueryTarget;
    sessionId?: string;
    conversationId?: string;
    timeout?: string;
  };
  status?: QueryStatus;
}

// ARK Tool types - only fields we use
export interface Tool {
  metadata: K8sMetadata;
}

// Configuration types - only fields we use
export interface ClusterInfo {
  context?: string;
  cluster?: string;
  user?: string;
  namespace?: string;
}

// ARK Evaluation types - only fields we use
export interface EvaluationManifest {
  apiVersion: string;
  kind: 'Evaluation';
  metadata: {
    name: string;
  };
  spec: {
    type: 'direct' | 'query';
    evaluator: {
      name: string;
    };
    config: {
      input?: string;
      output?: string;
      queryRef?: {
        name: string;
      };
      responseTarget?: {
        type: string;
        name: string;
      };
    };
    timeout?: string;
    ttl?: string;
  };
}

export interface EvaluationStatus {
  phase?: 'pending' | 'running' | 'done' | 'error';
  score?: string;
  passed?: boolean;
  message?: string;
}

export interface Evaluation {
  metadata: {
    name: string;
  };
  status?: EvaluationStatus;
}

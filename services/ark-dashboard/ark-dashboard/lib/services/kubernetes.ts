import { APIClient } from '@/lib/api/client';

// Create a server-side API client for ark-api
// Use Kubernetes service DNS when running in cluster, fallback to localhost for local dev
const ARK_API_URL = process.env.ARK_API_URL || 'http://ark-api.default.svc.cluster.local';
const arkApiClient = new APIClient(ARK_API_URL);

interface DeploymentCondition {
  type: string;
  status: string;
  lastTransitionTime?: string;
  reason?: string;
  message?: string;
}

interface DeploymentStatus {
  replicas?: number;
  updatedReplicas?: number;
  readyReplicas?: number;
  availableReplicas?: number;
  conditions?: DeploymentCondition[];
}

interface DeploymentMetadata {
  name: string;
  namespace?: string;
  labels?: Record<string, string>;
  annotations?: Record<string, string>;
}

interface Deployment {
  apiVersion: string;
  kind: string;
  metadata: DeploymentMetadata;
  status?: DeploymentStatus;
}

interface DeploymentList {
  apiVersion: string;
  kind: string;
  items: Deployment[];
}

export async function checkLabeledDeployment(
  itemName: string,
  namespace: string
): Promise<boolean> {
  try {
    const labelSelector = `ark.mckinsey.com/marketplace-item=${itemName}`;
    const params = new URLSearchParams({
      namespace,
      labelSelector,
    });

    const deploymentList = await arkApiClient.get<DeploymentList>(
      `/v1/resources/apis/apps/v1/Deployment?${params.toString()}`
    );

    if (!deploymentList.items || deploymentList.items.length === 0) {
      return false;
    }

    const hasAvailableDeployment = deploymentList.items.some(deployment => {
      if (!deployment.status?.conditions) {
        return false;
      }

      return deployment.status.conditions.some(
        condition =>
          condition.type === 'Available' && condition.status === 'True'
      );
    });

    return hasAvailableDeployment;
  } catch (error) {
    console.error(
      `Error checking labeled deployment for ${itemName} in namespace ${namespace}:`,
      error
    );
    return false;
  }
}

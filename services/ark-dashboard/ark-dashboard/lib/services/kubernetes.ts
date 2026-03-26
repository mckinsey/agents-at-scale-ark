import { serverApiClient } from '@/lib/api/server-client';

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

    const deploymentList = await serverApiClient.get<DeploymentList>(
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
    // 404 is expected when deployment doesn't exist (item not installed)
    if (error instanceof Error && 'status' in error && (error as { status?: number }).status === 404) {
      return false;
    }

    // Log only unexpected errors
    console.error(
      `Error checking labeled deployment for ${itemName} in namespace ${namespace}:`,
      error
    );
    return false;
  }
}

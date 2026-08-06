import { APIError, apiClient } from '@/lib/api/client';
import type { AnnotationMap } from '@/lib/utils/resource-metadata';

const BASE_PATH = '/api/v1/resources/api/v1';

export const KubernetesKind = {
  SECRET: 'Secret',
  CONFIG_MAP: 'ConfigMap',
} as const;

export type KubernetesKind =
  (typeof KubernetesKind)[keyof typeof KubernetesKind];

export interface KubernetesObjectMeta {
  name: string;
  namespace?: string | null;
  uid?: string | null;
  annotations?: AnnotationMap | null;
  labels?: AnnotationMap | null;
}

export interface KubernetesResource {
  apiVersion?: string;
  kind?: string;
  metadata: KubernetesObjectMeta;
  type?: string | null;
  data?: AnnotationMap | null;
  stringData?: AnnotationMap | null;
}

interface KubernetesResourceList {
  items?: KubernetesResource[] | null;
}

interface KubernetesStatus {
  status?: string | null;
  message?: string | null;
  reason?: string | null;
  code?: number | null;
}

type KubernetesResponse<TResource> = TResource & Partial<KubernetesStatus>;

const FAILURE_STATUS = 'Failure';

function assertSuccess<TResource>(
  response: KubernetesResponse<TResource>,
): TResource {
  if (response?.status !== FAILURE_STATUS) return response;

  throw new APIError(
    response.message ?? 'The Kubernetes API rejected the request',
    response.code ?? undefined,
    response,
  );
}

export function decodeBase64(value: string | null | undefined): string {
  if (!value) return '';
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, character => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

export const kubernetesResourcesService = {
  async list(kind: KubernetesKind): Promise<KubernetesResource[]> {
    const response = await apiClient.get<
      KubernetesResponse<KubernetesResourceList>
    >(`${BASE_PATH}/${kind}`);
    return assertSuccess(response).items ?? [];
  },

  async get(kind: KubernetesKind, name: string): Promise<KubernetesResource> {
    const response = await apiClient.get<KubernetesResponse<KubernetesResource>>(
      `${BASE_PATH}/${kind}/${name}`,
    );
    return assertSuccess(response);
  },

  async create(
    kind: KubernetesKind,
    resource: KubernetesResource,
  ): Promise<KubernetesResource> {
    const response = await apiClient.post<
      KubernetesResponse<KubernetesResource>
    >(`${BASE_PATH}/${kind}`, resource);
    return assertSuccess(response);
  },

  async delete(kind: KubernetesKind, name: string): Promise<void> {
    const response =
      await apiClient.delete<KubernetesResponse<KubernetesResource>>(
        `${BASE_PATH}/${kind}/${name}`,
      );
    assertSuccess(response);
  },
};

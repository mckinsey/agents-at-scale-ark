import { trackEvent } from '@/lib/analytics/singleton';
import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api/generated/types';
import {
  type ResourceMetadata,
  preserveForeignAnnotations,
  readResourceMetadata,
  sameResourceMetadata,
  toResourceAnnotations,
  toResourceLabelMap,
} from '@/lib/utils/resource-metadata';

import {
  KubernetesKind,
  type KubernetesResource,
  byteLength,
  decodeBase64,
  kubernetesResourcesService,
} from './kubernetes-resources';

// Use the generated type from OpenAPI
export type Secret = components['schemas']['SecretResponse'];
export type SecretListResponse = components['schemas']['SecretListResponse'];
export type SecretCreateRequest = components['schemas']['SecretCreateRequest'];
export type SecretUpdateRequest = components['schemas']['SecretUpdateRequest'];
export type SecretDetailResponse =
  components['schemas']['SecretDetailResponse'];

export type SecretMetadata = ResourceMetadata;

interface SecretValue {
  value?: string | null;
}

export type SecretDetail = SecretDetailResponse & SecretMetadata & SecretValue;
export type SecretListItem = Secret & SecretMetadata;

const VALUE_KEY = 'token';

function toListItem(resource: KubernetesResource): SecretListItem {
  const { metadata } = resource;

  return {
    id: metadata.uid ?? metadata.name,
    name: metadata.name,
    annotations: metadata.annotations,
    ...readResourceMetadata({
      annotations: metadata.annotations,
      labels: metadata.labels,
    }),
  };
}

function toDetail(resource: KubernetesResource): SecretDetail {
  const { metadata } = resource;
  const data = resource.data ?? {};
  const value = decodeBase64(data[VALUE_KEY]);

  return {
    id: metadata.uid ?? metadata.name,
    name: metadata.name,
    type: resource.type ?? 'Opaque',
    keys: Object.keys(data).sort((a, b) => a.localeCompare(b)),
    secret_length: byteLength(value),
    annotations: metadata.annotations,
    value,
    ...readResourceMetadata({
      annotations: metadata.annotations,
      labels: metadata.labels,
    }),
  };
}

function toResource(
  name: string,
  password: string,
  metadata?: SecretMetadata,
  existing?: KubernetesResource,
): KubernetesResource {
  return {
    apiVersion: 'v1',
    kind: KubernetesKind.SECRET,
    metadata: {
      name,
      annotations: {
        ...preserveForeignAnnotations(existing?.metadata.annotations),
        ...toResourceAnnotations(metadata ?? {}),
      },
      labels: toResourceLabelMap(metadata?.labels),
    },
    type: existing?.type ?? 'Opaque',
    data: { ...(existing?.data ?? {}) },
    stringData: { [VALUE_KEY]: password },
  };
}

// Service with list operation
export const secretsService = {
  // Get all secrets for a given namespace
  async getAll(): Promise<SecretListItem[]> {
    const resources = await kubernetesResourcesService.list(
      KubernetesKind.SECRET,
    );
    return resources.map(toListItem);
  },

  // Get a single secret's details, including its stored value
  async get(name: string): Promise<SecretDetail> {
    const resource = await kubernetesResourcesService.get(
      KubernetesKind.SECRET,
      name,
    );
    return toDetail(resource);
  },

  // Create a new secret
  async create(
    name: string,
    password: string,
    metadata?: SecretMetadata,
  ): Promise<SecretDetail> {
    const resource = await kubernetesResourcesService.create(
      KubernetesKind.SECRET,
      toResource(name, password, metadata),
    );

    trackEvent({
      name: 'secret_created',
      properties: { secretName: name },
    });

    return toDetail(resource);
  },

  // Update an existing secret
  async update(
    name: string,
    password: string,
    metadata?: SecretMetadata,
  ): Promise<SecretDetail> {
    const existing = await kubernetesResourcesService.get(
      KubernetesKind.SECRET,
      name,
    );
    const current = readResourceMetadata({
      annotations: existing.metadata.annotations,
      labels: existing.metadata.labels,
    });

    let updated: SecretDetail;

    if (sameResourceMetadata(current, metadata ?? {})) {
      const request: SecretUpdateRequest = {
        string_data: { [VALUE_KEY]: password },
      };
      await apiClient.put<SecretDetailResponse>(
        `/api/v1/secrets/${name}`,
        request,
      );
      updated = {
        ...toDetail(existing),
        value: password,
        secret_length: byteLength(password),
      };
    } else {
      const replacement = toResource(name, password, metadata, existing);
      await kubernetesResourcesService.delete(KubernetesKind.SECRET, name);
      updated = toDetail(
        await kubernetesResourcesService.create(
          KubernetesKind.SECRET,
          replacement,
        ),
      );
    }

    trackEvent({
      name: 'secret_updated',
      properties: { secretName: name },
    });

    return updated;
  },

  // Delete a secret
  async delete(name: string): Promise<void> {
    await apiClient.delete(`/api/v1/secrets/${name}`);

    trackEvent({
      name: 'secret_deleted',
      properties: { secretName: name },
    });
  },
};

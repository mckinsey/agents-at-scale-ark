import { trackEvent } from '@/lib/analytics/singleton';
import {
  CONFIGURATION_ANNOTATION,
  preserveForeignAnnotations,
  readResourceMetadata,
  toResourceAnnotations,
  toResourceLabelMap,
} from '@/lib/utils/resource-metadata';

import {
  KubernetesKind,
  type KubernetesResource,
  kubernetesResourcesService,
} from './kubernetes-resources';

const VALUE_KEY = 'value';

export interface Configuration {
  id: string;
  name: string;
  description?: string | null;
  alias?: string | null;
  labels?: string[] | null;
}

export interface ConfigurationDetailResponse extends Configuration {
  value?: string | null;
}

export interface ConfigurationCreateRequest {
  name: string;
  value: string;
  description?: string | null;
  alias?: string | null;
  labels?: string[] | null;
}

export interface ConfigurationUpdateRequest {
  value: string;
  description?: string | null;
  alias?: string | null;
  labels?: string[] | null;
}

type ConfigurationWriteRequest =
  | ConfigurationCreateRequest
  | ConfigurationUpdateRequest;

function fromResource(
  resource: KubernetesResource,
): ConfigurationDetailResponse {
  const { metadata } = resource;

  return {
    id: metadata.uid ?? metadata.name,
    name: metadata.name,
    value: resource.data?.[VALUE_KEY] ?? '',
    ...readResourceMetadata({
      annotations: metadata.annotations,
      labels: metadata.labels,
    }),
  };
}

function toResource(
  name: string,
  request: ConfigurationWriteRequest,
  existing?: KubernetesResource,
): KubernetesResource {
  return {
    apiVersion: 'v1',
    kind: KubernetesKind.CONFIG_MAP,
    metadata: {
      name,
      annotations: {
        ...preserveForeignAnnotations(existing?.metadata.annotations),
        ...toResourceAnnotations(request),
        [CONFIGURATION_ANNOTATION]: 'true',
      },
      labels: toResourceLabelMap(request.labels),
    },
    data: {
      ...(existing?.data ?? {}),
      [VALUE_KEY]: request.value,
    },
  };
}

function isConfiguration(resource: KubernetesResource): boolean {
  return resource.metadata.annotations?.[CONFIGURATION_ANNOTATION] === 'true';
}

export const configurationsService = {
  async getAll(): Promise<ConfigurationDetailResponse[]> {
    const resources = await kubernetesResourcesService.list(
      KubernetesKind.CONFIG_MAP,
    );
    return resources.filter(isConfiguration).map(fromResource);
  },

  async get(name: string): Promise<ConfigurationDetailResponse> {
    const resource = await kubernetesResourcesService.get(
      KubernetesKind.CONFIG_MAP,
      name,
    );
    return fromResource(resource);
  },

  async create(
    request: ConfigurationCreateRequest,
  ): Promise<ConfigurationDetailResponse> {
    const resource = await kubernetesResourcesService.create(
      KubernetesKind.CONFIG_MAP,
      toResource(request.name, request),
    );

    trackEvent({
      name: 'configuration_created',
      properties: { configurationName: request.name },
    });

    return fromResource(resource);
  },

  async update(
    name: string,
    request: ConfigurationUpdateRequest,
  ): Promise<ConfigurationDetailResponse> {
    const existing = await kubernetesResourcesService.get(
      KubernetesKind.CONFIG_MAP,
      name,
    );
    const replacement = toResource(name, request, existing);

    await kubernetesResourcesService.delete(KubernetesKind.CONFIG_MAP, name);
    const resource = await kubernetesResourcesService.create(
      KubernetesKind.CONFIG_MAP,
      replacement,
    );

    trackEvent({
      name: 'configuration_updated',
      properties: { configurationName: name },
    });

    return fromResource(resource);
  },

  async delete(name: string): Promise<void> {
    await kubernetesResourcesService.delete(KubernetesKind.CONFIG_MAP, name);

    trackEvent({
      name: 'configuration_deleted',
      properties: { configurationName: name },
    });
  },
};

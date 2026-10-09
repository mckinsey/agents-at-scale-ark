export type ArgoQueryParams = Record<string, string>;

export interface ArgoLinks {
  workflowTemplate: (namespace: string, name: string) => string;
  workflow: (
    namespace: string,
    name: string,
    query?: ArgoQueryParams,
  ) => string;
}

export function normalizeArgoUrl(raw: string | undefined): string | undefined {
  const trimmed = raw?.trim().replace(/\/+$/, '');
  return trimmed || undefined;
}

export function createArgoLinks(
  baseUrl: string | undefined,
): ArgoLinks | undefined {
  if (!baseUrl) {
    return undefined;
  }
  return {
    workflowTemplate: (namespace, name) =>
      `${baseUrl}/workflow-templates/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}`,
    workflow: (namespace, name, query) => {
      const search = query ? `?${new URLSearchParams(query)}` : '';
      return `${baseUrl}/workflows/${encodeURIComponent(namespace)}/${encodeURIComponent(name)}${search}`;
    },
  };
}

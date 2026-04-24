import yaml from 'js-yaml';

const RUNTIME_METADATA_FIELDS = [
  'creationTimestamp',
  'resourceVersion',
  'uid',
  'generation',
  'selfLink',
  'deletionTimestamp',
  'managedFields',
];

function removeEmpty(obj: unknown): unknown {
  if (Array.isArray(obj)) {
    const filtered = obj.map(removeEmpty).filter(item => item !== undefined);
    return filtered.length > 0 ? filtered : undefined;
  }

  if (obj !== null && typeof obj === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      const result = removeEmpty(value);
      if (result !== undefined) {
        cleaned[key] = result;
      }
    }
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }

  if (obj === null || obj === undefined || obj === '') {
    return undefined;
  }

  return obj;
}

export function cleanKubernetesResource(resource: Record<string, unknown>): Record<string, unknown> {
  const { status, ...rest } = resource;

  if (rest.metadata && typeof rest.metadata === 'object') {
    const metadata = { ...(rest.metadata as Record<string, unknown>) };
    for (const field of RUNTIME_METADATA_FIELDS) {
      delete metadata[field];
    }
    rest.metadata = metadata;
  }

  return removeEmpty(rest) as Record<string, unknown>;
}

export function toKubernetesYaml(resource: Record<string, unknown>): string {
  const cleaned = cleanKubernetesResource(resource);
  return yaml.dump(cleaned, {
    lineWidth: -1,
  });
}

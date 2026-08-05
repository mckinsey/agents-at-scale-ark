export const ARK_ANNOTATION_PREFIX = 'ark.mckinsey.com/';
export const DESCRIPTION_ANNOTATION = `${ARK_ANNOTATION_PREFIX}description`;
export const ALIAS_ANNOTATION = `${ARK_ANNOTATION_PREFIX}alias`;
export const CONFIGURATION_ANNOTATION = `${ARK_ANNOTATION_PREFIX}configuration`;

const FOREIGN_ANNOTATION_DENYLIST = [
  'kubectl.kubernetes.io/last-applied-configuration',
];

export type AnnotationMap = Record<string, string>;
export type LabelSource = readonly string[] | AnnotationMap;

export interface ResourceMetadata {
  description?: string | null;
  alias?: string | null;
  labels?: string[] | null;
}

export interface AnnotatedResource {
  description?: string | null;
  alias?: string | null;
  labels?: LabelSource | null;
  annotations?: AnnotationMap | null;
}

function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normaliseLabels(labels: LabelSource | null | undefined) {
  if (!labels) return [];

  const names = Array.isArray(labels) ? labels : Object.keys(labels);

  return names.filter(
    name => name.length > 0 && !name.startsWith(ARK_ANNOTATION_PREFIX),
  );
}

export function readResourceMetadata(
  resource: AnnotatedResource,
): Required<ResourceMetadata> {
  const annotations = resource.annotations ?? {};

  return {
    description:
      trimmedOrNull(resource.description) ??
      trimmedOrNull(annotations[DESCRIPTION_ANNOTATION]),
    alias:
      trimmedOrNull(resource.alias) ??
      trimmedOrNull(annotations[ALIAS_ANNOTATION]),
    labels: normaliseLabels(resource.labels),
  };
}

export function toResourceAnnotations(
  metadata: ResourceMetadata,
): AnnotationMap {
  const annotations: AnnotationMap = {};

  const description = trimmedOrNull(metadata.description);
  if (description) annotations[DESCRIPTION_ANNOTATION] = description;

  const alias = trimmedOrNull(metadata.alias);
  if (alias) annotations[ALIAS_ANNOTATION] = alias;

  return annotations;
}

export function toResourceLabelMap(
  labels: readonly string[] | null | undefined,
): AnnotationMap {
  const labelMap: AnnotationMap = {};

  for (const label of labels ?? []) {
    const trimmed = label.trim();
    if (trimmed) labelMap[trimmed] = '';
  }

  return labelMap;
}

export function preserveForeignAnnotations(
  annotations: AnnotationMap | null | undefined,
): AnnotationMap {
  const preserved: AnnotationMap = {};

  for (const [key, value] of Object.entries(annotations ?? {})) {
    if (key.startsWith(ARK_ANNOTATION_PREFIX)) continue;
    if (FOREIGN_ANNOTATION_DENYLIST.includes(key)) continue;
    preserved[key] = value;
  }

  return preserved;
}

function sortedLabels(labels: readonly string[] | null | undefined): string {
  return [...(labels ?? [])].sort((a, b) => a.localeCompare(b)).join(' ');
}

export function sameResourceMetadata(
  left: ResourceMetadata,
  right: ResourceMetadata,
): boolean {
  return (
    trimmedOrNull(left.description) === trimmedOrNull(right.description) &&
    trimmedOrNull(left.alias) === trimmedOrNull(right.alias) &&
    sortedLabels(left.labels) === sortedLabels(right.labels)
  );
}

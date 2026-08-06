export interface AliasableResource {
  name: string;
  alias?: string | null;
}

export function displayName(resource: AliasableResource): string {
  const alias = resource.alias?.trim();
  return alias ? alias : resource.name;
}

export function hasAlias(resource: AliasableResource): boolean {
  return displayName(resource) !== resource.name;
}

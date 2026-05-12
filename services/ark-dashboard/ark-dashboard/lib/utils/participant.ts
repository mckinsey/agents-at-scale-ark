export function stripNamespace(name: string): string {
  return name.includes('/') ? name.split('/').pop() || name : name;
}

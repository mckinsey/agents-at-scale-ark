import { APIError } from '@/lib/api/client';

export type ResourceKindLabel = 'Secret' | 'Configuration';

export function createResourceErrorMessage(
  error: unknown,
  kind: ResourceKindLabel,
  name: string,
): string {
  if (error instanceof APIError && error.status === 409) {
    return `A ${kind} with the name "${name}" already exists.`;
  }
  if (error instanceof APIError && error.status === 403) {
    return `You do not have permission to create a ${kind} in this namespace.`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unexpected error occurred';
}

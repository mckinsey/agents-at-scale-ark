import { z } from 'zod';

export const kubernetesNameSchema = z
  .string('Name is required')
  .min(1, {
    message: 'Name is required',
  })
  .max(253, {
    message: 'Name must be 253 characters or less',
  })
  .regex(/^[a-z0-9]/, {
    message: 'Name must start with a lowercase letter or number',
  })
  .regex(/[a-z0-9]$/, {
    message: 'Name must end with a lowercase letter or number',
  })
  .regex(/^[a-z0-9.-]+$/, {
    message:
      'Name can only contain lowercase letters, numbers, hyphens, and dots',
  });

/**
 * @deprecated Use kubernetesNameSchema.safeParse() instead for validation.
 * This function will be removed in a future version.
 *
 * Example usage:
 * ```typescript
 * const result = kubernetesNameSchema.safeParse(name);
 * if (!result.success) {
 *   const errorMessage = result.error.errors[0]?.message;
 * }
 * ```
 */
export function getKubernetesNameError(name: string): string | null {
  if (!name || name.length === 0) {
    return 'Name is required';
  }

  if (name.length > 253) {
    return 'Name must be 253 characters or less';
  }

  // Check if the first character is not alphanumeric (including uppercase)
  if (!/^[a-zA-Z0-9]/.test(name)) {
    return 'Name must start with a lowercase letter or number';
  }

  // Check if the last character is not alphanumeric (including uppercase)
  if (!/[a-zA-Z0-9]$/.test(name)) {
    return 'Name must end with a lowercase letter or number';
  }

  // Check if name contains only valid characters
  if (!/^[a-z0-9.-]+$/.test(name)) {
    return 'Name can only contain lowercase letters, numbers, hyphens, and dots';
  }

  return null;
}

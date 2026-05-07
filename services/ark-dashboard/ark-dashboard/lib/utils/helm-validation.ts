import { z } from 'zod';

/**
 * Helm release name validation
 * Standards: https://github.com/helm/helm/issues/6192
 * - Max 53 characters
 * - Lowercase alphanumeric, hyphens, dots
 * - Must start/end with alphanumeric
 */
export const helmReleaseNameSchema = z
  .string()
  .min(1, 'Helm release name is required')
  .max(53, 'Helm release name must be 53 characters or less')
  .regex(
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?(\.[a-z0-9]([-a-z0-9]*[a-z0-9])?)*$/,
    'Helm release name must consist of lowercase letters, numbers, hyphens, and dots, ' +
      'and must start and end with an alphanumeric character',
  );

/**
 * Kubernetes namespace validation (RFC 1123)
 * Standards: https://kubernetes.io/docs/concepts/overview/working-with-objects/names/
 * - Max 63 characters
 * - Lowercase alphanumeric, hyphens (NO dots)
 * - Must start/end with alphanumeric
 */
export const helmNamespaceSchema = z
  .string()
  .min(1, 'Namespace is required')
  .max(63, 'Namespace must be 63 characters or less')
  .regex(
    /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
    'Namespace must consist of lowercase letters, numbers, and hyphens, ' +
      'and must start and end with an alphanumeric character (RFC 1123)',
  );

/**
 * Helm chart path validation
 * - Only OCI or HTTPS URLs
 * - No shell metacharacters
 */
export const helmChartPathSchema = z
  .string()
  .min(1, 'Chart path is required')
  .refine(
    (path) => {
      if (!path.startsWith('oci://') && !path.startsWith('https://')) {
        return false;
      }
      // Check for shell metacharacters
      const dangerousChars = /[;|&$`(){}[\]<>\\'"]/;
      return !dangerousChars.test(path);
    },
    {
      message:
        'Chart path must be a valid OCI (oci://) or HTTPS URL without shell metacharacters',
    },
  );

/**
 * Allowlist of safe Helm install flags
 */
const ALLOWED_HELM_FLAGS = new Set([
  '--create-namespace',
  '--wait',
  '--atomic',
  '--cleanup-on-fail',
  '--debug',
  '--dry-run',
  '--force',
  '--disable-openapi-validation',
]);

/**
 * Validate Helm install arguments against allowlist
 * Blocks dangerous flags like --post-renderer, --set-file
 */
export function validateInstallArgs(args: string[]): void {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (ALLOWED_HELM_FLAGS.has(arg)) {
      continue;
    }

    // Value format validation for --timeout (must be \d+[smh])
    if (arg === '--timeout') {
      if (i + 1 >= args.length) {
        throw new Error('--timeout requires a value');
      }
      const timeoutValue = args[i + 1];
      if (!/^\d+[smh]$/.test(timeoutValue)) {
        throw new Error('Invalid timeout format (expected: 5m, 300s, 1h)');
      }
      i++;
      continue;
    }

    // Validate flags with custom value formats (--set, --set-string)
    if (arg === '--set' || arg === '--set-string') {
      if (i + 1 >= args.length) {
        throw new Error(`${arg} requires a value`);
      }
      const setValue = args[i + 1];
      // Strict validation: key=value, no shell metacharacters
      if (!/^[a-zA-Z0-9._-]+=[\w\s.,@:/\-]+$/.test(setValue)) {
        throw new Error(
          `Invalid ${arg} value format (no shell metacharacters allowed)`,
        );
      }
      i++;
      continue;
    }

    // Disallowed argument
    throw new Error(`Disallowed install argument: ${arg}`);
  }
}

/**
 * Validate all Helm installation inputs
 * Throws ZodError or Error if validation fails
 */
export function validateHelmInstallation(input: {
  helmReleaseName: string | undefined;
  chartPath: string | undefined;
  namespace?: string | undefined;
  installArgs?: string[] | undefined;
}): void {
  if (!input.helmReleaseName) {
    throw new Error('Helm release name is required');
  }
  if (!input.chartPath) {
    throw new Error('Chart path is required');
  }

  helmReleaseNameSchema.parse(input.helmReleaseName);
  helmChartPathSchema.parse(input.chartPath);

  if (input.namespace) {
    helmNamespaceSchema.parse(input.namespace);
  }

  if (input.installArgs) {
    validateInstallArgs(input.installArgs);
  }
}

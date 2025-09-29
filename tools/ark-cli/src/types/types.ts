/**
 * Represents a Helm chart configuration for ARK components
 */
export interface ArkChart {
  /** Name of the chart (used as release name) */
  name: string;

  /** Full chart path (OCI registry or local path) */
  chartPath: string;

  /** Kubernetes namespace to install into */
  namespace: string;

  /** Additional arguments to pass to helm (e.g., --create-namespace, --wait, --timeout 300s, --set key=value) */
  args?: string[];

  /** Description of what this chart provides */
  description?: string;
}

/**
 * Collection of ARK charts
 */
export interface ChartCollection {
  [key: string]: ArkChart;
}

/**
 * Represents a dependency that needs to be installed
 */
export interface Dependency {
  /** Name of the dependency */
  name: string;

  /** Command to execute (helm, kubectl, etc.) */
  command: string;

  /** Arguments to pass to the command */
  args: string[];

  /** Description of what this dependency provides */
  description?: string;
}

/**
 * Collection of dependencies
 */
export interface DependencyCollection {
  [key: string]: Dependency;
}

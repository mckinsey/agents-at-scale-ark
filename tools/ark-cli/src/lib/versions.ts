import {execa} from 'execa';
import {arkServices} from '../arkServices.js';
import type {HelmRelease} from './types.js';

/**
 * Version information for ARK
 */
export interface ArkVersionInfo {
  current?: string;
  latest?: string;
  updateAvailable?: boolean;
}

/**
 * Fetch the latest ARK version from GitHub releases
 * @returns Latest version string or undefined if fetch fails
 */
export async function fetchLatestVersion(): Promise<string | undefined> {
  try {
    const response = await fetch(
      'https://api.github.com/repos/mckinsey/agents-at-scale-ark/releases/latest'
    );
    if (response.ok) {
      const data = (await response.json()) as {tag_name: string};
      // Remove 'v' prefix if present for consistent comparison
      return data.tag_name.replace(/^v/, '');
    }
  } catch {
    // Silently fail
  }
  return undefined;
}

/**
 * Get current installed ARK version from Helm
 * @returns Current version string or undefined if not found
 */
export async function fetchCurrentVersion(): Promise<string | undefined> {
  try {
    const controller = arkServices['ark-controller'];
    const {stdout} = await execa(
      'helm',
      ['list', '-n', controller.namespace!, '-o', 'json'],
      {stdio: 'pipe'}
    );
    const releases = JSON.parse(stdout) as HelmRelease[];
    const arkController = releases.find(
      (r) => r.name === controller.helmReleaseName
    );
    return arkController?.app_version;
  } catch {
    return undefined;
  }
}

/**
 * Fetch both current and latest versions in parallel
 * @returns Version information
 */
export async function fetchVersionInfo(): Promise<ArkVersionInfo> {
  const [current, latest] = await Promise.all([
    fetchCurrentVersion(),
    fetchLatestVersion(),
  ]);

  return {
    current,
    latest,
    updateAvailable: current && latest ? current !== latest : undefined,
  };
}

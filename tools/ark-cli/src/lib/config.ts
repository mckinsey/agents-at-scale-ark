import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import type {ClusterInfo} from './cluster.js';
import type {ArkService} from '../types/arkService.js';

export interface ChatConfig {
  streaming?: boolean;
  outputFormat?: 'text' | 'markdown';
}

export interface MarketplaceConfig {
  repoUrl?: string;
  registry?: string;
}

export interface ArkConfig {
  chat?: ChatConfig;
  marketplace?: MarketplaceConfig;
  services?: {[serviceName: string]: Partial<ArkService>};
  queryTimeout?: string;
  defaultExportTypes?: string[];
  // Cluster info - populated during startup if context exists
  clusterInfo?: ClusterInfo;
}

/**
 * Load configuration from multiple sources with proper precedence:
 * 1. Defaults
 * 2. ~/.arkrc.yaml (user config)
 * 3. .arkrc.yaml (project config)
 * 4. Environment variables (override all)
 */
export function loadConfig(): ArkConfig {
  // Start with defaults
  const config: ArkConfig = {
    chat: {
      streaming: true,
      outputFormat: 'text',
    },
    marketplace: {
      repoUrl: 'https://github.com/mckinsey/agents-at-scale-marketplace',
      registry: 'oci://ghcr.io/mckinsey/agents-at-scale-marketplace/charts',
    },
  };

  // Load user config from home directory
  const userConfigPath = path.join(os.homedir(), '.arkrc.yaml');
  if (fs.existsSync(userConfigPath)) {
    try {
      const userConfig = yaml.parse(fs.readFileSync(userConfigPath, 'utf-8'));
      mergeConfig(config, userConfig);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Invalid YAML in ${userConfigPath}: ${message}`);
    }
  }

  // Load project config from current directory
  const projectConfigPath = path.join(process.cwd(), '.arkrc.yaml');
  if (fs.existsSync(projectConfigPath)) {
    try {
      const projectConfig = yaml.parse(
        fs.readFileSync(projectConfigPath, 'utf-8')
      );
      mergeConfig(config, projectConfig);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Unknown error';
      throw new Error(`Invalid YAML in ${projectConfigPath}: ${message}`);
    }
  }

  // Apply environment variable overrides
  if (process.env.ARK_CHAT_STREAMING !== undefined) {
    config.chat = config.chat || {};
    config.chat.streaming =
      process.env.ARK_CHAT_STREAMING === '1' ||
      process.env.ARK_CHAT_STREAMING === 'true';
  }

  if (process.env.ARK_CHAT_OUTPUT_FORMAT !== undefined) {
    config.chat = config.chat || {};
    const format = process.env.ARK_CHAT_OUTPUT_FORMAT.toLowerCase();
    if (format === 'markdown' || format === 'text') {
      config.chat.outputFormat = format;
    }
  }

  if (process.env.ARK_QUERY_TIMEOUT !== undefined) {
    config.queryTimeout = process.env.ARK_QUERY_TIMEOUT;
  }

  if (process.env.ARK_MARKETPLACE_REPO_URL !== undefined) {
    config.marketplace = config.marketplace || {};
    config.marketplace.repoUrl = process.env.ARK_MARKETPLACE_REPO_URL;
  }

  if (process.env.ARK_MARKETPLACE_REGISTRY !== undefined) {
    config.marketplace = config.marketplace || {};
    config.marketplace.registry = process.env.ARK_MARKETPLACE_REGISTRY;
  }

  return config;
}

/**
 * Merge source config into target config (mutates target)
 */
function mergeConfig(target: ArkConfig, source: ArkConfig): void {
  if (source.chat) {
    target.chat = target.chat || {};
    if (source.chat.streaming !== undefined) {
      target.chat.streaming = source.chat.streaming;
    }
    if (source.chat.outputFormat !== undefined) {
      target.chat.outputFormat = source.chat.outputFormat;
    }
  }

  if (source.marketplace) {
    target.marketplace = target.marketplace || {};
    if (source.marketplace.repoUrl !== undefined) {
      target.marketplace.repoUrl = source.marketplace.repoUrl;
    }
    if (source.marketplace.registry !== undefined) {
      target.marketplace.registry = source.marketplace.registry;
    }
  }

  if (source.services) {
    target.services = target.services || {};
    for (const [serviceName, overrides] of Object.entries(source.services)) {
      target.services[serviceName] = {
        ...target.services[serviceName],
        ...overrides,
      };
    }
  }

  if (source.queryTimeout !== undefined) {
    target.queryTimeout = source.queryTimeout;
  }

  if (source.defaultExportTypes) {
    target.defaultExportTypes = source.defaultExportTypes
  }
}

/**
 * Get the paths checked for config files
 */
export function getConfigPaths(): {user: string; project: string} {
  return {
    user: path.join(os.homedir(), '.arkrc.yaml'),
    project: path.join(process.cwd(), '.arkrc.yaml'),
  };
}

/**
 * Format config as YAML for display
 */
export function formatConfig(config: ArkConfig): string {
  return yaml.stringify(config);
}

/**
 * Get marketplace repository URL from config
 */
export function getMarketplaceRepoUrl(): string {
  const config = loadConfig();
  return config.marketplace!.repoUrl!;
}

/**
 * Get marketplace registry from config
 */
export function getMarketplaceRegistry(): string {
  const config = loadConfig();
  return config.marketplace!.registry!;
}

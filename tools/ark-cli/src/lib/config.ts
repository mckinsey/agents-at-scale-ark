import fs from 'fs';
import path from 'path';
import os from 'os';
import yaml from 'yaml';
import type {ClusterInfo} from './cluster.js';

export interface ChatConfig {
  streaming?: boolean;
  outputFormat?: 'text' | 'markdown';
}

export interface ArkConfig {
  chat?: ChatConfig;
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

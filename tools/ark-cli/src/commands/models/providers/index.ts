/**
 * Provider configuration types and collectors.
 *
 * This module exports all provider-specific configurations and their collectors.
 */

export {
  BaseProviderConfig,
  BaseCollectorOptions,
  ProviderConfigCollector,
} from './types.js';
export {
  OpenAIConfig,
  OpenAICollectorOptions,
  OpenAIConfigCollector,
} from './openai.js';
export {
  AzureConfig,
  AzureCollectorOptions,
  AzureConfigCollector,
} from './azure.js';
export {
  BedrockConfig,
  BedrockCollectorOptions,
  BedrockConfigCollector,
} from './bedrock.js';
export {ProviderConfigCollectorFactory} from './factory.js';

import {OpenAIConfig} from './openai.js';
import {AzureConfig} from './azure.js';
import {BedrockConfig} from './bedrock.js';

/**
 * Union type of all supported provider configurations.
 */
export type ProviderConfig = OpenAIConfig | AzureConfig | BedrockConfig;

/**
 * Provider configuration types and collectors.
 *
 * This module exports all provider-specific configurations and their collectors.
 */

export {BaseProviderConfig, ProviderConfigCollector} from './types.js';
export {OpenAIConfig, OpenAIConfigCollector} from './openai.js';
export {AzureConfig, AzureConfigCollector} from './azure.js';
export {BedrockConfig, BedrockConfigCollector} from './bedrock.js';
export {ProviderConfigCollectorFactory} from './factory.js';

import {OpenAIConfig} from './openai.js';
import {AzureConfig} from './azure.js';
import {BedrockConfig} from './bedrock.js';

/**
 * Union type of all supported provider configurations.
 */
export type ProviderConfig = OpenAIConfig | AzureConfig | BedrockConfig;

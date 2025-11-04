import {CreateModelOptions} from '../create.js';

// Provider-specific configuration types
export interface BaseProviderConfig {
  type: string;
  modelValue: string;
  secretName: string;
}

export interface OpenAIConfig extends BaseProviderConfig {
  type: 'openai';
  baseUrl: string;
  apiKey: string;
}

export interface AzureConfig extends BaseProviderConfig {
  type: 'azure';
  baseUrl: string;
  apiKey: string;
  apiVersion: string;
}

export interface BedrockConfig extends BaseProviderConfig {
  type: 'bedrock';
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  sessionToken?: string;
  modelArn?: string;
}

export type ProviderConfig = OpenAIConfig | AzureConfig | BedrockConfig;

// Provider configuration collector interface
export interface ProviderConfigCollector {
  collectConfig(options: CreateModelOptions): Promise<ProviderConfig>;
}

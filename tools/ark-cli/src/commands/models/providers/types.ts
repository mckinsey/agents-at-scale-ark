import type {ProviderConfig} from './index.js';

/**
 * Base configuration shared by all model providers.
 */
export interface BaseProviderConfig {
  type: string;
  modelValue: string;
  secretName: string;
}

/**
 * Common options available to all providers collectors.
 *
 * Can be extended with provider-specific options to grant more flexibility when configuring models on different providers.
 *
 * @field model - Model name (e.g., 'gpt-4o-mini')
 * @field type - Model provider type (e.g., 'azure', 'openai', 'bedrock')
 */
export interface BaseCollectorOptions {
  /**
   * Model name (e.g., 'gpt-4o-mini')
   */
  model?: string;

  /**
   * Model provider type (e.g., 'azure', 'openai', 'bedrock')
   */
  type?: string;

  [key: string]: unknown; // Allow provider-specific options to pass through
}

/**
 * Provider configuration collector interface.
 *
 * A collector is responsible for gathering all the necessary configuration
 * parameters for a specific model provider (OpenAI, Azure, Bedrock, etc.).
 * It handles the interactive prompting of missing values and validation
 * of user inputs, ensuring all required fields are collected before
 * creating the model resource.
 *
 * The collector pattern allows each provider to define its own specific
 * configuration requirements and prompts without affecting other providers.
 */
export interface ProviderConfigCollector {
  /**
   * Collects provider-specific configuration by prompting for any missing values.
   *
   * @param options - Options object that may contain pre-filled values.
   *                  Each collector extracts only the fields it needs.
   * @returns A promise that resolves to a complete provider configuration with all required fields
   * @throws Error if a required field cannot be obtained or validation fails
   */
  collectConfig(options: BaseCollectorOptions): Promise<ProviderConfig>;
}

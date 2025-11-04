import {CreateModelOptions} from '../create.js';
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
   * @param options - The command-line options that may contain some pre-filled values
   * @returns A promise that resolves to a complete provider configuration with all required fields
   * @throws Error if a required field cannot be obtained or validation fails
   */
  collectConfig(options: CreateModelOptions): Promise<ProviderConfig>;
}

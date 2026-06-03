// Model type display names
// Maps internal model type values to user-friendly display names
export const MODEL_TYPE_DISPLAY_NAMES: Record<string, string> = {
  completions: 'Chat Completions (OpenAI V1)',
};

export function getModelTypeDisplayName(type: string | undefined): string {
  if (!type) return 'Unknown';
  return MODEL_TYPE_DISPLAY_NAMES[type] ?? type;
}

export const MODEL_PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  openai: 'OpenAI',
  azure: 'Azure OpenAI',
  bedrock: 'AWS Bedrock',
  anthropic: 'Anthropic',
  google: 'Google',
  meta: 'Meta',
};

export function getModelProviderDisplayName(
  provider: string | undefined,
): string {
  if (!provider) return 'Unknown';
  return MODEL_PROVIDER_DISPLAY_NAMES[provider] ?? provider;
}

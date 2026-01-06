// Model type display names
// Maps internal model type values to user-friendly display names
export const MODEL_TYPE_DISPLAY_NAMES: Record<string, string> = {
  completions: 'Chat Completions (OpenAI V1)',
};

export function getModelTypeDisplayName(type: string | undefined): string {
  if (!type) return 'Unknown';
  return MODEL_TYPE_DISPLAY_NAMES[type] ?? type;
}

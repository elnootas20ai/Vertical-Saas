export interface ModelOption {
  id: string;
  name: string;
  provider: string;
  default?: boolean;
}

export const CHAT_MODELS: ModelOption[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', default: true },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI' },
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'OpenAI' },
];

export const CURSOR_MODELS: ModelOption[] = [
  { id: 'claude-4.6-sonnet-medium-thinking', name: 'Claude 4.6 Sonnet (Thinking)', provider: 'Anthropic', default: true },
  { id: 'claude-4.6-sonnet-medium', name: 'Claude 4.6 Sonnet', provider: 'Anthropic' },
  { id: 'claude-4.6-opus-high-thinking', name: 'Claude 4.6 Opus High', provider: 'Anthropic' },
  { id: 'claude-4.6-opus-max-thinking', name: 'Claude 4.6 Opus Max', provider: 'Anthropic' },
  { id: 'gpt-5.4-high', name: 'GPT-5.4 High', provider: 'OpenAI' },
  { id: 'gpt-5.4-medium', name: 'GPT-5.4 Medium', provider: 'OpenAI' },
  { id: 'gpt-5.3-codex', name: 'GPT-5.3 Codex', provider: 'OpenAI' },
  { id: 'gemini-3.1-pro', name: 'Gemini 3.1 Pro', provider: 'Google' },
  { id: 'grok-4-20-thinking', name: 'Grok 4.20 Thinking', provider: 'xAI' },
  { id: 'claude-4.5-sonnet-thinking', name: 'Claude 4.5 Sonnet', provider: 'Anthropic' },
];

export function getModelsForType(agentType: 'conversation' | 'cursor'): ModelOption[] {
  return agentType === 'conversation' ? CHAT_MODELS : CURSOR_MODELS;
}

export function getDefaultModel(agentType: 'conversation' | 'cursor'): string {
  const models = getModelsForType(agentType);
  return models.find((m) => m.default)?.id || models[0].id;
}

import type { AssistantSettings, Provider } from './types'

export const PROVIDER_DEFAULTS: Record<
  Provider,
  Pick<AssistantSettings, 'baseUrl' | 'model'>
> = {
  deepseek: {
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash'
  },
  'openai-compatible': {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini'
  }
}

export function getProviderDefaults(provider: Provider) {
  return PROVIDER_DEFAULTS[provider]
}

export function normalizeSettings(
  settings: AssistantSettings
): AssistantSettings {
  const defaults = getProviderDefaults(settings.provider)
  const baseUrl = settings.baseUrl.trim().replace(/\/+$/, '')
  return {
    provider: settings.provider,
    apiKey: settings.apiKey.trim(),
    baseUrl: baseUrl || defaults.baseUrl,
    model: settings.model.trim() || defaults.model,
    targetLanguage: settings.targetLanguage.trim() || '中文'
  }
}

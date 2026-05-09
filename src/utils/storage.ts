import { storage } from 'wxt/utils/storage'
import type { AssistantSettings, TranslationRecord } from '../shared/types'
import { getProviderDefaults } from '../shared/providerDefaults'

const deepseekDefaults = getProviderDefaults('deepseek')

export const DEFAULT_SETTINGS: AssistantSettings = {
  provider: 'deepseek',
  apiKey: '',
  baseUrl: deepseekDefaults.baseUrl,
  model: deepseekDefaults.model,
  targetLanguage: '中文'
}

export const assistantSettings = storage.defineItem<AssistantSettings>(
  'local:assistant-settings',
  {
    fallback: DEFAULT_SETTINGS
  }
)

export const translationRecords = storage.defineItem<TranslationRecord[]>(
  'local:translation-records',
  {
    fallback: []
  }
)

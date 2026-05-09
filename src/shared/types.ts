export type Provider = 'deepseek' | 'openai-compatible'

export interface ExamplePair {
  english: string
  translation: string
}

export interface AssistantSettings {
  provider: Provider
  apiKey: string
  baseUrl: string
  model: string
  targetLanguage: string
}

export interface TranslationRequest {
  word: string
  sentence: string
  pageTitle: string
  pageUrl: string
}

export interface TranslationResult {
  word: string
  sentenceMeaning: string
  sentenceTranslation: string
  examples: ExamplePair[]
}

export interface TranslationRecord extends TranslationRequest, TranslationResult {
  id: string
  createdAt: string
  provider: Provider
  model: string
}

export interface AssistantError {
  message: string
}

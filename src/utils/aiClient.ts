import type {
  AssistantSettings,
  ExamplePair,
  TranslationRequest,
  TranslationResult
} from '../shared/types'
import { normalizeSettings } from '../shared/providerDefaults'
import { buildPrompt, formatErrorMessage } from './prompt'

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string
    }
  }>
  error?: {
    message?: string
  }
}

const MAX_PARSE_RETRIES = 2

export async function translateWithAi(
  settings: AssistantSettings,
  request: TranslationRequest
): Promise<TranslationResult> {
  const normalized = normalizeSettings(settings)
  if (!normalized.apiKey) {
    throw new Error('请先在插件弹窗中填写 API Key。')
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const content = await requestChatCompletion(
      normalized,
      request,
      attempt,
      lastError
    )

    try {
      return parseResult(content, request.word)
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`AI 返回结果解析失败：${formatErrorMessage(lastError)}`)
}

async function requestChatCompletion(
  settings: AssistantSettings,
  request: TranslationRequest,
  attempt: number,
  lastError: unknown
): Promise<string> {
  const response = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${settings.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content:
            'You are a precise vocabulary tutor. Return only valid compact json.'
        },
        {
          role: 'user',
          content: buildPrompt(settings, request, attempt, lastError)
        }
      ],
      temperature: 0.2,
      max_tokens: 800,
      response_format: { type: 'json_object' }
    })
  })

  const payload = (await response.json().catch(() => null)) as
    | ChatCompletionResponse
    | null

  if (!response.ok) {
    throw new Error(
      payload?.error?.message || `AI 请求失败：HTTP ${response.status}`
    )
  }

  const content = payload?.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('AI 没有返回可解析的内容。')
  }

  return content
}

function parseResult(content: string, fallbackWord: string): TranslationResult {
  const parsed = JSON.parse(extractJson(content)) as Partial<TranslationResult>
  const result = {
    word: String(parsed.word || fallbackWord),
    sentenceMeaning: String(parsed.sentenceMeaning || ''),
    sentenceTranslation: String(parsed.sentenceTranslation || ''),
    examples: Array.isArray(parsed.examples)
      ? parsed.examples.slice(0, 5).map((item) => ({
          english: String((item as ExamplePair).english || ''),
          translation: String((item as ExamplePair).translation || '')
        }))
      : []
  }

  if (!result.sentenceMeaning || !result.sentenceTranslation) {
    throw new Error('缺少 sentenceMeaning 或 sentenceTranslation 字段。')
  }

  if (result.examples.length === 0) {
    throw new Error('缺少 examples 字段。')
  }

  return result
}

function extractJson(content: string): string {
  const trimmed = content.trim()
  if (trimmed.startsWith('{')) return trimmed

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()

  const start = trimmed.indexOf('{')
  const end = trimmed.lastIndexOf('}')
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1)

  return trimmed
}

import type {
  AssistantSettings,
  BigBangResult,
  ExamplePair,
  TranslationRequest,
  TranslationResult
} from '../shared/types'
import { normalizeSettings } from '../shared/providerDefaults'
import { buildPrompt, buildBigBangPrompt, formatErrorMessage } from './prompt'

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
    const promptContent = buildPrompt(normalized, request, attempt, lastError)
    const content = await requestChatCompletion(normalized, promptContent)

    try {
      return parseResult(content, request.word)
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`AI 返回结果解析失败：${formatErrorMessage(lastError)}`)
}

export async function analyzeBigBangWithAi(
  settings: AssistantSettings,
  request: TranslationRequest
): Promise<BigBangResult> {
  const normalized = normalizeSettings(settings)
  if (!normalized.apiKey) {
    throw new Error('请先在插件弹窗中填写 API Key。')
  }

  let lastError: unknown
  for (let attempt = 0; attempt <= MAX_PARSE_RETRIES; attempt++) {
    const promptContent = buildBigBangPrompt(normalized, request, attempt, lastError)
    const content = await requestChatCompletion(normalized, promptContent)

    try {
      return parseBigBangResult(content, request.word)
    } catch (error) {
      lastError = error
    }
  }

  throw new Error(`AI 返回结果解析失败：${formatErrorMessage(lastError)}`)
}

async function requestChatCompletion(
  settings: AssistantSettings,
  promptContent: string
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
            'You are a precise vocabulary tutor. Respond in strict JSON format following the schema provided by the user. Return ONLY valid JSON — no markdown, no code fences, no extra text, no comments.'
        },
        {
          role: 'user',
          content: promptContent
        }
      ],
      temperature: 0.2,
      max_tokens: 1200,
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

function parseBigBangResult(
  content: string,
  fallbackOriginal: string
): BigBangResult {
  const parsed = JSON.parse(extractJson(content)) as Partial<BigBangResult>
  const result: BigBangResult = {
    original: String(parsed.original || fallbackOriginal),
    items: Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          word: String(item.word || ''),
          type: String(item.type || ''),
          meaning: String(item.meaning || ''),
          explanation: String(item.explanation || '')
        }))
      : [],
    sentenceTranslation: String(parsed.sentenceTranslation || '')
  }

  if (result.items.length === 0) {
    throw new Error('缺少单词/词组分解结果。')
  }

  return result
}

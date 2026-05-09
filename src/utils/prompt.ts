import type { AssistantSettings, TranslationRequest } from '../shared/types'

export function buildPrompt(
  settings: AssistantSettings,
  request: TranslationRequest,
  attempt = 0,
  lastError: unknown = null
): string {
  return JSON.stringify({
    task:
      '你是一个英语划词助手。请解释选中的英文单词在原句里的具体含义，翻译整句，并给出 2 条包含该单词的英文例句及其中文翻译。',
    outputLanguage: settings.targetLanguage,
    selectedWord: request.word,
    sentence: request.sentence,
    instructions: [
      '只输出合法 json，不要输出 Markdown、代码块或多余解释。',
      'sentenceMeaning 只解释 selectedWord 在 sentence 中的意思，不要解释整句话。',
      'sentenceMeaning 用简短中文，最多 18 个汉字，格式类似：“manpower：人力、劳动力”。',
      '如果 selectedWord 是人名、书名、定律名或专有名词，要说明它是什么，例如：“Brooks：布鲁克斯，人名”。',
      'sentenceTranslation 必须是整句的自然翻译。',
      'examples 必须是 2 条英文例句与对应中文翻译的数组。',
      '每条例句必须是真实可用的英文句子，并明确包含 selectedWord 或其核心词形。',
      '例句优先简单、地道、适合学习。'
    ],
    requiredJsonShape: {
      word: 'selected word or phrase',
      sentenceMeaning: 'selectedWord：简短中文释义',
      sentenceTranslation: 'translation of the full sentence',
      examples: [
        { english: 'example sentence 1', translation: '对应中文翻译 1' },
        { english: 'example sentence 2', translation: '对应中文翻译 2' }
      ]
    },
    retry:
      attempt > 0
        ? {
            attempt,
            reason: formatErrorMessage(lastError),
            instruction:
              '上一次输出无法被解析。请严格返回符合 requiredJsonShape 的合法 json。'
          }
        : undefined
  })
}

export function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return '未知解析错误'
}

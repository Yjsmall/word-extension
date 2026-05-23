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

export function buildBigBangPrompt(
  settings: AssistantSettings,
  request: TranslationRequest,
  attempt = 0,
  lastError: unknown = null
): string {
  return JSON.stringify({
    task:
      '你是一个英语词组/单词分析助手。判断选中的文本是词组还是孤立单词，然后按要求输出。关键规则：每个单词或词组对应一个单独的 item，不能合并。',
    outputLanguage: settings.targetLanguage,
    selectedText: request.word,
    sentence: request.sentence,
    instructions: [
      '只输出合法 json，不要输出 Markdown、代码块或多余解释。',
      '【核心规则】items 数组长度必须等于选中文本中独立单元的数量。具体规则：',
      '   • 如果连续单词构成一个有固定含义的词组（phrasal verb / idiom / collocation / fixed expression），整个词组作为一个 item。',
      '   • 否则，每个单词单独一个 item。有多少个单词，items 里就有多少个条目。',
      '【判断标准】词组必须有独立于各单词字面含义的固定语义。',
      '   例如 "get to" 是词组，因为它有固定语义"到达/接触到"，应作为一条 item。',
      '   例如 "airport home" 不是词组，两个单词没有组合后的固定语义，应拆成两条 item：{word:"airport",...} 和 {word:"home",...}。',
      '   例如 "the quick brown fox" 四个单词各不相关，items 长度为 4。',
      '每个 item 包含：word（单词或词组本身）、type（词组填"phrase"，单词填具体词性如 noun/verb/adj/adv/prep/art 等）、meaning（简短中文释义，词组≤20字，单词≤12字）、explanation（在句子中的详细解释，≤50字）。',
      'sentenceTranslation 是整个句子的完整翻译。',
      '如果 selectedText 只有一个单词，items 数组长度就是 1。',
      '专有名词要标注类型，如 "London" → type: "noun", meaning: "伦敦，地名"。'
    ],
    requiredJsonShape: {
      original: '用户选中的原始文本',
      items: [
        {
          word: '第一个单词或词组',
          type: '词性 或 "phrase"',
          meaning: '简短中文释义',
          explanation: '在句子中的详细解释'
        },
        {
          word: '第二个单词或词组',
          type: '词性 或 "phrase"',
          meaning: '简短中文释义',
          explanation: '在句子中的详细解释'
        }
      ],
      sentenceTranslation: '整句翻译'
    },
    examples: [
      {
        selectedText: 'get to',
        sentence: 'It takes 3 mins to get to the airport from my home.',
        expectedOutput: {
          original: 'get to',
          items: [
            { word: 'get to', type: 'phrase', meaning: '到达', explanation: '表示抵达某地的固定搭配' }
          ],
          sentenceTranslation: '从我家到机场需要 3 分钟。'
        }
      },
      {
        selectedText: 'airport home',
        sentence: 'It takes 3 mins to get to the airport from my home.',
        expectedOutput: {
          original: 'airport home',
          items: [
            { word: 'airport', type: 'noun', meaning: '机场', explanation: '指飞机起降的场所' },
            { word: 'home', type: 'noun', meaning: '家', explanation: '指居住的地方' }
          ],
          sentenceTranslation: '从我家到机场需要 3 分钟。'
        }
      }
    ],
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

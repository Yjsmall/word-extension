import { sendMessage } from '../src/utils/messaging'
import { escapeHtml } from '../src/shared/dom'
import type { BigBangResult, TranslationResult } from '../src/shared/types'

const HIGHLIGHT_CLASS = 'ai-selection-translator-highlight'
const ROOT_ID = 'ai-selection-translator-root'

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main(ctx) {
    const ui = createAssistantUi()
    let panelMode: 'analysis' | 'hover' | 'bigbang' = 'analysis'
    let bigBangPayload: BigBangPayload | null = null
    document.documentElement.append(ui.host)

    const bigBangIcon = createBigBangIcon()
    ui.host.shadowRoot!.append(bigBangIcon)

    const stylesheet = document.createElement('style')
    stylesheet.textContent = `
      .${HIGHLIGHT_CLASS} {
        text-decoration: underline !important;
        text-decoration-thickness: 2px !important;
        text-underline-offset: 2px !important;
        text-decoration-color: #e2a800 !important;
        color: inherit !important;
      }
    `
    document.documentElement.append(stylesheet)

    const handleSelection = () => {
      hideBigBangIcon(bigBangIcon)
      window.setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          return
        }

        const word = selection.toString().trim().replace(/\s+/g, ' ')
        if (!isUsefulSelection(word) || !isEnglishWord(word)) return

        const range = trimSelectionRange(selection.getRangeAt(0))
        const rect = range.getBoundingClientRect()
        const sentence = extractSentence(selection, word)
        const marker = highlightRange(range)
        selection.removeAllRanges()
        panelMode = 'analysis'
        void requestTranslation(ui, {
          word,
          sentence,
          rect,
          marker
        })
      }, 10)
    }

    const handleHighlightMouseover = (event: MouseEvent) => {
      const marker = findHighlightMarker(event.target)
      if (!marker || !marker.dataset.meaning) return

      panelMode = 'hover'
      renderMeaningOnly(
        ui,
        marker.dataset.word || marker.textContent || '',
        marker.dataset.meaning
      )
      positionPanel(ui.panel, marker.getBoundingClientRect())
      ui.panel.hidden = false
    }

    const handleHighlightMouseout = (event: MouseEvent) => {
      if (panelMode !== 'hover') return

      const marker = findHighlightMarker(event.target)
      if (!marker) return

      const nextTarget = event.relatedTarget
      if (nextTarget instanceof Node && marker.contains(nextTarget)) return

      ui.panel.hidden = true
    }

    const handleDocumentClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return
      if (ui.host.contains(target)) return
      if (findHighlightMarker(target)) return

      ui.panel.hidden = true
      hideBigBangIcon(bigBangIcon)
    }

    const handleMouseUp = (event: MouseEvent) => {
      if (ui.host.contains(event.target as Node)) return

      window.setTimeout(() => {
        const selection = window.getSelection()
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          hideBigBangIcon(bigBangIcon)
          return
        }

        const text = selection.toString().trim().replace(/\s+/g, ' ')
        if (!isUsefulSelection(text) || !isEnglishText(text)) {
          hideBigBangIcon(bigBangIcon)
          return
        }

        if (panelMode === 'analysis' && !ui.panel.hidden) return

        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const sentence = extractSentence(selection, text)

        bigBangPayload = { word: text, sentence, rect }
        showBigBangIcon(bigBangIcon, rect)
      }, 20)
    }

    const handleMouseDown = (_event: MouseEvent) => {
      hideBigBangIcon(bigBangIcon)
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        ui.panel.hidden = true
        hideBigBangIcon(bigBangIcon)
      }
    }

    const handleScroll = () => {
      hideBigBangIcon(bigBangIcon)
    }

    const handleIconClick = () => {
      if (!bigBangPayload) return
      hideBigBangIcon(bigBangIcon)
      panelMode = 'bigbang'
      void requestBigBang(ui, bigBangPayload)
    }

    document.addEventListener('dblclick', handleSelection)
    document.addEventListener('mouseover', handleHighlightMouseover)
    document.addEventListener('mouseout', handleHighlightMouseout)
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    bigBangIcon.addEventListener('click', handleIconClick)

    ctx.onInvalidated(() => {
      document.removeEventListener('dblclick', handleSelection)
      document.removeEventListener('mouseover', handleHighlightMouseover)
      document.removeEventListener('mouseout', handleHighlightMouseout)
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('scroll', handleScroll, true)
      ui.host.remove()
      stylesheet.remove()
    })
  }
})

interface SelectionPayload {
  word: string
  sentence: string
  rect: DOMRect
  marker: HTMLElement | null
}

interface BigBangPayload {
  word: string
  sentence: string
  rect: DOMRect
}

interface AssistantUi {
  host: HTMLElement
  panel: HTMLElement
  title: HTMLElement
  body: HTMLElement
}

async function requestTranslation(ui: AssistantUi, payload: SelectionPayload) {
  positionPanel(ui.panel, payload.rect)
  ui.title.textContent = payload.word
  ui.body.innerHTML = '<div class="status">分析中...</div>'
  ui.panel.hidden = false

  try {
    const result = await sendMessage('translateSelection', {
      word: payload.word,
      sentence: payload.sentence,
      pageTitle: document.title,
      pageUrl: location.href
    })
    if (payload.marker) {
      payload.marker.dataset.word = result.word
      payload.marker.dataset.meaning = result.sentenceMeaning
    }
    renderResult(ui, result)
  } catch (error) {
    ui.body.innerHTML = `<div class="error">${escapeHtml(getErrorMessage(error))}</div>`
  }
}

function createAssistantUi(): AssistantUi {
  const host = document.createElement('div')
  host.id = ROOT_ID
  const shadow = host.attachShadow({ mode: 'open' })
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .panel {
        position: fixed;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 24px));
        max-height: min(460px, calc(100vh - 24px));
        overflow: auto;
        box-sizing: border-box;
        padding: 12px;
        border: 1px solid rgba(20, 35, 31, .16);
        border-radius: 8px;
        background: #fbfffc;
        color: #17211e;
        box-shadow: 0 14px 40px rgba(10, 22, 18, .22);
        font: 13px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .panel.bigbang {
        width: min(500px, calc(100vw - 24px));
        max-height: min(600px, calc(100vh - 24px));
      }
      .bigbang-icon {
        position: fixed;
        z-index: 2147483646;
        width: 36px;
        height: 36px;
        border: 0;
        border-radius: 50%;
        background: #e8a020;
        color: #fff;
        font-size: 18px;
        line-height: 36px;
        text-align: center;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(232, 160, 32, .35);
        transition: transform .15s ease, box-shadow .15s ease;
        user-select: none;
      }
      .bigbang-icon:hover {
        transform: scale(1.15);
        box-shadow: 0 6px 20px rgba(232, 160, 32, .5);
      }
      .top {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .title {
        min-width: 0;
        font-size: 15px;
        font-weight: 700;
        overflow-wrap: anywhere;
      }
      button {
        width: 28px;
        height: 28px;
        border: 0;
        border-radius: 6px;
        background: #eef4ef;
        color: #17211e;
        cursor: pointer;
        font: inherit;
      }
      h3 {
        margin: 10px 0 4px;
        font-size: 12px;
        color: #47635a;
      }
      p, ul { margin: 0; }
      ul { padding-left: 18px; }
      li { margin: 2px 0; }
      .status { color: #47635a; }
      .error { color: #9f1d20; }
      .example-en { font-weight: 600; }
      .example-zh { color: #47635a; margin-top: 2px; }
      .bang-card {
        padding: 10px 12px;
        margin-bottom: 8px;
        border: 1px solid #e0e8e3;
        border-radius: 8px;
        background: #f6faf7;
        border-left: 4px solid #8ab8a8;
      }
      .bang-card:nth-child(even) {
        background: #f0f6f2;
        border-left-color: #c49a6c;
      }
      .bang-card.phrase {
        border-left-color: #e8a020;
        background: #fdf8ee;
      }
      .bang-word {
        font-size: 16px;
        font-weight: 700;
        color: #17211e;
      }
      .bang-type {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 4px;
        background: #dce8e1;
        color: #2d4a40;
        font-size: 11px;
        font-weight: 600;
        vertical-align: middle;
      }
      .bang-card:nth-child(even) .bang-type {
        background: #e8dccc;
        color: #5a3e28;
      }
      .bang-card.phrase .bang-type {
        background: #e8d48b;
        color: #5a4a08;
      }
      .bang-meaning {
        margin-top: 4px;
        font-size: 14px;
        color: #1a3a2e;
      }
      .bang-explanation {
        margin-top: 2px;
        font-size: 12px;
        color: #5a7a6e;
      }
      .bang-card:nth-child(even) .bang-meaning {
        color: #2d1a08;
      }
      .bang-card:nth-child(even) .bang-explanation {
        color: #6a5a4a;
      }
      .bang-translation {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #e0e8e3;
        font-size: 13px;
        color: #2d4a40;
      }
      .bang-translation strong {
        color: #17211e;
      }
    </style>
    <section class="panel" hidden>
      <div class="top">
        <div class="title"></div>
        <button type="button" title="关闭">×</button>
      </div>
      <div class="body"></div>
    </section>
  `
  const panel = shadow.querySelector<HTMLElement>('.panel')
  const title = shadow.querySelector<HTMLElement>('.title')
  const body = shadow.querySelector<HTMLElement>('.body')
  const closeButton = shadow.querySelector<HTMLButtonElement>('button')

  if (!panel || !title || !body || !closeButton) {
    throw new Error('Failed to create assistant UI')
  }

  closeButton.addEventListener('click', () => {
    panel.hidden = true
  })

  return { host, panel, title, body }
}

function renderResult(ui: AssistantUi, result: TranslationResult) {
  const examples = result.examples
    .map(
      (example) => `
        <li>
          <div class="example-en">${escapeHtml(example.english)}</div>
          <div class="example-zh">${escapeHtml(example.translation)}</div>
        </li>
      `
    )
    .join('')
  ui.body.innerHTML = `
    <h3>meanings</h3>
    <p>${escapeHtml(result.sentenceMeaning)}</p>
    <h3>translation</h3>
    <p>${escapeHtml(result.sentenceTranslation)}</p>
    <h3>sentenses</h3>
    <ul>${examples || '<li>暂无示例</li>'}</ul>
  `
}

function renderMeaningOnly(ui: AssistantUi, word: string, meaning: string) {
  ui.title.textContent = word
  ui.body.innerHTML = `<p>${escapeHtml(meaning)}</p>`
}

function positionPanel(panel: HTMLElement, rect: DOMRect) {
  const gap = 8
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - 372)
  const below = rect.bottom + gap
  const top = below < window.innerHeight - 180 ? below : rect.top - 180 - gap
  panel.style.left = `${Math.max(12, left)}px`
  panel.style.top = `${Math.max(12, top)}px`
}

function isUsefulSelection(value: string): boolean {
  return value.length > 0 && value.length <= 80 && !/^\d+$/.test(value)
}

function isEnglishWord(value: string): boolean {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(value)
}

function isEnglishText(value: string): boolean {
  return /^[A-Za-z\s'\-]+$/.test(value) && /[A-Za-z]/.test(value)
}

function trimSelectionRange(range: Range): Range {
  const trimmed = range.cloneRange()

  while (trimmed.toString().length > 0 && /\s$/.test(trimmed.toString())) {
    const { endContainer, endOffset } = trimmed
    if (endContainer.nodeType !== Node.TEXT_NODE) break

    const text = endContainer.textContent || ''
    let nextOffset = endOffset
    while (nextOffset > 0 && /\s/.test(text[nextOffset - 1] || '')) {
      nextOffset--
    }

    if (nextOffset === endOffset) break
    trimmed.setEnd(endContainer, nextOffset)
  }

  return trimmed
}

function extractSentence(selection: Selection, fallback: string): string {
  const range = selection.getRangeAt(0)
  const node = range.startContainer
  if (node.nodeType !== Node.TEXT_NODE) return fallback

  const text = node.textContent || ''
  if (!text.trim()) return fallback

  const startOffset = range.startOffset
  const endOffset = range.endOffset
  const left = text.slice(0, startOffset).search(/[^.!?。！？]*$/)
  const rightMatch = text.slice(endOffset).match(/^[^.!?。！？]*/)
  const sentenceStart = left >= 0 ? left : 0
  const sentenceEnd = endOffset + (rightMatch?.[0]?.length || 0)
  return normalizeInlineText(text.slice(sentenceStart, sentenceEnd)) || fallback
}

function normalizeInlineText(value: string): string {
  return value.trim().replace(/\s+/g, ' ')
}

function highlightRange(range: Range): HTMLElement | null {
  const marker = document.createElement('span')
  marker.className = HIGHLIGHT_CLASS
  try {
    range.surroundContents(marker)
    return marker
  } catch {
    if (
      range.startContainer === range.endContainer &&
      range.startContainer.nodeType === Node.TEXT_NODE
    ) {
      marker.textContent = range.toString()
      range.deleteContents()
      range.insertNode(marker)
      return marker
    }
  }

  return null
}

function findHighlightMarker(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Element)) return null
  return target.closest<HTMLElement>(`.${HIGHLIGHT_CLASS}`)
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  return '翻译失败，请检查配置后重试。'
}

function createBigBangIcon(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'bigbang-icon'
  el.textContent = '⚡'
  el.title = '逐词分析'
  el.hidden = true
  return el
}

function showBigBangIcon(icon: HTMLElement, rect: DOMRect) {
  const gap = 6
  let left = rect.right + gap
  let top = rect.top - 18
  if (left + 36 > window.innerWidth - 12) {
    left = rect.left - 36 - gap
  }
  if (top < 12) {
    top = rect.bottom + gap
  }
  icon.style.left = `${Math.max(12, left)}px`
  icon.style.top = `${Math.max(12, top)}px`
  icon.hidden = false
}

function hideBigBangIcon(icon: HTMLElement) {
  icon.hidden = true
}

async function requestBigBang(ui: AssistantUi, payload: BigBangPayload) {
  ui.panel.classList.add('bigbang')
  positionPanel(ui.panel, payload.rect)
  ui.title.textContent = payload.word
  ui.body.innerHTML = '<div class="status">⚡ 大爆炸分析中...</div>'
  ui.panel.hidden = false

  try {
    const result = await sendMessage('analyzeBigBang', {
      word: payload.word,
      sentence: payload.sentence,
      pageTitle: document.title,
      pageUrl: location.href
    })
    renderBigBangResult(ui, result)
  } catch (error) {
    ui.body.innerHTML = `<div class="error">${escapeHtml(getErrorMessage(error))}</div>`
  }
}

function renderBigBangResult(ui: AssistantUi, result: BigBangResult) {
  const cards = result.items
    .map(
      (item, index) => {
        const isPhrase = item.type === 'phrase'
        const extraClass = isPhrase ? ' phrase' : ''
        return `
        <div class="bang-card${extraClass}" style="--card-index: ${index}">
          <div>
            <span class="bang-word">${escapeHtml(item.word)}</span>
            <span class="bang-type">${escapeHtml(item.type)}</span>
          </div>
          <div class="bang-meaning">${escapeHtml(item.meaning)}</div>
          <div class="bang-explanation">${escapeHtml(item.explanation)}</div>
        </div>
      `
      }
    )
    .join('')

  ui.body.innerHTML = `
    ${cards}
    <div class="bang-translation"><strong>整句翻译：</strong>${escapeHtml(result.sentenceTranslation)}</div>
  `
}

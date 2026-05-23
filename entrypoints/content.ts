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

    const chipPanel = createWordChipPanel()
    ui.host.shadowRoot!.append(chipPanel)
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
      hideWordChipPanel(chipPanel)
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
      hideWordChipPanel(chipPanel)
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
        if (!isLongSelection(text) || !isEnglishText(text)) {
          hideBigBangIcon(bigBangIcon)
          return
        }

        if (panelMode === 'analysis' && !ui.panel.hidden) return
        if (!chipPanel.hidden) return

        const range = selection.getRangeAt(0)
        const rect = range.getBoundingClientRect()
        const sentence = extractSentence(selection, text)

        bigBangPayload = { word: text, sentence, rect }
        showBigBangIcon(bigBangIcon, rect)
      }, 20)
    }

    const handleMouseDown = () => {
      // handled by document click
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        ui.panel.hidden = true
        hideWordChipPanel(chipPanel)
        hideBigBangIcon(bigBangIcon)
      }
    }

    const handleScroll = () => {
      hideWordChipPanel(chipPanel)
      hideBigBangIcon(bigBangIcon)
    }

    const handleIconClick = () => {
      if (!bigBangPayload) return
      hideBigBangIcon(bigBangIcon)
      showWordChipPanel(chipPanel, bigBangPayload.word, bigBangPayload.rect, ui, bigBangPayload)
    }

    document.addEventListener('dblclick', handleSelection)
    document.addEventListener('mouseover', handleHighlightMouseover)
    document.addEventListener('mouseout', handleHighlightMouseout)
    document.addEventListener('click', handleDocumentClick)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('scroll', handleScroll, true)

    bigBangIcon.addEventListener('click', handleIconClick)

    ctx.onInvalidated(() => {
      document.removeEventListener('dblclick', handleSelection)
      document.removeEventListener('mouseover', handleHighlightMouseover)
      document.removeEventListener('mouseout', handleHighlightMouseout)
      document.removeEventListener('click', handleDocumentClick)
      document.removeEventListener('mouseup', handleMouseUp)
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
        border: 1px solid rgba(0, 0, 0, .08);
        border-radius: 10px;
        background: #ffffff;
        color: #111111;
        box-shadow: 0 8px 32px rgba(0, 0, 0, .12);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Display",
          "Helvetica Neue", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .panel.bigbang {
        width: min(500px, calc(100vw - 24px));
        max-height: min(600px, calc(100vh - 24px));
      }
      .bigbang-icon {
        position: fixed;
        z-index: 2147483646;
        width: 34px;
        height: 34px;
        border: 0;
        border-radius: 50%;
        background: #111111;
        color: #ffffff;
        font-size: 16px;
        line-height: 34px;
        text-align: center;
        cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, .18);
        transition: all .2s cubic-bezier(0.25, 0.8, 0.25, 1);
        user-select: none;
      }
      .bigbang-icon:hover {
        transform: scale(1.12);
        box-shadow: 0 4px 16px rgba(0, 0, 0, .24);
      }
      .bigbang-icon:active {
        transform: scale(0.95);
      }
      .bigbang-icon[hidden] {
        display: none;
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
        color: #111111;
      }
      button {
        width: 26px;
        height: 26px;
        border: 0;
        border-radius: 6px;
        background: #f5f5f7;
        color: #111111;
        cursor: pointer;
        font: inherit;
        transition: all .2s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      button:hover {
        background: #e8e8ed;
      }
      h3 {
        margin: 8px 0 3px;
        font-size: 10px;
        font-weight: 600;
        color: #86868b;
        letter-spacing: .04em;
        text-transform: uppercase;
      }
      p, ul { margin: 0; }
      ul { padding-left: 18px; }
      li { margin: 2px 0; }
      .status { color: #86868b; font-size: 12px; }
      .error { color: #c41e3a; font-size: 12px; }
      .example-en { font-weight: 600; color: #111111; }
      .example-zh { color: #86868b; margin-top: 2px; font-size: 12px; }
      .bang-card {
        padding: 10px 12px;
        margin-bottom: 8px;
        border: 1px solid #e8e8ed;
        border-radius: 8px;
        background: #fafafa;
        border-left: 3px solid #c7c7cc;
        transition: all .2s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      .bang-card:nth-child(even) {
        background: #f5f5f7;
        border-left-color: #aeaeb2;
      }
      .bang-card.phrase {
        border-left-color: #111111;
        background: #ffffff;
      }
      .bang-word {
        font-size: 15px;
        font-weight: 700;
        color: #111111;
      }
      .bang-type {
        display: inline-block;
        margin-left: 6px;
        padding: 1px 6px;
        border-radius: 4px;
        background: #e8e8ed;
        color: #636366;
        font-size: 10px;
        font-weight: 600;
        vertical-align: middle;
        letter-spacing: .02em;
      }
      .bang-card:nth-child(even) .bang-type {
        background: #dcdce0;
        color: #555557;
      }
      .bang-card.phrase .bang-type {
        background: #111111;
        color: #ffffff;
      }
      .bang-meaning {
        margin-top: 4px;
        font-size: 13px;
        color: #111111;
      }
      .bang-explanation {
        margin-top: 2px;
        font-size: 11px;
        color: #636366;
      }
      .bang-card:nth-child(even) .bang-meaning {
        color: #111111;
      }
      .bang-card:nth-child(even) .bang-explanation {
        color: #636366;
      }
      .bang-translation {
        margin-top: 10px;
        padding-top: 8px;
        border-top: 1px solid #e8e8ed;
        font-size: 12px;
        color: #636366;
      }
      .bang-translation strong {
        color: #111111;
        font-weight: 600;
      }
      .chip-panel {
        position: fixed;
        z-index: 2147483646;
        width: auto;
        max-width: min(360px, calc(100vw - 24px));
        box-sizing: border-box;
        padding: 10px 12px;
        border: 1px solid rgba(0, 0, 0, .08);
        border-radius: 10px;
        background: #ffffff;
        box-shadow: 0 8px 32px rgba(0, 0, 0, .12);
        font: 13px/1.5 -apple-system, BlinkMacSystemFont, "SF Pro Display",
          "Helvetica Neue", system-ui, sans-serif;
        -webkit-font-smoothing: antialiased;
      }
      .chip-panel[hidden] {
        display: none;
      }
      .chip-hint {
        font-size: 10px;
        font-weight: 600;
        color: #86868b;
        letter-spacing: .03em;
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .chip-row {
        display: flex;
        flex-wrap: wrap;
        gap: 5px;
        margin-bottom: 10px;
      }
      .chip {
        display: inline-block;
        padding: 3px 10px;
        border: 1px solid #c7c7cc;
        border-radius: 14px;
        background: #f5f5f7;
        color: #111111;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all .2s cubic-bezier(0.25, 0.8, 0.25, 1);
        user-select: none;
      }
      .chip.active {
        background: #111111;
        color: #ffffff;
        border-color: #111111;
      }
      .chip:hover {
        opacity: .8;
      }
      .chip-foot {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 8px;
      }
      .chip-done {
        height: 28px;
        padding: 0 16px;
        border: 0;
        border-radius: 6px;
        background: #111111;
        color: #ffffff;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition: all .2s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      .chip-done:hover {
        background: #2c2c2e;
      }
      .chip-done:active {
        transform: scale(0.97);
      }
      .chip-cancel {
        height: 28px;
        padding: 0 8px;
        border: 0;
        border-radius: 6px;
        background: transparent;
        color: #86868b;
        font-size: 12px;
        cursor: pointer;
        transition: all .2s cubic-bezier(0.25, 0.8, 0.25, 1);
      }
      .chip-cancel:hover {
        color: #111111;
      }
    </style>
    <section class="panel" hidden>
      <div class="top">
        <div class="title"></div>
        <button type="button" title="关闭">×</button>
      </div>
      <div class="body"></div>
    </section>
    <div class="chip-panel" hidden></div>
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
  return value.length > 0 && value.length <= 200 && !/^\d+$/.test(value)
}

function isLongSelection(value: string): boolean {
  return value.length > 0 && value.length <= 600 && !/^\d+$/.test(value)
}

function isEnglishWord(value: string): boolean {
  return /^[A-Za-z]+(?:['-][A-Za-z]+)*$/.test(value)
}

function isEnglishText(value: string): boolean {
  const cleaned = value.replace(/[^A-Za-z\s]/g, '').trim()
  return cleaned.length > 0 && /[A-Za-z]/.test(cleaned)
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

function createWordChipPanel(): HTMLElement {
  const el = document.createElement('div')
  el.className = 'chip-panel'
  el.hidden = true
  return el
}

function showWordChipPanel(
  panel: HTMLElement,
  fullText: string,
  rect: DOMRect,
  ui: AssistantUi,
  payload: BigBangPayload
) {
  const words = fullText.split(/\s+/).filter(Boolean)
  if (words.length < 1) return

  const chips = words
    .map(
      (w, i) =>
        `<span class="chip active" data-index="${i}">${escapeHtml(w)}</span>`
    )
    .join('')

  panel.innerHTML = `
    <div class="chip-hint">选择要分析的单词</div>
    <div class="chip-row">${chips}</div>
    <div class="chip-foot">
      <button type="button" class="chip-cancel" id="chip-cancel">取消</button>
      <button type="button" class="chip-done" id="chip-done">完成</button>
    </div>
  `

  positionChipPanel(panel, rect)
  panel.hidden = false

  const chipElements = panel.querySelectorAll<HTMLElement>('.chip')
  chipElements.forEach((chip) => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('active')
    })
  })

  panel.querySelector('#chip-done')?.addEventListener('click', () => {
    const selected: string[] = []
    panel.querySelectorAll<HTMLElement>('.chip.active').forEach((chip) => {
      const idx = parseInt(chip.dataset.index || '0', 10)
      const w = words[idx]
      if (w) selected.push(w)
    })
    if (selected.length === 0) return
    panel.hidden = true
    const word = selected.join(' ')
    ui.panel.classList.add('bigbang')
    ui.panel.hidden = false
    ui.title.textContent = word
    ui.body.innerHTML = '<div class="status">⏳ 分析中...</div>'
    positionPanel(ui.panel, rect)
    void requestBigBang(ui, { word, sentence: payload.sentence, rect })
  })

}

function hideWordChipPanel(panel: HTMLElement) {
  panel.hidden = true
}

function positionChipPanel(panel: HTMLElement, rect: DOMRect) {
  const gap = 8
  const below = rect.bottom + gap
  const top = below < window.innerHeight - 120 ? below : rect.top - 120 - gap
  const left = Math.min(Math.max(12, rect.left), window.innerWidth - 372)
  panel.style.left = `${Math.max(12, left)}px`
  panel.style.top = `${Math.max(12, top)}px`
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

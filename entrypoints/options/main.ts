import { sendMessage } from '../../src/utils/messaging'
import { downloadFile, dateStamp } from '../../src/shared/download'
import { escapeHtml, getElement } from '../../src/shared/dom'
import { recordsToCsv, toExportRecords } from '../../src/shared/exportRecords'
import { getProviderDefaults } from '../../src/shared/providerDefaults'
import type {
  AssistantSettings,
  Provider,
  TranslationRecord
} from '../../src/shared/types'

import './style.css'

const provider = getElement<HTMLSelectElement>('provider')
const baseUrl = getElement<HTMLInputElement>('baseUrl')
const apiKey = getElement<HTMLInputElement>('apiKey')
const model = getElement<HTMLInputElement>('model')
const targetLanguage = getElement<HTMLInputElement>('targetLanguage')
const saveSettings = getElement<HTMLButtonElement>('saveSettings')
const status = getElement<HTMLParagraphElement>('status')
const search = getElement<HTMLInputElement>('search')
const summary = getElement<HTMLParagraphElement>('summary')
const recordsBody = getElement<HTMLTableSectionElement>('recordsBody')
const exportJson = getElement<HTMLButtonElement>('exportJson')
const exportCsv = getElement<HTMLButtonElement>('exportCsv')
const importRecordsBtn = getElement<HTMLButtonElement>('importRecords')
const importRecordsInput = getElement<HTMLInputElement>('importRecordsInput')
const clearRecords = getElement<HTMLButtonElement>('clearRecords')
const exportConfig = getElement<HTMLButtonElement>('exportConfig')
const importConfig = getElement<HTMLButtonElement>('importConfig')
const importConfigInput = getElement<HTMLInputElement>('importConfigInput')

let records: TranslationRecord[] = []

void loadRecords()

search.addEventListener('input', render)

exportJson.addEventListener('click', () => {
  downloadFile(
    `ai-selection-records-${dateStamp()}.json`,
    JSON.stringify(toExportRecords(filteredRecords()), null, 2),
    'application/json'
  )
})

exportCsv.addEventListener('click', () => {
  downloadFile(
    `ai-selection-records-${dateStamp()}.csv`,
    recordsToCsv(filteredRecords()),
    'text/csv;charset=utf-8'
  )
})

importRecordsBtn.addEventListener('click', () => {
  importRecordsInput.value = ''
  importRecordsInput.click()
})

importRecordsInput.addEventListener('change', async () => {
  const file = importRecordsInput.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const imported = JSON.parse(text)
    const list = Array.isArray(imported)
      ? imported
      : Array.isArray(imported.records)
        ? imported.records
        : []

    if (list.length === 0) {
      flashStatus('文件中没有找到有效记录')
      return
    }

    await sendMessage('importRecords', { records: list })
    records = await sendMessage('getRecords')
    render()
    flashStatus(`已导入 ${list.length} 条记录`)
  } catch {
    flashStatus('文件解析失败，请检查 JSON 格式')
  }
})

clearRecords.addEventListener('click', async () => {
  if (!confirm('Clear all marked words?')) return

  await sendMessage('clearRecords')
  records = []
  render()
})

exportConfig.addEventListener('click', async () => {
  const settings = await sendMessage('getSettings')
  downloadFile(
    `ai-selection-config-${dateStamp()}.json`,
    JSON.stringify(settings, null, 2),
    'application/json'
  )
  flashStatus('配置已导出')
})

importConfig.addEventListener('click', () => {
  importConfigInput.value = ''
  importConfigInput.click()
})

importConfigInput.addEventListener('change', async () => {
  const file = importConfigInput.files?.[0]
  if (!file) return

  try {
    const text = await file.text()
    const settings = JSON.parse(text) as AssistantSettings

    if (!settings.provider || !settings.baseUrl || !settings.model) {
      flashStatus('配置文件缺少必要字段')
      return
    }

    const saved = await sendMessage('saveSettings', settings)
    fillSettings(saved)
    flashStatus('配置已导入')
  } catch {
    flashStatus('文件解析失败，请检查 JSON 格式')
  }
})

recordsBody.addEventListener('click', async (event: MouseEvent) => {
  const target = event.target
  if (!(target instanceof HTMLElement)) return

  const deleteButton = target.closest<HTMLButtonElement>('[data-delete-id]')
  if (!deleteButton) return

  await sendMessage('deleteRecord', { id: deleteButton.dataset.deleteId || '' })
  records = records.filter((record) => record.id !== deleteButton.dataset.deleteId)
  render()
})

async function loadRecords() {
  const [settings, savedRecords] = await Promise.all([
    sendMessage('getSettings'),
    sendMessage('getRecords')
  ])
  fillSettings(settings)
  records = savedRecords
  render()
}

provider.addEventListener('change', () => {
  const defaults = getProviderDefaults(provider.value as Provider)
  baseUrl.value = defaults.baseUrl
  model.value = defaults.model
})

saveSettings.addEventListener('click', async () => {
  const settings = await sendMessage('saveSettings', readSettings())
  fillSettings(settings)
  flashStatus('已保存')
})

function render() {
  const items = filteredRecords()
  summary.textContent = `${items.length} / ${records.length} records`

  if (items.length === 0) {
    recordsBody.innerHTML = `
      <tr class="empty-row">
        <td colspan="7">No marked words.</td>
      </tr>
    `
    return
  }

  recordsBody.replaceChildren(...items.map((record) => renderRecordRow(record)))
}

function renderRecordRow(record: TranslationRecord): HTMLTableRowElement {
  const row = document.createElement('tr')
  const createdAt = new Date(record.createdAt).toLocaleString()
  const examples = record.examples
    .map(
      (example) => `
        <div class="example">
          <span>${escapeHtml(example.english)}</span>
          <small>${escapeHtml(example.translation)}</small>
        </div>
      `
    )
    .join('')

  row.innerHTML = `
    <td class="word">${escapeHtml(record.word)}</td>
    <td class="meaning">${escapeHtml(record.sentenceMeaning)}</td>
    <td class="sentence">${escapeHtml(record.sentence)}</td>
    <td class="translation">${escapeHtml(record.sentenceTranslation)}</td>
    <td class="examples">${examples}</td>
    <td class="created">${escapeHtml(createdAt)}</td>
    <td class="actions">
      <button type="button" class="danger ghost" data-delete-id="${escapeHtml(record.id)}">Delete</button>
    </td>
  `
  return row
}

function filteredRecords(): TranslationRecord[] {
  const keyword = search.value.trim().toLowerCase()
  if (!keyword) return records

  return records.filter((record) => {
    const haystack = [
      record.word,
      record.sentence,
      record.sentenceMeaning,
      record.sentenceTranslation,
      ...record.examples.flatMap((example) => [
        example.english,
        example.translation
      ])
    ]
      .join(' ')
      .toLowerCase()
    return haystack.includes(keyword)
  })
}

function fillSettings(settings: AssistantSettings) {
  provider.value = settings.provider
  baseUrl.value = settings.baseUrl
  apiKey.value = settings.apiKey
  model.value = settings.model
  targetLanguage.value = settings.targetLanguage
}

function readSettings(): AssistantSettings {
  return {
    provider: provider.value as Provider,
    baseUrl: baseUrl.value,
    apiKey: apiKey.value,
    model: model.value,
    targetLanguage: targetLanguage.value
  }
}

function flashStatus(message: string) {
  status.textContent = message
  window.setTimeout(() => {
    status.textContent = ''
  }, 1600)
}

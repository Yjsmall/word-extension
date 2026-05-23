import { assistantSettings } from '../src/utils/storage'
import { onMessage } from '../src/utils/messaging'
import { normalizeSettings } from '../src/shared/providerDefaults'
import { translateWithAi, analyzeBigBangWithAi } from '../src/utils/aiClient'
import type { BigBangResult } from '../src/shared/types'
import {
  clearRecords,
  deleteRecord,
  getRecords,
  importRecords,
  saveRecord
} from '../src/utils/recordsService'

export default defineBackground(() => {
  browser.action.onClicked.addListener(() => {
    void browser.tabs.create({
      url: browser.runtime.getURL('/options.html')
    })
  })

  onMessage('getSettings', () => assistantSettings.getValue())

  onMessage('saveSettings', async ({ data }) => {
    const normalized = normalizeSettings(data)
    await assistantSettings.setValue(normalized)
    return normalized
  })

  onMessage('getRecords', () => getRecords())

  onMessage('deleteRecord', async ({ data }) => {
    await deleteRecord(data.id)
    return { ok: true }
  })

  onMessage('clearRecords', async () => {
    await clearRecords()
    return { ok: true }
  })

  onMessage('translateSelection', async ({ data }) => {
    const settings = await assistantSettings.getValue()
    const result = await translateWithAi(settings, data)
    await saveRecord(data, result, normalizeSettings(settings))
    return result
  })

  onMessage('analyzeBigBang', async ({ data }) => {
    const settings = await assistantSettings.getValue()
    console.log('[BigBang] settings:', JSON.stringify({ ...settings, apiKey: settings.apiKey ? '***' + settings.apiKey.slice(-4) : '(empty)' }))
    try {
      const result = await analyzeBigBangWithAi(settings, data)
      console.log('[BigBang] result items:', result.items.length)
      return result
    } catch (error) {
      console.error('[BigBang] analyze failed:', error)
      throw error
    }
  })

  onMessage('importRecords', async ({ data }) => {
    await importRecords(data.records)
    return { ok: true }
  })

  onMessage('saveBigBangRecords', async ({ data }) => {
    const settings = await assistantSettings.getValue()
    const normalized = normalizeSettings(settings)
    const { request, result } = data
    for (const item of result.items) {
      await saveRecord(
        { ...request, word: item.word },
        {
          word: item.word,
          sentenceMeaning: `${item.meaning}（${item.explanation}）`,
          sentenceTranslation: result.sentenceTranslation,
          examples: []
        },
        normalized
      )
    }
    return { ok: true }
  })
})

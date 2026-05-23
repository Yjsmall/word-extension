import { assistantSettings } from '../src/utils/storage'
import { onMessage } from '../src/utils/messaging'
import { normalizeSettings } from '../src/shared/providerDefaults'
import { translateWithAi, analyzeBigBangWithAi } from '../src/utils/aiClient'
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
    const result = await analyzeBigBangWithAi(settings, data)
    return result
  })

  onMessage('importRecords', async ({ data }) => {
    await importRecords(data.records)
    return { ok: true }
  })
})

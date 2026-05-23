import type {
  AssistantSettings,
  TranslationRecord,
  TranslationRequest,
  TranslationResult
} from '../shared/types'
import { translationRecords } from './storage'

const MAX_RECORDS = 500

export function getRecords() {
  return translationRecords.getValue()
}

export async function saveRecord(
  request: TranslationRequest,
  result: TranslationResult,
  settings: AssistantSettings
): Promise<TranslationRecord> {
  const record: TranslationRecord = {
    ...request,
    ...result,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    provider: settings.provider,
    model: settings.model
  }
  const currentRecords = await translationRecords.getValue()
  await translationRecords.setValue(
    [record, ...currentRecords].slice(0, MAX_RECORDS)
  )
  return record
}

export async function deleteRecord(id: string) {
  const currentRecords = await translationRecords.getValue()
  await translationRecords.setValue(
    currentRecords.filter((record) => record.id !== id)
  )
}

export function clearRecords() {
  return translationRecords.setValue([])
}

export async function importRecords(records: TranslationRecord[]) {
  const currentRecords = await translationRecords.getValue()
  const existingIds = new Set(currentRecords.map((r) => r.id))
  const newRecords = records.filter((r) => !existingIds.has(r.id))
  if (newRecords.length === 0) return
  await translationRecords.setValue(
    [...newRecords, ...currentRecords].slice(0, MAX_RECORDS)
  )
}

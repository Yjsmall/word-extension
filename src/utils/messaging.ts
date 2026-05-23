import { defineExtensionMessaging } from '@webext-core/messaging'
import type {
  AssistantSettings,
  BigBangResult,
  TranslationRecord,
  TranslationRequest,
  TranslationResult
} from '../shared/types'

interface ProtocolMap {
  translateSelection(data: TranslationRequest): TranslationResult
  analyzeBigBang(data: TranslationRequest): BigBangResult
  getSettings(): AssistantSettings
  saveSettings(data: AssistantSettings): AssistantSettings
  getRecords(): TranslationRecord[]
  deleteRecord(data: { id: string }): { ok: true }
  clearRecords(): { ok: true }
  importRecords(data: { records: TranslationRecord[] }): { ok: true }
  saveBigBangRecords(data: {
    request: TranslationRequest
    result: BigBangResult
  }): { ok: true }
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<ProtocolMap>()

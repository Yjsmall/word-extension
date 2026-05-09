import { defineExtensionMessaging } from '@webext-core/messaging'
import type {
  AssistantSettings,
  TranslationRecord,
  TranslationRequest,
  TranslationResult
} from '../shared/types'

interface ProtocolMap {
  translateSelection(data: TranslationRequest): TranslationResult
  getSettings(): AssistantSettings
  saveSettings(data: AssistantSettings): AssistantSettings
  getRecords(): TranslationRecord[]
  deleteRecord(data: { id: string }): { ok: true }
  clearRecords(): { ok: true }
}

export const { sendMessage, onMessage } =
  defineExtensionMessaging<ProtocolMap>()

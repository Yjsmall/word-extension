import type { TranslationRecord } from './types'

export function toExportRecords(records: TranslationRecord[]) {
  return records.map(toExportRecord)
}

export function toExportRecord(record: TranslationRecord) {
  const { pageTitle, pageUrl, ...exportRecord } = record
  void pageTitle
  void pageUrl
  return exportRecord
}

export function recordsToCsv(items: TranslationRecord[]): string {
  const rows = [
    [
      'createdAt',
      'word',
      'sentence',
      'sentenceMeaning',
      'sentenceTranslation',
      'examples',
      'exampleTranslations',
      'provider',
      'model'
    ],
    ...items.map((item) => [
      item.createdAt,
      item.word,
      item.sentence,
      item.sentenceMeaning,
      item.sentenceTranslation,
      item.examples.map((example) => example.english).join('\n'),
      item.examples
        .map((example) => `${example.english} | ${example.translation}`)
        .join('\n'),
      item.provider,
      item.model
    ])
  ]
  return rows.map((row) => row.map(csvCell).join(',')).join('\n')
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

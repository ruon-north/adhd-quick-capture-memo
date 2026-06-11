export type MemoStatus = 'inbox' | 'kept' | 'done'

export interface Memo {
  id?: number
  body: string
  urls: string[]
  status: MemoStatus
  createdAt: string
  updatedAt: string
}

export interface AppSetting {
  key: string
  value: string
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/giu
const TRAILING_PUNCTUATION = /[),.;!?\u3002\u3001\uff0c\uff0e\uff01\uff1f\uff09\u3009\u300b\u300d\u300f]+$/u

export function extractUrls(text: string): string[] {
  const matches = text.match(URL_PATTERN) ?? []
  return [...new Set(matches.map((url) => url.replace(TRAILING_PUNCTUATION, '')))]
}

export function normalizeSearchText(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase()
}

export function memoMatchesQuery(memo: Memo, query: string): boolean {
  const normalizedQuery = normalizeSearchText(query.trim())
  if (!normalizedQuery) return true

  return normalizeSearchText(`${memo.body}\n${memo.urls.join('\n')}`).includes(
    normalizedQuery
  )
}

export function createMemo(body: string, now = new Date()): Memo {
  const timestamp = now.toISOString()

  return {
    body,
    urls: extractUrls(body),
    status: 'inbox',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

export function reviseMemo(
  memo: Memo,
  changes: Pick<Memo, 'body' | 'status'>,
  now = new Date()
): Memo {
  return {
    ...memo,
    body: changes.body,
    urls: extractUrls(changes.body),
    status: changes.status,
    updatedAt: now.toISOString()
  }
}

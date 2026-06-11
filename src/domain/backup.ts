import type { AppSetting, Memo, MemoStatus } from './memo'

export const BACKUP_SCHEMA_VERSION = 1

export interface MemoBackup {
  schemaVersion: typeof BACKUP_SCHEMA_VERSION
  exportedAt: string
  memos: Memo[]
  settings: AppSetting[]
}

const memoStatuses = new Set<MemoStatus>(['inbox', 'kept', 'done'])

export function validateBackup(value: unknown): MemoBackup {
  if (!isRecord(value)) throw new Error('バックアップの形式が正しくありません。')
  if (value.schemaVersion !== BACKUP_SCHEMA_VERSION) {
    throw new Error('このバックアップのバージョンには対応していません。')
  }
  if (!isIsoDate(value.exportedAt)) {
    throw new Error('バックアップの出力日時が正しくありません。')
  }
  if (!Array.isArray(value.memos) || !Array.isArray(value.settings)) {
    throw new Error('バックアップに必要なデータがありません。')
  }

  const memos = value.memos.map(validateMemo)
  const settings = value.settings.map(validateSetting)
  const ids = memos.map((memo) => memo.id).filter((id) => id !== undefined)
  if (new Set(ids).size !== ids.length) {
    throw new Error('バックアップ内のメモIDが重複しています。')
  }

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: value.exportedAt,
    memos,
    settings
  }
}

export function parseBackupJson(text: string): MemoBackup {
  let value: unknown
  try {
    value = JSON.parse(text)
  } catch {
    throw new Error('JSONファイルを読み取れませんでした。')
  }
  return validateBackup(value)
}

function validateMemo(value: unknown): Memo {
  if (
    !isRecord(value) ||
    (value.id !== undefined &&
      (!Number.isSafeInteger(value.id) || Number(value.id) < 1)) ||
    typeof value.body !== 'string' ||
    !Array.isArray(value.urls) ||
    !value.urls.every((url) => typeof url === 'string') ||
    typeof value.status !== 'string' ||
    !memoStatuses.has(value.status as MemoStatus) ||
    !isIsoDate(value.createdAt) ||
    !isIsoDate(value.updatedAt)
  ) {
    throw new Error('バックアップ内に不正なメモがあります。')
  }

  return {
    id: value.id as number | undefined,
    body: value.body,
    urls: value.urls as string[],
    status: value.status as MemoStatus,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  }
}

function validateSetting(value: unknown): AppSetting {
  if (
    !isRecord(value) ||
    typeof value.key !== 'string' ||
    typeof value.value !== 'string'
  ) {
    throw new Error('バックアップ内に不正な設定があります。')
  }
  return { key: value.key, value: value.value }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isIsoDate(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

import { describe, expect, it } from 'vitest'
import {
  BACKUP_SCHEMA_VERSION,
  parseBackupJson,
  validateBackup
} from '../src/domain/backup'
import { createMemo } from '../src/domain/memo'

describe('backup validation', () => {
  const validBackup = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: '2026-06-11T00:00:00.000Z',
    memos: [{ ...createMemo('remember this'), id: 1 }],
    settings: [{ key: 'lastRediscoveryMemoId', value: '1' }]
  }

  it('accepts a valid versioned backup', () => {
    expect(validateBackup(validBackup)).toEqual(validBackup)
    expect(parseBackupJson(JSON.stringify(validBackup))).toEqual(validBackup)
  })

  it('rejects malformed JSON and unsupported schemas', () => {
    expect(() => parseBackupJson('{')).toThrow('JSONファイルを読み取れませんでした。')
    expect(() =>
      validateBackup({ ...validBackup, schemaVersion: 99 })
    ).toThrow('このバックアップのバージョンには対応していません。')
  })

  it('rejects duplicate IDs and malformed memo data', () => {
    expect(() =>
      validateBackup({
        ...validBackup,
        memos: [validBackup.memos[0], validBackup.memos[0]]
      })
    ).toThrow('バックアップ内のメモIDが重複しています。')

    expect(() =>
      validateBackup({
        ...validBackup,
        memos: [{ ...validBackup.memos[0], status: 'unknown' }]
      })
    ).toThrow('バックアップ内に不正なメモがあります。')
  })
})

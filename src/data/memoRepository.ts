import Dexie, { type EntityTable } from 'dexie'
import {
  BACKUP_SCHEMA_VERSION,
  type MemoBackup
} from '../domain/backup'
import {
  memoMatchesQuery,
  type AppSetting,
  type Memo,
  type MemoStatus
} from '../domain/memo'

export interface MemoRepository {
  add(memo: Memo): Promise<number>
  update(memo: Memo): Promise<void>
  remove(id: number): Promise<void>
  listNewest(): Promise<Memo[]>
  listInboxOldest(): Promise<Memo[]>
  countInbox(): Promise<number>
  search(query: string, status: MemoStatus | 'all'): Promise<Memo[]>
  getRediscoveryMemo(): Promise<Memo | null>
  createBackup(now?: Date): Promise<MemoBackup>
  replaceFromBackup(backup: MemoBackup): Promise<void>
}

export const APP_DATA_SCHEMA_VERSION = '1'

class MemoDatabase extends Dexie {
  memos!: EntityTable<Memo, 'id'>
  settings!: EntityTable<AppSetting, 'key'>

  constructor(name = 'adhd-quick-capture-memo') {
    super(name)
    this.version(1).stores({
      memos: '++id, status, createdAt, updatedAt',
      settings: 'key'
    })
    this.version(2)
      .stores({
        memos: '++id, status, createdAt, updatedAt',
        settings: 'key'
      })
      .upgrade((transaction) =>
        transaction.table<AppSetting>('settings').put({
          key: 'schemaVersion',
          value: APP_DATA_SCHEMA_VERSION
        })
      )
    this.on('populate', (transaction) =>
      transaction.table<AppSetting>('settings').add({
        key: 'schemaVersion',
        value: APP_DATA_SCHEMA_VERSION
      })
    )
  }
}

export const database = new MemoDatabase()

export class DexieMemoRepository implements MemoRepository {
  constructor(private readonly db: MemoDatabase = database) {}

  async add(memo: Memo): Promise<number> {
    const id = await this.db.memos.add(memo)
    if (id === undefined) throw new Error('Memo ID was not generated.')
    return id
  }

  async update(memo: Memo): Promise<void> {
    if (memo.id === undefined) throw new Error('Memo ID is required.')
    await this.db.memos.put(memo)
  }

  async remove(id: number): Promise<void> {
    await this.db.memos.delete(id)
  }

  async listNewest(): Promise<Memo[]> {
    return this.db.memos.orderBy('createdAt').reverse().toArray()
  }

  async listInboxOldest(): Promise<Memo[]> {
    return this.db.memos
      .where('status')
      .equals('inbox')
      .sortBy('createdAt')
  }

  async countInbox(): Promise<number> {
    return this.db.memos.where('status').equals('inbox').count()
  }

  async search(query: string, status: MemoStatus | 'all'): Promise<Memo[]> {
    const memos = await this.listNewest()
    return memos.filter(
      (memo) =>
        (status === 'all' || memo.status === status) &&
        memoMatchesQuery(memo, query)
    )
  }

  async getRediscoveryMemo(): Promise<Memo | null> {
    return this.db.transaction('rw', this.db.memos, this.db.settings, async () => {
      const kept = await this.db.memos
        .where('status')
        .equals('kept')
        .sortBy('createdAt')
      if (kept.length === 0) return null

      const previous = await this.db.settings.get('lastRediscoveryMemoId')
      const previousId = previous ? Number(previous.value) : undefined
      const candidates =
        kept.length > 1
          ? kept.filter((memo) => memo.id !== previousId)
          : kept
      const selected =
        candidates[Math.floor(Math.random() * candidates.length)] ?? kept[0]

      if (selected.id !== undefined) {
        await this.db.settings.put({
          key: 'lastRediscoveryMemoId',
          value: String(selected.id)
        })
      }
      return selected
    })
  }

  async createBackup(now = new Date()): Promise<MemoBackup> {
    const [memos, settings] = await this.db.transaction(
      'r',
      this.db.memos,
      this.db.settings,
      () => Promise.all([this.db.memos.toArray(), this.db.settings.toArray()])
    )
    return {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: now.toISOString(),
      memos,
      settings
    }
  }

  async replaceFromBackup(backup: MemoBackup): Promise<void> {
    await this.db.transaction(
      'rw',
      this.db.memos,
      this.db.settings,
      async () => {
        await this.db.memos.clear()
        await this.db.settings.clear()
        if (backup.memos.length > 0) await this.db.memos.bulkAdd(backup.memos)
        if (backup.settings.length > 0) {
          await this.db.settings.bulkAdd(backup.settings)
        }
        await this.db.settings.put({
          key: 'schemaVersion',
          value: APP_DATA_SCHEMA_VERSION
        })
      }
    )
  }
}

export const memoRepository = new DexieMemoRepository()

export { MemoDatabase }

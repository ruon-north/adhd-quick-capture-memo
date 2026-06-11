import { afterEach, describe, expect, it, vi } from 'vitest'
import Dexie from 'dexie'
import {
  APP_DATA_SCHEMA_VERSION,
  DexieMemoRepository,
  MemoDatabase
} from '../src/data/memoRepository'
import { BACKUP_SCHEMA_VERSION } from '../src/domain/backup'
import { createMemo, reviseMemo } from '../src/domain/memo'

let database: MemoDatabase | undefined

afterEach(async () => {
  vi.restoreAllMocks()
  if (database) {
    database.close()
    await database.delete()
    database = undefined
  }
})

function makeRepository() {
  database = new MemoDatabase(`memo-test-${crypto.randomUUID()}`)
  return new DexieMemoRepository(database)
}

describe('DexieMemoRepository', () => {
  it('migrates a version 1 database without losing memos', async () => {
    const name = `memo-migration-test-${crypto.randomUUID()}`
    const legacyDatabase = new Dexie(name)
    legacyDatabase.version(1).stores({
      memos: '++id, status, createdAt, updatedAt',
      settings: 'key'
    })
    await legacyDatabase.table('memos').add(createMemo('legacy memo'))
    legacyDatabase.close()

    database = new MemoDatabase(name)
    const repository = new DexieMemoRepository(database)
    await expect(repository.createBackup()).resolves.toMatchObject({
      memos: [{ body: 'legacy memo' }],
      settings: [{
        key: 'schemaVersion',
        value: APP_DATA_SCHEMA_VERSION
      }]
    })
  })

  it('lists oldest inbox items and searches newest-first by status', async () => {
    const repository = makeRepository()
    const first = createMemo('ＦＯＯ first', new Date('2026-06-10T00:00:00Z'))
    const second = createMemo('foo second https://EXAMPLE.com/Path', new Date('2026-06-11T00:00:00Z'))
    const firstId = await repository.add(first)
    await repository.add(second)
    await repository.update(reviseMemo({ ...first, id: firstId }, { body: first.body, status: 'kept' }))

    await expect(repository.listInboxOldest()).resolves.toMatchObject([{ body: second.body }])
    await expect(repository.countInbox()).resolves.toBe(1)
    await expect(repository.search('foo', 'all')).resolves.toMatchObject([
      { body: second.body },
      { body: first.body }
    ])
    await expect(repository.search('example.com/path', 'inbox')).resolves.toMatchObject([
      { body: second.body }
    ])
    await expect(repository.search('foo', 'done')).resolves.toEqual([])
  })

  it('avoids the previous rediscovery memo when another kept memo exists', async () => {
    const repository = makeRepository()
    const first = createMemo('first kept')
    const second = createMemo('second kept')
    const firstId = await repository.add({ ...first, status: 'kept' })
    const secondId = await repository.add({ ...second, status: 'kept' })
    vi.spyOn(Math, 'random').mockReturnValue(0)

    const rediscoveredFirst = await repository.getRediscoveryMemo()
    const rediscoveredSecond = await repository.getRediscoveryMemo()

    expect(rediscoveredFirst?.id).toBe(firstId)
    expect(rediscoveredSecond?.id).toBe(secondId)
  })

  it('removes and restores the same memo ID', async () => {
    const repository = makeRepository()
    const memo = createMemo('temporary')
    const id = await repository.add(memo)
    await repository.remove(id)
    await repository.add({ ...memo, id })

    await expect(repository.listNewest()).resolves.toMatchObject([{ id, body: 'temporary' }])
  })

  it('exports and transactionally replaces memos and settings', async () => {
    const repository = makeRepository()
    const oldId = await repository.add(createMemo('old memo'))
    await repository.getRediscoveryMemo()
    const backup = await repository.createBackup(
      new Date('2026-06-11T02:00:00.000Z')
    )

    expect(backup).toMatchObject({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-06-11T02:00:00.000Z',
      memos: [{ id: oldId, body: 'old memo' }],
      settings: [{
        key: 'schemaVersion',
        value: APP_DATA_SCHEMA_VERSION
      }]
    })

    await repository.replaceFromBackup({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-06-11T03:00:00.000Z',
      memos: [{ ...createMemo('restored memo'), id: 42, status: 'kept' }],
      settings: [{ key: 'lastRediscoveryMemoId', value: '42' }]
    })

    await expect(repository.listNewest()).resolves.toMatchObject([
      { id: 42, body: 'restored memo', status: 'kept' }
    ])
    await expect(repository.getRediscoveryMemo()).resolves.toMatchObject({
      id: 42,
      body: 'restored memo'
    })
    await expect(repository.createBackup()).resolves.toMatchObject({
      settings: expect.arrayContaining([
        { key: 'schemaVersion', value: APP_DATA_SCHEMA_VERSION },
        { key: 'lastRediscoveryMemoId', value: '42' }
      ])
    })
  })
})

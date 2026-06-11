import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import App from '../src/App'
import type { MemoRepository } from '../src/data/memoRepository'
import { BACKUP_SCHEMA_VERSION } from '../src/domain/backup'
import { createMemo, type Memo } from '../src/domain/memo'

function repositoryMock(memos: Memo[] = []): MemoRepository {
  return {
    listNewest: vi.fn().mockResolvedValue(memos),
    listInboxOldest: vi.fn().mockResolvedValue(memos.filter((memo) => memo.status === 'inbox')),
    countInbox: vi.fn().mockResolvedValue(memos.filter((memo) => memo.status === 'inbox').length),
    search: vi.fn().mockResolvedValue(memos),
    getRediscoveryMemo: vi.fn().mockResolvedValue(memos.find((memo) => memo.status === 'kept') ?? null),
    add: vi.fn().mockResolvedValue(42),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    createBackup: vi.fn().mockResolvedValue({
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: '2026-06-11T00:00:00.000Z',
      memos,
      settings: []
    }),
    replaceFromBackup: vi.fn().mockResolvedValue(undefined)
  }
}

describe('App', () => {
  it('shows fixed tabs, saves a memo, and hides inbox count until details open', async () => {
    const repository = repositoryMock()
    const user = userEvent.setup()
    render(<App repository={repository} />)

    expect(screen.getByRole('navigation', { name: 'メイン' })).toBeVisible()
    expect(screen.queryByText(/受信箱 0件/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '状況' }))
    expect(screen.getByText('受信箱 0件')).toBeVisible()

    await user.type(screen.getByLabelText('メモ'), 'Read https://example.com')
    await user.click(screen.getByRole('button', { name: 'この端末に保存' }))
    await waitFor(() => expect(repository.add).toHaveBeenCalledWith(
      expect.objectContaining({ body: 'Read https://example.com', status: 'inbox' })
    ))
    expect(screen.getByLabelText('メモ')).toHaveValue('')
    expect(screen.getByRole('button', { name: '保存を元に戻す' })).toBeVisible()
  })

  it('shows only the oldest inbox memo and supports keep, defer, and edit', async () => {
    const oldest = { ...createMemo('oldest'), id: 1 }
    const next = { ...createMemo('next'), id: 2, createdAt: '2026-06-11T01:00:00.000Z' }
    const repository = repositoryMock([oldest, next])
    const user = userEvent.setup()
    render(<App repository={repository} />)

    await user.click(screen.getByRole('button', { name: '整理' }))
    expect(await screen.findByText('oldest')).toBeVisible()
    expect(screen.queryByText('next')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '後回し' }))
    expect(screen.getByText('next')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '編集' }))
    const dialog = screen.getByRole('dialog', { name: 'メモを編集' })
    const editInput = within(dialog).getByLabelText('内容')
    await user.clear(editInput)
    await user.type(editInput, 'changed')
    await user.click(within(dialog).getByRole('button', { name: '変更を保存' }))
    await waitFor(() => expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, body: 'changed' })
    ))

    await user.click(screen.getByRole('button', { name: '保管' }))
    await waitFor(() => expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({ id: 2, status: 'kept' })
    ))
  })

  it('requires delete confirmation and offers undo delete', async () => {
    const memo = { ...createMemo('remove me'), id: 7 }
    const repository = repositoryMock([memo])
    const user = userEvent.setup()
    render(<App repository={repository} />)
    await user.click(screen.getByRole('button', { name: '整理' }))

    await user.click(await screen.findByRole('button', { name: '削除' }))
    expect(repository.remove).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '削除する' }))
    await waitFor(() => expect(repository.remove).toHaveBeenCalledWith(7))
    await user.click(screen.getByRole('button', { name: '削除を元に戻す' }))
    await waitFor(() => expect(repository.add).toHaveBeenCalledWith(memo))
  })

  it('passes query and status to search and shows one rediscovery card', async () => {
    const kept = { ...createMemo('A kept thought'), id: 8, status: 'kept' as const }
    const repository = repositoryMock([kept])
    const user = userEvent.setup()
    render(<App repository={repository} />)

    const rediscoveryLabel = await screen.findByText('以前残したメモ')
    const rediscoveryCard = rediscoveryLabel.closest('article')
    expect(rediscoveryCard).not.toBeNull()
    expect(within(rediscoveryCard!).getByText('A kept thought')).toBeVisible()
    await user.click(screen.getByRole('button', { name: '探す' }))
    await user.type(screen.getByLabelText('本文やURLを検索'), 'ＫＥＰＴ')
    await user.selectOptions(screen.getByLabelText('状態'), 'kept')
    await waitFor(() => expect(repository.search).toHaveBeenLastCalledWith('ＫＥＰＴ', 'kept'))
  })

  it('opens settings with privacy, install, and backup guidance', async () => {
    const repository = repositoryMock()
    const user = userEvent.setup()
    render(<App repository={repository} />)

    await user.click(screen.getByRole('button', { name: '設定' }))

    const dialog = screen.getByRole('dialog', { name: '設定' })
    expect(within(dialog).getByText('プライバシー')).toBeVisible()
    expect(within(dialog).getByText('ホーム画面へ追加')).toBeVisible()
    expect(within(dialog).getByText(/JSONファイルは暗号化されません/)).toBeVisible()
    expect(within(dialog).getByLabelText('JSONを読み込む')).toHaveAttribute(
      'accept',
      'application/json,.json'
    )
  })

  it('rejects malformed backup files without replacing current data', async () => {
    const repository = repositoryMock([{
      ...createMemo('keep this memo'),
      id: 1
    }])
    const user = userEvent.setup()
    render(<App repository={repository} />)

    await user.click(screen.getByRole('button', { name: '設定' }))
    await user.upload(
      screen.getByLabelText('JSONを読み込む'),
      new File(['{'], 'broken.json', { type: 'application/json' })
    )

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'JSONファイルを読み取れませんでした。'
    )
    expect(repository.replaceFromBackup).not.toHaveBeenCalled()
  })
})

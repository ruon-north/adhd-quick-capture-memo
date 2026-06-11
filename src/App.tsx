import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react'
import { memoRepository, type MemoRepository } from './data/memoRepository'
import { parseBackupJson, type MemoBackup } from './domain/backup'
import {
  createMemo,
  reviseMemo,
  type Memo,
  type MemoStatus
} from './domain/memo'
import './styles.css'

type Tab = 'record' | 'organize' | 'search'

interface AppProps {
  repository?: MemoRepository
}

const statusLabels: Record<MemoStatus, string> = {
  inbox: '受信箱',
  kept: '保管',
  done: '完了'
}

function memoTitle(memo: Memo): string {
  return memo.body.split(/\r?\n/, 1)[0] || '無題のメモ'
}

export default function App({ repository = memoRepository }: AppProps) {
  const [tab, setTab] = useState<Tab>('record')
  const [body, setBody] = useState('')
  const [notice, setNotice] = useState('この端末だけに保存されます。')
  const [isSaving, setIsSaving] = useState(false)
  const [lastSavedMemo, setLastSavedMemo] = useState<Memo | null>(null)
  const [inbox, setInbox] = useState<Memo[]>([])
  const [inboxCount, setInboxCount] = useState(0)
  const [deferredIds, setDeferredIds] = useState<number[]>([])
  const [editing, setEditing] = useState<Memo | null>(null)
  const [editBody, setEditBody] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Memo | null>(null)
  const [deletedMemo, setDeletedMemo] = useState<Memo | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<MemoStatus | 'all'>('all')
  const [results, setResults] = useState<Memo[]>([])
  const [rediscovery, setRediscovery] = useState<Memo | null>(null)
  const [showSettings, setShowSettings] = useState(false)
  const [pendingBackup, setPendingBackup] = useState<MemoBackup | null>(null)
  const [backupError, setBackupError] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const loadInbox = useCallback(async () => {
    const [items, count] = await Promise.all([
      repository.listInboxOldest(),
      repository.countInbox()
    ])
    setInbox(items)
    setInboxCount(count)
  }, [repository])

  const loadSearchResults = useCallback(async () => {
    setResults(await repository.search(query, filter))
  }, [filter, query, repository])

  useEffect(() => {
    void loadInbox().catch(() => setNotice('保存済みメモを読み込めませんでした。'))
    void repository
      .getRediscoveryMemo()
      .then(setRediscovery)
      .catch(() => setRediscovery(null))
  }, [loadInbox, repository])

  useEffect(() => {
    void loadSearchResults().catch(() =>
      setNotice('現在、検索を利用できません。')
    )
  }, [loadSearchResults])

  async function refreshVisibleData() {
    await Promise.all([loadInbox(), loadSearchResults()])
  }

  const currentMemo =
    inbox.find((memo) => memo.id === undefined || !deferredIds.includes(memo.id)) ??
    null

  async function handleCapture(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = body.trim()
    if (!trimmed || isSaving) return
    setIsSaving(true)
    try {
      const memo = createMemo(trimmed)
      const id = await repository.add(memo)
      setLastSavedMemo({ ...memo, id })
      setBody('')
      setNotice('保存しました。')
      await refreshVisibleData()
      inputRef.current?.focus()
    } catch {
      setNotice('保存できませんでした。内容は入力欄に残しています。')
    } finally {
      setIsSaving(false)
    }
  }

  async function undoCapture() {
    if (lastSavedMemo?.id === undefined) return
    await repository.remove(lastSavedMemo.id)
    setBody(lastSavedMemo.body)
    setLastSavedMemo(null)
    setNotice('保存を取り消し、内容を入力欄に戻しました。')
    await refreshVisibleData()
    inputRef.current?.focus()
  }

  async function changeStatus(memo: Memo, status: MemoStatus) {
    await repository.update(reviseMemo(memo, { body: memo.body, status }))
    setNotice(status === 'kept' ? '保管しました。' : '完了にしました。')
    setDeferredIds((ids) => ids.filter((id) => id !== memo.id))
    await refreshVisibleData()
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!editing || !editBody.trim()) return
    await repository.update(
      reviseMemo(editing, { body: editBody.trim(), status: editing.status })
    )
    setEditing(null)
    setNotice('変更を保存しました。')
    await refreshVisibleData()
  }

  async function confirmDelete() {
    if (pendingDelete?.id === undefined) return
    await repository.remove(pendingDelete.id)
    setDeletedMemo(pendingDelete)
    setPendingDelete(null)
    setNotice('削除しました。')
    await refreshVisibleData()
  }

  async function undoDelete() {
    if (!deletedMemo) return
    await repository.add(deletedMemo)
    setDeletedMemo(null)
    setNotice('削除を取り消しました。')
    await refreshVisibleData()
  }

  function openEdit(memo: Memo) {
    setEditing(memo)
    setEditBody(memo.body)
  }

  async function exportBackup() {
    const backup = await repository.createBackup()
    const blob = new Blob([JSON.stringify(backup, null, 2)], {
      type: 'application/json'
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `ima-memo-backup-${backup.exportedAt.slice(0, 10)}.json`
    link.click()
    URL.revokeObjectURL(url)
    setNotice(`${backup.memos.length}件を書き出しました。`)
  }

  async function selectBackupFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      setPendingBackup(parseBackupJson(await file.text()))
      setBackupError('')
    } catch (error) {
      setPendingBackup(null)
      setBackupError(
        error instanceof Error ? error.message : 'バックアップを確認できません。'
      )
    }
  }

  async function confirmRestore() {
    if (!pendingBackup) return
    await repository.replaceFromBackup(pendingBackup)
    setPendingBackup(null)
    setShowSettings(false)
    setDeferredIds([])
    await refreshVisibleData()
    setRediscovery(await repository.getRediscoveryMemo())
    setNotice(`${pendingBackup.memos.length}件を復元しました。`)
  }

  return (
    <main className="app-shell">
      <a className="skip-link" href="#main-content">本文へ移動</a>
      <header className="topline">
        <div>
          <p className="eyebrow">いまメモ</p>
          <h1>{tab === 'record' ? '記録' : tab === 'organize' ? '整理' : '探す'}</h1>
        </div>
        <div className="header-actions">
          <button
            className="quiet-button"
            type="button"
            aria-expanded={showDetails}
            onClick={() => setShowDetails((shown) => !shown)}
          >
            {showDetails ? '状況を閉じる' : '状況'}
          </button>
          <button
            className="quiet-button"
            type="button"
            onClick={() => setShowSettings(true)}
          >
            設定
          </button>
        </div>
      </header>

      {showDetails && (
        <aside className="details-panel" aria-label="アプリの状況">
          <span>受信箱 {inboxCount}件</span>
          <span>端末内保存</span>
        </aside>
      )}

      <p className="notice" role="status" aria-live="polite">{notice}</p>

      <div id="main-content" tabIndex={-1}>
      {tab === 'record' && (
        <section className="panel" aria-labelledby="record-heading">
          <h2 id="record-heading">いま、何を残す？</h2>
          <form onSubmit={handleCapture}>
            <label htmlFor="memo-body">メモ</label>
            <textarea
              ref={inputRef}
              id="memo-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="思いつき、用事、URLをそのまま入力"
              rows={7}
              autoFocus
            />
            <button className="primary-button" type="submit" disabled={!body.trim() || isSaving}>
              {isSaving ? '保存中…' : 'この端末に保存'}
            </button>
          </form>
          {lastSavedMemo && (
            <button className="inline-undo" type="button" onClick={() => void undoCapture()}>
              保存を元に戻す
            </button>
          )}
          {rediscovery && (
            <article className="rediscovery-card">
              <p className="eyebrow">以前残したメモ</p>
              <MemoContent memo={rediscovery} />
            </article>
          )}
        </section>
      )}

      {tab === 'organize' && (
        <section className="panel" aria-labelledby="organize-heading">
          <h2 id="organize-heading">ひとつずつ整理</h2>
          {currentMemo ? (
            <article className="memo-card">
              <p className="memo-date">{new Date(currentMemo.createdAt).toLocaleDateString()}</p>
              <MemoContent memo={currentMemo} />
              <div className="action-grid">
                <button type="button" onClick={() => void changeStatus(currentMemo, 'kept')}>保管</button>
                <button type="button" onClick={() => void changeStatus(currentMemo, 'done')}>完了</button>
                <button
                  type="button"
                  onClick={() => currentMemo.id !== undefined && setDeferredIds((ids) => [...ids, currentMemo.id!])}
                >
                  後回し
                </button>
                <button type="button" onClick={() => openEdit(currentMemo)}>編集</button>
                <button className="danger-button" type="button" onClick={() => setPendingDelete(currentMemo)}>
                  削除
                </button>
              </div>
            </article>
          ) : (
            <p className="empty-state">
              {inbox.length > 0 ? '今回はここまでです。' : '受信箱は空です。'}
            </p>
          )}
        </section>
      )}

      {tab === 'search' && (
        <section className="panel search-panel" aria-labelledby="search-heading">
          <h2 id="search-heading">メモを探す</h2>
          <label htmlFor="search-query">本文やURLを検索</label>
          <input
            id="search-query"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="思い出せる言葉を入力"
          />
          <label htmlFor="status-filter">状態</label>
          <select
            id="status-filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value as MemoStatus | 'all')}
          >
            <option value="all">すべて</option>
            <option value="inbox">受信箱</option>
            <option value="kept">保管</option>
            <option value="done">完了</option>
          </select>
          <div className="result-list" aria-live="polite">
            {results.map((memo) => (
              <article className="result-card" key={memo.id ?? `${memo.createdAt}-${memo.body}`}>
                <div className="result-heading">
                  <h3>{memoTitle(memo)}</h3>
                  <span>{statusLabels[memo.status]}</span>
                </div>
                <MemoContent memo={memo} />
                <button type="button" onClick={() => openEdit(memo)}>編集</button>
              </article>
            ))}
            {results.length === 0 && <p className="empty-state">一致するメモはありません。</p>}
          </div>
        </section>
      )}
      </div>

      {editing && (
        <div className="modal-backdrop" role="presentation">
          <section className="dialog" role="dialog" aria-modal="true" aria-labelledby="edit-title">
            <h2 id="edit-title">メモを編集</h2>
            <form onSubmit={saveEdit}>
              <label htmlFor="edit-body">内容</label>
              <textarea id="edit-body" value={editBody} onChange={(event) => setEditBody(event.target.value)} />
              <div className="dialog-actions">
                <button type="button" onClick={() => setEditing(null)}>キャンセル</button>
                <button className="primary-button" type="submit">変更を保存</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {pendingDelete && (
        <div className="modal-backdrop" role="presentation">
          <section className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-title">
            <h2 id="delete-title">このメモを削除しますか？</h2>
            <p>削除直後なら元に戻せます。</p>
            <div className="dialog-actions">
              <button type="button" onClick={() => setPendingDelete(null)}>キャンセル</button>
              <button className="danger-button" type="button" onClick={() => void confirmDelete()}>削除する</button>
            </div>
          </section>
        </div>
      )}

      {deletedMemo && (
        <button className="undo-toast" type="button" onClick={() => void undoDelete()}>
          削除を元に戻す
        </button>
      )}

      {showSettings && (
        <div className="modal-backdrop" role="presentation">
          <section
            className="dialog settings-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <h2 id="settings-title">設定</h2>
            <section aria-labelledby="backup-title">
              <h3 id="backup-title">バックアップ</h3>
              <p>
                JSONファイルは暗号化されません。安全な場所に保管してください。
              </p>
              <button type="button" onClick={() => void exportBackup()}>
                JSONを書き出す
              </button>
              <label className="file-button" htmlFor="backup-file">
                JSONを読み込む
              </label>
              <input
                className="visually-hidden"
                id="backup-file"
                type="file"
                accept="application/json,.json"
                onChange={(event) => void selectBackupFile(event)}
              />
              {backupError && <p className="error-message" role="alert">{backupError}</p>}
              {pendingBackup && (
                <div className="restore-confirmation">
                  <p>
                    {pendingBackup.memos.length}件のメモで現在の全データを置き換えます。
                  </p>
                  <button className="danger-button" type="button" onClick={() => void confirmRestore()}>
                    確認して復元する
                  </button>
                  <button type="button" onClick={() => setPendingBackup(null)}>
                    キャンセル
                  </button>
                </div>
              )}
            </section>
            <section aria-labelledby="privacy-title">
              <h3 id="privacy-title">プライバシー</h3>
              <p>
                メモはこのブラウザのIndexedDBに保存され、外部サービスへ送信しません。
                端末ロックが主な保護になります。
              </p>
            </section>
            <section aria-labelledby="install-title">
              <h3 id="install-title">ホーム画面へ追加</h3>
              <p>
                ブラウザの共有またはメニューから「ホーム画面に追加」を選ぶと、すぐ開けます。
              </p>
            </section>
            <div className="dialog-actions">
              <button type="button" onClick={() => {
                setShowSettings(false)
                setPendingBackup(null)
                setBackupError('')
              }}>
                閉じる
              </button>
            </div>
          </section>
        </div>
      )}

      <nav className="bottom-tabs" aria-label="メイン">
        {(['record', 'organize', 'search'] as const).map((item) => (
          <button
            key={item}
            type="button"
            aria-current={tab === item ? 'page' : undefined}
            onClick={() => {
              setTab(item)
              if (item === 'organize') setDeferredIds([])
            }}
          >
            {item === 'record' ? '記録' : item === 'organize' ? '整理' : '探す'}
          </button>
        ))}
      </nav>
    </main>
  )
}

function MemoContent({ memo }: { memo: Memo }) {
  return (
    <div className="memo-content">
      <p>{memo.body}</p>
      {memo.urls.length > 0 && (
        <div className="memo-links">
          {memo.urls.map((url) => (
            <a href={url} target="_blank" rel="noreferrer" key={url}>
              {url}
            </a>
          ))}
        </div>
      )}
    </div>
  )
}

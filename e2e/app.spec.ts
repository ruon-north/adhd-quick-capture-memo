import AxeBuilder from '@axe-core/playwright'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium, expect, test } from '@playwright/test'

test('records immediately, persists after reload, and supports undo', async ({
  page
}) => {
  await page.goto('./')
  const input = page.getByLabel('メモ')
  await input.fill('後で読む https://example.com/guide')
  await page.getByRole('button', { name: 'この端末に保存' }).click()

  await expect(page.getByText('保存しました。')).toBeVisible()
  await expect(input).toHaveValue('')
  await page.reload()
  await page.getByRole('button', { name: '探す' }).click()
  await expect(
    page.getByRole('heading', { name: '後で読む https://example.com/guide' })
  ).toBeVisible()
  await expect(page.getByRole('link', { name: 'https://example.com/guide' })).toBeVisible()

  await page.getByRole('button', { name: '記録' }).click()
  await input.fill('取り消すメモ')
  await page.getByRole('button', { name: 'この端末に保存' }).click()
  await page.getByRole('button', { name: '保存を元に戻す' }).click()
  await expect(input).toHaveValue('取り消すメモ')
})

test('organizes one memo at a time and searches normalized text', async ({
  page
}) => {
  await page.goto('./')
  const input = page.getByLabel('メモ')
  await input.fill('ＦＯＯ 最初のメモ')
  await page.getByRole('button', { name: 'この端末に保存' }).click()
  await page.waitForTimeout(20)
  await input.fill('次のメモ')
  await page.getByRole('button', { name: 'この端末に保存' }).click()

  await page.getByRole('button', { name: '整理' }).click()
  await expect(page.getByText('ＦＯＯ 最初のメモ')).toBeVisible()
  await expect(page.getByText('次のメモ')).not.toBeVisible()
  await page.getByRole('button', { name: '保管' }).click()
  await expect(page.getByText('次のメモ')).toBeVisible()
  await page.getByRole('button', { name: '完了' }).click()

  await page.getByRole('button', { name: '探す' }).click()
  await page.getByLabel('本文やURLを検索').fill('foo')
  await page.getByLabel('状態').selectOption('kept')
  await expect(
    page.getByRole('heading', { name: 'ＦＯＯ 最初のメモ' })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '次のメモ' })
  ).not.toBeVisible()
})

test('exports and restores a full replacement backup', async ({ page }) => {
  await page.goto('./')
  const input = page.getByLabel('メモ')
  await input.fill('バックアップ対象')
  await page.getByRole('button', { name: 'この端末に保存' }).click()
  await page.getByRole('button', { name: '設定' }).click()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSONを書き出す' }).click()
  const download = await downloadPromise
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()
  await page.getByRole('button', { name: '閉じる' }).click()

  await input.fill('復元で消えるメモ')
  await page.getByRole('button', { name: 'この端末に保存' }).click()
  await page.getByRole('button', { name: '設定' }).click()
  await page.getByLabel('JSONを読み込む').setInputFiles(backupPath!)
  await expect(page.getByText(/1件のメモで現在の全データを置き換えます/)).toBeVisible()
  await page.getByRole('button', { name: '確認して復元する' }).click()

  await page.getByRole('button', { name: '探す' }).click()
  await expect(
    page.getByRole('heading', { name: 'バックアップ対象' })
  ).toBeVisible()
  await expect(
    page.getByRole('heading', { name: '復元で消えるメモ' })
  ).not.toBeVisible()
})

test('works offline after installation and has no serious accessibility violations', async ({
  context,
  page
}) => {
  await page.goto('./')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()

  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations.filter(({ impact }) =>
      impact === 'critical' || impact === 'serious'
    )
  ).toEqual([])

  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '記録' })).toBeVisible()
  const input = page.getByLabel('メモ')
  const saveButton = page.getByRole('button', { name: 'この端末に保存' })
  await input.fill('オフラインのメモ')
  await input.press('Tab')
  await expect(saveButton).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByText('保存しました。')).toBeVisible()

  await page.getByRole('button', { name: '整理' }).click()
  await expect(page.getByText('オフラインのメモ')).toBeVisible()
  await page.getByRole('button', { name: '編集' }).click()
  const editInput = page.getByLabel('内容')
  await editInput.fill('オフラインで編集したメモ')
  await page.getByRole('button', { name: '変更を保存' }).click()
  await page.getByRole('button', { name: '保管' }).click()

  await page.getByRole('button', { name: '探す' }).click()
  await page.getByLabel('本文やURLを検索').fill('編集した')
  await page.getByLabel('状態').selectOption('kept')
  await expect(
    page.getByRole('heading', { name: 'オフラインで編集したメモ' })
  ).toBeVisible()

  await page.getByRole('button', { name: '設定' }).click()
  const offlineDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'JSONを書き出す' }).click()
  await expect(offlineDownload).resolves.toBeTruthy()
})

test('keeps IndexedDB data after a browser-profile restart', async ({}, testInfo) => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'ima-memo-e2e-'))
  const appUrl = new URL(
    './',
    testInfo.project.use.baseURL as string
  ).toString()

  try {
    const firstContext = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      viewport: { width: 412, height: 915 }
    })
    const firstPage = firstContext.pages()[0] ?? await firstContext.newPage()
    await firstPage.goto(appUrl)
    await firstPage.getByLabel('メモ').fill('再起動後も残るメモ')
    await firstPage.getByRole('button', { name: 'この端末に保存' }).click()
    await expect(firstPage.getByText('保存しました。')).toBeVisible()
    await firstContext.close()

    const secondContext = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      viewport: { width: 412, height: 915 }
    })
    const secondPage = secondContext.pages()[0] ?? await secondContext.newPage()
    await secondPage.goto(appUrl)
    await secondPage.getByRole('button', { name: '探す' }).click()
    await expect(
      secondPage.getByRole('heading', { name: '再起動後も残るメモ' })
    ).toBeVisible()
    await secondContext.close()
  } finally {
    await rm(userDataDir, { force: true, recursive: true })
  }
})

test('exposes an installable manifest under the built base URL', async ({
  request
}) => {
  const response = await request.get('./manifest.webmanifest')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    name: 'いまメモ',
    display: 'standalone',
    start_url: './',
    scope: './',
    lang: 'ja'
  })
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: 'icon-192.png', sizes: '192x192' }),
    expect.objectContaining({ src: 'icon-512.png', sizes: '512x512' })
  ]))
})

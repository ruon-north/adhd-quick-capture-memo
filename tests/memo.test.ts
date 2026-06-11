import { describe, expect, it } from 'vitest'
import {
  createMemo,
  extractUrls,
  memoMatchesQuery,
  normalizeSearchText,
  reviseMemo
} from '../src/domain/memo'

describe('memo domain', () => {
  it('extracts unique HTTP and HTTPS URLs without trailing punctuation', () => {
    expect(
      extractUrls(
        'See https://example.com/a, then http://example.org/path. Again https://example.com/a'
      )
    ).toEqual(['https://example.com/a', 'http://example.org/path'])
  })

  it('creates and revises a memo while refreshing extracted URLs', () => {
    const memo = createMemo('Read https://example.com', new Date('2026-06-11T00:00:00Z'))
    const revised = reviseMemo(
      memo,
      { body: 'Done https://openai.com/docs', status: 'done' },
      new Date('2026-06-11T01:00:00Z')
    )

    expect(revised).toMatchObject({
      body: 'Done https://openai.com/docs',
      urls: ['https://openai.com/docs'],
      status: 'done',
      createdAt: '2026-06-11T00:00:00.000Z',
      updatedAt: '2026-06-11T01:00:00.000Z'
    })
  })

  it('normalizes NFKC and lowercase for partial body and URL matching', () => {
    const memo = createMemo('ＦＯＯ reminder https://EXAMPLE.com/Path')

    expect(normalizeSearchText('Ｆｏｏ')).toBe('foo')
    expect(memoMatchesQuery(memo, 'foo rem')).toBe(true)
    expect(memoMatchesQuery(memo, 'example.com/path')).toBe(true)
    expect(memoMatchesQuery(memo, 'missing')).toBe(false)
  })
})

import assert from 'node:assert/strict'
import { afterEach, beforeEach, test } from 'node:test'
import { clearReviewDraft, loadReviewDraft, saveReviewDraft } from './reviewDraft.js'

let values

beforeEach(() => {
  values = new Map()
  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    },
  }
})

afterEach(() => {
  delete globalThis.window
})

test('restores an unfinished review for the same action version', () => {
  const action = { id: 'action-1', updatedAt: '2026-08-17T08:00:00.000Z' }
  const fallback = { content: '', arousal: 5 }

  saveReviewDraft('action', action, { content: '还没保存的回顾', arousal: 7 })

  assert.deepEqual(loadReviewDraft('action', action, fallback), {
    content: '还没保存的回顾',
    arousal: 7,
  })
})

test('does not restore a draft after the saved action changed', () => {
  const action = { id: 'action-1', updatedAt: '2026-08-17T08:00:00.000Z' }
  const fallback = { content: '已经保存的新内容' }
  saveReviewDraft('action', action, { content: '旧草稿' })

  assert.deepEqual(loadReviewDraft('action', { ...action, updatedAt: '2026-08-17T09:00:00.000Z' }, fallback), fallback)
  assert.equal(values.size, 0)
})

test('clears a review draft after a successful save', () => {
  const action = { id: 'action-1', updatedAt: '2026-08-17T08:00:00.000Z' }
  saveReviewDraft('action', action, { content: '已保存' })

  clearReviewDraft('action', action.id)

  assert.equal(values.size, 0)
})

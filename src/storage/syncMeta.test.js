import assert from 'node:assert/strict'
import test from 'node:test'
import { createPendingSyncMeta, createSyncedSyncMeta, normalizeSyncMeta } from './syncMeta.js'

test('an older cloud write cannot clear a newer local change', () => {
  const first = createPendingSyncMeta({}, '2026-07-16T10:00:00.000Z')
  const second = createPendingSyncMeta(first, '2026-07-16T10:00:01.000Z')
  const result = createSyncedSyncMeta(second, first.localRevision, '2026-07-16T10:00:02.000Z', 4)

  assert.equal(result.completed, false)
  assert.equal(result.meta.pending, true)
  assert.equal(result.meta.localRevision, second.localRevision)
  assert.equal(result.meta.syncedRevision, first.localRevision)
  assert.equal(result.meta.cloudRevision, 4)
})

test('the latest cloud write clears pending state', () => {
  const pending = createPendingSyncMeta({}, '2026-07-16T10:00:00.000Z')
  const result = createSyncedSyncMeta(pending, pending.localRevision, '2026-07-16T10:00:02.000Z', 5)

  assert.equal(result.completed, true)
  assert.equal(result.meta.pending, false)
  assert.equal(result.meta.syncedRevision, pending.localRevision)
  assert.equal(result.meta.cloudRevision, 5)
})

test('a local change keeps the cloud version its in-memory state was based on', () => {
  const result = createPendingSyncMeta(
    { cloudRevision: 9 },
    '2026-07-16T10:00:00.000Z',
    7,
  )

  assert.equal(result.pending, true)
  assert.equal(result.cloudRevision, 7)
})

test('legacy sync metadata remains readable', () => {
  assert.deepEqual(normalizeSyncMeta({ pending: true, lastLocalChangeAt: 'legacy' }), {
    pending: true,
    localRevision: 0,
    syncedRevision: 0,
    cloudRevision: 0,
    lastLocalChangeAt: 'legacy',
    lastSuccessfulSyncAt: '',
  })
})

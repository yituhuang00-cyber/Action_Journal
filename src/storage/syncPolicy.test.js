import assert from 'node:assert/strict'
import test from 'node:test'
import { decideVersionedStartupSync } from './syncPolicy.js'

test('a clean stale device adopts the cloud snapshot', () => {
  assert.equal(decideVersionedStartupSync({
    userId: 'user-1',
    localOwner: 'user-1',
    localPending: false,
    localChangedWhileFetching: false,
    localCloudRevision: 3,
    remoteRevision: 8,
  }), 'adopt-cloud')
})

test('offline changes upload only when the cloud base version is unchanged', () => {
  assert.equal(decideVersionedStartupSync({
    userId: 'user-1',
    localOwner: 'user-1',
    localPending: true,
    localChangedWhileFetching: false,
    localCloudRevision: 8,
    remoteRevision: 8,
  }), 'upload-local')
})

test('offline changes cannot overwrite a newer cloud revision', () => {
  assert.equal(decideVersionedStartupSync({
    userId: 'user-1',
    localOwner: 'user-1',
    localPending: true,
    localChangedWhileFetching: false,
    localCloudRevision: 7,
    remoteRevision: 8,
  }), 'adopt-cloud-conflict')
})

test('data cached for another account never uploads', () => {
  assert.equal(decideVersionedStartupSync({
    userId: 'user-2',
    localOwner: 'user-1',
    localPending: true,
    localChangedWhileFetching: true,
    localCloudRevision: 8,
    remoteRevision: 8,
  }), 'adopt-cloud')
})

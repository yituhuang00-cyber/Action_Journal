const EMPTY_SYNC_META = {
  pending: false,
  localRevision: 0,
  syncedRevision: 0,
  lastLocalChangeAt: '',
  lastSuccessfulSyncAt: '',
}

function normalizeRevision(value) {
  const revision = Number(value)
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0
}

export function normalizeSyncMeta(value) {
  const meta = value && typeof value === 'object' ? value : {}
  return {
    pending: Boolean(meta.pending),
    localRevision: normalizeRevision(meta.localRevision),
    syncedRevision: normalizeRevision(meta.syncedRevision),
    lastLocalChangeAt: typeof meta.lastLocalChangeAt === 'string' ? meta.lastLocalChangeAt : '',
    lastSuccessfulSyncAt: typeof meta.lastSuccessfulSyncAt === 'string' ? meta.lastSuccessfulSyncAt : '',
  }
}

export function createPendingSyncMeta(currentMeta, changedAt = new Date().toISOString()) {
  const current = normalizeSyncMeta(currentMeta)
  return {
    ...current,
    pending: true,
    localRevision: current.localRevision + 1,
    lastLocalChangeAt: changedAt,
  }
}

export function createSyncedSyncMeta(currentMeta, syncedRevision, syncedAt = new Date().toISOString()) {
  const current = normalizeSyncMeta(currentMeta)
  const completedRevision = normalizeRevision(syncedRevision)

  if (current.localRevision > completedRevision) {
    return { completed: false, meta: current }
  }

  return {
    completed: true,
    meta: {
      ...current,
      pending: false,
      syncedRevision: Math.max(current.syncedRevision, completedRevision),
      lastSuccessfulSyncAt: syncedAt,
    },
  }
}

export { EMPTY_SYNC_META }

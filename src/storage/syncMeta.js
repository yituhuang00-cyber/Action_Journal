const EMPTY_SYNC_META = {
  pending: false,
  localRevision: 0,
  syncedRevision: 0,
  cloudRevision: 0,
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
    cloudRevision: normalizeRevision(meta.cloudRevision),
    lastLocalChangeAt: typeof meta.lastLocalChangeAt === 'string' ? meta.lastLocalChangeAt : '',
    lastSuccessfulSyncAt: typeof meta.lastSuccessfulSyncAt === 'string' ? meta.lastSuccessfulSyncAt : '',
  }
}

export function createPendingSyncMeta(
  currentMeta,
  changedAt = new Date().toISOString(),
  cloudRevision = currentMeta?.cloudRevision,
) {
  const current = normalizeSyncMeta(currentMeta)
  return {
    ...current,
    pending: true,
    localRevision: current.localRevision + 1,
    cloudRevision: normalizeRevision(cloudRevision),
    lastLocalChangeAt: changedAt,
  }
}

export function createSyncedSyncMeta(
  currentMeta,
  syncedRevision,
  syncedAt = new Date().toISOString(),
  cloudRevision = currentMeta?.cloudRevision,
) {
  const current = normalizeSyncMeta(currentMeta)
  const completedRevision = normalizeRevision(syncedRevision)
  const completedCloudRevision = normalizeRevision(cloudRevision)

  if (current.localRevision > completedRevision) {
    return {
      completed: false,
      meta: {
        ...current,
        syncedRevision: Math.max(current.syncedRevision, completedRevision),
        cloudRevision: completedCloudRevision,
        lastSuccessfulSyncAt: syncedAt,
      },
    }
  }

  return {
    completed: true,
    meta: {
      ...current,
      pending: false,
      syncedRevision: Math.max(current.syncedRevision, completedRevision),
      cloudRevision: completedCloudRevision,
      lastSuccessfulSyncAt: syncedAt,
    },
  }
}

export { EMPTY_SYNC_META }

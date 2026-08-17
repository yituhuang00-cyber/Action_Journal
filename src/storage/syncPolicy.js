function normalizeRevision(value) {
  const revision = Number(value)
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0
}

export function decideVersionedStartupSync({
  userId,
  localOwner,
  localPending,
  localChangedWhileFetching,
  localCloudRevision,
  remoteRevision,
}) {
  const hasPendingLocalChange = Boolean(localPending || localChangedWhileFetching)
  if (localOwner !== userId || !hasPendingLocalChange) return 'adopt-cloud'

  return normalizeRevision(localCloudRevision) === normalizeRevision(remoteRevision)
    ? 'upload-local'
    : 'adopt-cloud-conflict'
}


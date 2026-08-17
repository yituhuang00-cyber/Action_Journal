const REVIEW_DRAFT_PREFIX = 'action-journal:review-draft:v1'

function getStorage() {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null
  return window.localStorage
}

function getDraftKey(kind, actionId) {
  return `${REVIEW_DRAFT_PREFIX}:${kind}:${actionId}`
}

export function loadReviewDraft(kind, action, fallback) {
  if (!action?.id) return fallback

  try {
    const storage = getStorage()
    if (!storage) return fallback
    const raw = storage.getItem(getDraftKey(kind, action.id))
    if (!raw) return fallback

    const saved = JSON.parse(raw)
    if (!saved?.data || typeof saved.data !== 'object' || Array.isArray(saved.data)) return fallback
    if (saved.actionUpdatedAt !== (action.updatedAt || '')) {
      storage.removeItem(getDraftKey(kind, action.id))
      return fallback
    }

    return { ...fallback, ...saved.data }
  } catch {
    return fallback
  }
}

export function saveReviewDraft(kind, action, data) {
  if (!action?.id) return

  try {
    getStorage()?.setItem(getDraftKey(kind, action.id), JSON.stringify({
      actionUpdatedAt: action.updatedAt || '',
      savedAt: new Date().toISOString(),
      data,
    }))
  } catch {
    // A full or unavailable localStorage should not interrupt review input.
  }
}

export function clearReviewDraft(kind, actionId) {
  if (!actionId) return

  try {
    getStorage()?.removeItem(getDraftKey(kind, actionId))
  } catch {
    // Ignore storage access failures after the record itself was saved.
  }
}

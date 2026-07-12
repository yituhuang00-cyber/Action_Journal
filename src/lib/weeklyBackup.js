const DAILY_BACKUP_META_KEY = 'action-journal:daily-backup-meta'

function createEmptyStatus() {
  const currentDay = getDayInfo()
  return {
    dateKey: currentDay.key,
    hasBackupToday: false,
    lastBackupAt: '',
    filename: '',
  }
}

function padNumber(value) {
  return String(value).padStart(2, '0')
}

function sanitizeSegment(value, fallback = 'account') {
  const normalized = String(value || '').trim().toLowerCase().replace(/[^a-z0-9._-]+/g, '-')
  return normalized.replace(/^-+|-+$/g, '') || fallback
}

function getDayInfo(date = new Date()) {
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    key: `${date.getFullYear()}-${padNumber(date.getMonth() + 1)}-${padNumber(date.getDate())}`,
  }
}

function normalizeBackupEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { dateKey: entry, lastBackupAt: '', filename: '' }
  }
  if (typeof entry !== 'object') return null

  return {
    dateKey: typeof entry.dateKey === 'string' ? entry.dateKey : typeof entry.weekKey === 'string' ? entry.weekKey : '',
    lastBackupAt: typeof entry.lastBackupAt === 'string' ? entry.lastBackupAt : '',
    filename: typeof entry.filename === 'string' ? entry.filename : '',
  }
}

function readBackupMeta() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(DAILY_BACKUP_META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeBackupMeta(nextMeta) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  localStorage.setItem(DAILY_BACKUP_META_KEY, JSON.stringify(nextMeta))
}

export function getWeeklyBackupStatus(session) {
  if (!session?.user?.id) return createEmptyStatus()

  const currentDay = getDayInfo()
  const meta = readBackupMeta()
  const entry = normalizeBackupEntry(meta[session.user.id])
  const hasBackupToday = entry?.dateKey === currentDay.key

  return {
    dateKey: currentDay.key,
    hasBackupToday,
    lastBackupAt: entry?.lastBackupAt || '',
    filename: entry?.filename || '',
  }
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  window.setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}

export function runWeeklyBackup({ session, exportData, localMode = false, force = false }) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return false
  if (!session?.user?.id || typeof exportData !== 'function') return createEmptyStatus()

  const meta = readBackupMeta()
  const currentDay = getDayInfo()
  const existingEntry = normalizeBackupEntry(meta[session.user.id])
  if (!force && existingEntry?.dateKey === currentDay.key) {
    return {
      dateKey: currentDay.key,
      hasBackupToday: true,
      lastBackupAt: existingEntry.lastBackupAt || '',
      filename: existingEntry.filename || '',
      downloaded: false,
    }
  }

  const exported = exportData()
  let parsedData
  try {
    parsedData = JSON.parse(exported)
  } catch {
    return {
      ...getWeeklyBackupStatus(session),
      downloaded: false,
    }
  }

  const downloadedAt = new Date().toISOString()

  const backupPayload = {
    meta: {
      createdAt: downloadedAt,
      dateKey: currentDay.key,
      backupCadence: 'daily',
      source: 'action-journal',
      localMode,
      userId: session.user.id,
      email: session.user.email || '',
    },
    state: parsedData,
  }

  const filename = `action-journal-backup-${sanitizeSegment(session.user.email, session.user.id)}-${currentDay.key}.json`
  downloadJson(filename, backupPayload)
  writeBackupMeta({
    ...meta,
    [session.user.id]: {
      dateKey: currentDay.key,
      lastBackupAt: downloadedAt,
      filename,
    },
  })

  return {
    dateKey: currentDay.key,
    hasBackupToday: true,
    lastBackupAt: downloadedAt,
    filename,
    downloaded: true,
  }
}

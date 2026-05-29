const WEEKLY_BACKUP_META_KEY = 'action-journal:weekly-backup-meta'

function createEmptyStatus() {
  return {
    weekKey: getWeekInfo().key,
    hasBackupThisWeek: false,
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

function getWeekInfo(date = new Date()) {
  const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const day = utcDate.getUTCDay() || 7
  utcDate.setUTCDate(utcDate.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(utcDate.getUTCFullYear(), 0, 1))
  const weekNumber = Math.ceil((((utcDate - yearStart) / 86400000) + 1) / 7)

  return {
    year: utcDate.getUTCFullYear(),
    week: weekNumber,
    key: `${utcDate.getUTCFullYear()}-W${padNumber(weekNumber)}`,
  }
}

function normalizeBackupEntry(entry) {
  if (!entry) return null
  if (typeof entry === 'string') {
    return { weekKey: entry, lastBackupAt: '', filename: '' }
  }
  if (typeof entry !== 'object') return null

  return {
    weekKey: typeof entry.weekKey === 'string' ? entry.weekKey : '',
    lastBackupAt: typeof entry.lastBackupAt === 'string' ? entry.lastBackupAt : '',
    filename: typeof entry.filename === 'string' ? entry.filename : '',
  }
}

function readBackupMeta() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return {}

  try {
    const raw = localStorage.getItem(WEEKLY_BACKUP_META_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeBackupMeta(nextMeta) {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return
  localStorage.setItem(WEEKLY_BACKUP_META_KEY, JSON.stringify(nextMeta))
}

export function getWeeklyBackupStatus(session) {
  if (!session?.user?.id) return createEmptyStatus()

  const currentWeek = getWeekInfo()
  const meta = readBackupMeta()
  const entry = normalizeBackupEntry(meta[session.user.id])

  return {
    weekKey: currentWeek.key,
    hasBackupThisWeek: entry?.weekKey === currentWeek.key,
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
  const currentWeek = getWeekInfo()
  const existingEntry = normalizeBackupEntry(meta[session.user.id])
  if (!force && existingEntry?.weekKey === currentWeek.key) {
    return {
      weekKey: currentWeek.key,
      hasBackupThisWeek: true,
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
      weekKey: currentWeek.key,
      source: 'action-journal',
      localMode,
      userId: session.user.id,
      email: session.user.email || '',
    },
    state: parsedData,
  }

  const filename = `action-journal-backup-${sanitizeSegment(session.user.email, session.user.id)}-${currentWeek.key}.json`
  downloadJson(filename, backupPayload)
  writeBackupMeta({
    ...meta,
    [session.user.id]: {
      weekKey: currentWeek.key,
      lastBackupAt: downloadedAt,
      filename,
    },
  })

  return {
    weekKey: currentWeek.key,
    hasBackupThisWeek: true,
    lastBackupAt: downloadedAt,
    filename,
    downloaded: true,
  }
}

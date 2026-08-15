export function dateToLocalDateKey(date = new Date()) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return ''
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60 * 1000)
  return local.toISOString().slice(0, 10)
}

export function getTodayKey() {
  return dateToLocalDateKey(new Date())
}

export function parseDateKey(dateKey) {
  if (typeof dateKey !== 'string') return null
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const date = new Date(year, month - 1, day)

  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null
  }

  return date
}

export function isValidDateKey(dateKey) {
  return Boolean(parseDateKey(dateKey))
}

export function addDaysToDateKey(dateKey, days) {
  const date = parseDateKey(dateKey) || new Date()
  date.setDate(date.getDate() + days)
  return dateToLocalDateKey(date)
}

export function formatDateKeyForDisplay(dateKey) {
  return isValidDateKey(dateKey) ? dateKey.split('-').join(' - ') : ''
}

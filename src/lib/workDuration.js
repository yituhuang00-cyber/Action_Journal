function toTimestamp(value) {
  if (value === null || value === undefined || value === '') return null
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime()
  return Number.isNaN(timestamp) ? null : timestamp
}

export function getLocalWeekStart(date = new Date()) {
  const weekStart = new Date(date)
  if (Number.isNaN(weekStart.getTime())) return null

  weekStart.setHours(0, 0, 0, 0)
  const daysSinceMonday = (weekStart.getDay() + 6) % 7
  weekStart.setDate(weekStart.getDate() - daysSinceMonday)
  return weekStart
}

export function sumActionMinutesWithinPeriod(actions, periodStart, periodEnd) {
  const rangeStart = toTimestamp(periodStart)
  const rangeEnd = toTimestamp(periodEnd)
  if (rangeStart === null || rangeEnd === null || rangeEnd <= rangeStart) return 0

  const totalMilliseconds = (Array.isArray(actions) ? actions : []).reduce((total, action) => {
    if (!action?.startTime) return total

    const actionStart = toTimestamp(action.startTime)
    const actionEnd = action.endTime ? toTimestamp(action.endTime) : rangeEnd
    if (actionStart === null || actionEnd === null || actionEnd <= actionStart) return total

    const boundedStart = Math.max(actionStart, rangeStart)
    const boundedEnd = Math.min(actionEnd, rangeEnd)
    if (boundedEnd <= boundedStart) return total

    return total + boundedEnd - boundedStart
  }, 0)

  return Math.floor(totalMilliseconds / 60000)
}

export function getWorkDurationTotals(actions, date = new Date()) {
  const now = new Date(date)
  if (Number.isNaN(now.getTime())) {
    return { totalMinutesToday: 0, totalMinutesThisWeek: 0 }
  }

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const weekStart = getLocalWeekStart(now)

  return {
    totalMinutesToday: sumActionMinutesWithinPeriod(actions, todayStart, now),
    totalMinutesThisWeek: sumActionMinutesWithinPeriod(actions, weekStart, now),
  }
}

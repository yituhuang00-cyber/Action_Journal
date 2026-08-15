import test from 'node:test'
import assert from 'node:assert/strict'
import { getLocalWeekStart, getWorkDurationTotals, sumActionMinutesWithinPeriod } from './workDuration.js'

test('sums exact durations before converting the total to minutes', () => {
  const actions = [
    { startTime: '2026-07-14T10:00:00.000Z', endTime: '2026-07-14T10:00:31.000Z' },
    { startTime: '2026-07-14T10:01:00.000Z', endTime: '2026-07-14T10:01:31.000Z' },
  ]

  assert.equal(
    sumActionMinutesWithinPeriod(actions, '2026-07-14T10:00:00.000Z', '2026-07-14T11:00:00.000Z'),
    1,
  )
})

test('clips completed and ongoing actions to the requested period', () => {
  const actions = [
    { startTime: '2026-07-14T09:30:00.000Z', endTime: '2026-07-14T10:30:00.000Z' },
    { startTime: '2026-07-14T10:45:00.000Z', endTime: null },
    { startTime: '2026-07-14T11:30:00.000Z', endTime: null },
  ]

  assert.equal(
    sumActionMinutesWithinPeriod(actions, '2026-07-14T10:00:00.000Z', '2026-07-14T11:00:00.000Z'),
    45,
  )
})

test('ignores invalid and reversed action ranges', () => {
  const actions = [
    { startTime: 'invalid', endTime: '2026-07-14T10:30:00.000Z' },
    { startTime: '2026-07-14T10:30:00.000Z', endTime: '2026-07-14T10:00:00.000Z' },
  ]

  assert.equal(
    sumActionMinutesWithinPeriod(actions, '2026-07-14T10:00:00.000Z', '2026-07-14T11:00:00.000Z'),
    0,
  )
})

test('uses Monday at local midnight as the start of the week', () => {
  const weekStart = getLocalWeekStart(new Date(2026, 6, 12, 18, 30))

  assert.equal(weekStart.getFullYear(), 2026)
  assert.equal(weekStart.getMonth(), 6)
  assert.equal(weekStart.getDate(), 6)
  assert.equal(weekStart.getHours(), 0)
  assert.equal(weekStart.getMinutes(), 0)
})

test('returns a non-zero weekly total for actions recorded during the current week', () => {
  const now = new Date(2026, 6, 14, 12, 0)
  const actions = [
    {
      startTime: new Date(2026, 6, 13, 9, 0).toISOString(),
      endTime: new Date(2026, 6, 13, 10, 0).toISOString(),
    },
    {
      startTime: new Date(2026, 6, 14, 10, 0).toISOString(),
      endTime: new Date(2026, 6, 14, 10, 30).toISOString(),
    },
  ]

  assert.deepEqual(getWorkDurationTotals(actions, now), {
    totalMinutesToday: 30,
    totalMinutesThisWeek: 90,
  })
})

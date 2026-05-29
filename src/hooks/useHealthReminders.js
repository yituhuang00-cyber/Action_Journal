import { useEffect, useState } from 'react'
import { STORAGE_SYNC_EVENT } from '../storage/storage'

// Note: storage/storage.js does not export readState; reimplement lightweight reader
function readStateRaw() {
  try {
    const raw = localStorage.getItem('action-journal:state')
    if (!raw) return { goals: {}, actions: {}, settings: { conservativeMinutes: 60, ambitiousMinutes: 180 } }
    const parsed = JSON.parse(raw)
    parsed.settings = parsed.settings || { conservativeMinutes: 60, ambitiousMinutes: 180 }
    return parsed
  } catch {
    return { goals: {}, actions: {}, settings: { conservativeMinutes: 60, ambitiousMinutes: 180 } }
  }
}

function computeReminderInfo() {
  const state = readStateRaw()
  const { actions = {}, settings = {} } = state
  const conservative = settings.conservativeMinutes ?? 60
  const ambitious = settings.ambitiousMinutes ?? 180

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayStartISO = todayStart.toISOString()

  let total = 0
  Object.values(actions || {}).forEach((action) => {
    if (!action.startTime) return
    const start = new Date(action.startTime)
    const end = action.endTime ? new Date(action.endTime) : new Date()
    const boundedStart = start < new Date(todayStartISO) ? new Date(todayStartISO) : start
    if (end <= boundedStart) return
    total += Math.round((end - boundedStart) / 60000)
  })

  const status = total >= ambitious ? 'danger' : total >= conservative ? 'warn' : 'normal'
  return { status, totalMinutesToday: total, conservativeMinutes: conservative, ambitiousMinutes: ambitious }
}

export default function useHealthReminders() {
  const [info, setInfo] = useState(() => computeReminderInfo())

  function compute() {
    setInfo(computeReminderInfo())
  }

  useEffect(() => {
    // listen to storage events (other tabs) to recompute
    function onStorage() {
      compute()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(STORAGE_SYNC_EVENT, onStorage)
    const interval = setInterval(compute, 30 * 1000)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(STORAGE_SYNC_EVENT, onStorage)
      clearInterval(interval)
    }
  }, [])

  return info
}

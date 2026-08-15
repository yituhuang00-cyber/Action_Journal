import { useEffect, useState } from 'react'
import { getSettings, listAllActions, STORAGE_SYNC_EVENT } from '../storage/storage'
import { getWorkDurationTotals } from '../lib/workDuration'

function computeReminderInfo() {
  let actions = []
  let settings = {}
  try {
    actions = listAllActions()
    settings = getSettings()
  } catch {
    // Storage may still be initializing. The sync event will recompute once ready.
  }

  const conservative = settings.conservativeMinutes ?? 60
  const ambitious = settings.ambitiousMinutes ?? 180
  const { totalMinutesToday, totalMinutesThisWeek } = getWorkDurationTotals(actions)

  const status = totalMinutesToday >= ambitious ? 'danger' : totalMinutesToday >= conservative ? 'warn' : 'normal'
  return { status, totalMinutesToday, totalMinutesThisWeek, conservativeMinutes: conservative, ambitiousMinutes: ambitious }
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

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import useHealthReminders from '../hooks/useHealthReminders'
import {
  getDailyPlan,
  getSettings,
  getWeeklyPlan,
  listGoals,
  setDailyPlan,
  setWeeklyPlan,
  updateSettings,
  updateSubTarget,
} from '../storage/storage'

const SUB_TARGET_STATUS_OPTIONS = [
  { value: 'want', label: '想要做', hint: '先保留在备选区' },
  { value: 'doing', label: '正在做', hint: '本周稳定推进' },
  { value: 'done', label: '做完了', hint: '本周已完成' },
]

const DEFAULT_WEEKLY_CONSERVATIVE_HOURS = 12
const DEFAULT_WEEKLY_AMBITIOUS_HOURS = 24

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function formatDisplayDate(dateStr) {
  if (!dateStr) return '未安排'
  return dateStr.split('-').join(' - ')
}

function getWeekMetaForDate(inputDate = new Date()) {
  const sourceDate = inputDate instanceof Date ? inputDate : new Date(inputDate)
  const base = new Date(sourceDate.getFullYear(), sourceDate.getMonth(), sourceDate.getDate())
  const day = base.getDay() || 7
  const weekStart = new Date(base)
  weekStart.setDate(base.getDate() - day + 1)
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekStart.getDate() + 6)

  const isoDate = new Date(base)
  isoDate.setDate(base.getDate() + 4 - (base.getDay() || 7))
  const yearStart = new Date(isoDate.getFullYear(), 0, 1)
  const weekNumber = Math.ceil((((isoDate - yearStart) / 86400000) + 1) / 7)

  return {
    isoYear: isoDate.getFullYear(),
    weekNumber,
    weekKey: `${isoDate.getFullYear()}-W${pad(weekNumber)}`,
    startDate: formatDateOnly(weekStart),
    endDate: formatDateOnly(weekEnd),
  }
}

function addWeeksToDate(date, weeks = 0) {
  const nextDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  nextDate.setDate(nextDate.getDate() + (weeks * 7))
  return nextDate
}

function formatSubTargetSchedule(subTarget) {
  const startDate = subTarget?.startDate || ''
  const endDate = subTarget?.endDate || ''
  if (!startDate && !endDate) return '暂未安排日期'
  if (startDate && endDate) return `${formatDisplayDate(startDate)} 到 ${formatDisplayDate(endDate)}`
  if (startDate) return `从 ${formatDisplayDate(startDate)} 开始`
  return `到 ${formatDisplayDate(endDate)} 结束`
}

function isValidSubTargetDateRange(startDate, endDate) {
  if (!startDate || !endDate) return true
  return startDate <= endDate
}

function overlapsWeek(subTarget, weekMeta) {
  if (!subTarget?.startDate && !subTarget?.endDate) return false
  const startDate = subTarget.startDate || subTarget.endDate
  const endDate = subTarget.endDate || subTarget.startDate
  if (!startDate || !endDate) return false
  return startDate <= weekMeta.endDate && endDate >= weekMeta.startDate
}

function toRefKey(goalId, subTargetId) {
  return `${goalId}::${subTargetId}`
}

function groupWeeklyItems(items) {
  const groups = []
  const groupMap = new Map()

  items.forEach((item) => {
    const existingGroup = groupMap.get(item.goalId)
    if (existingGroup) {
      existingGroup.items.push(item)
      return
    }

    const nextGroup = { goalId: item.goalId, goalTitle: item.goalTitle, items: [item] }
    groupMap.set(item.goalId, nextGroup)
    groups.push(nextGroup)
  })

  return groups
}

function isAssignedToWeek(subTarget, weekMeta) {
  return subTarget?.startDate === weekMeta.startDate && subTarget?.endDate === weekMeta.endDate
}

function normalizeHourNumber(value) {
  const hours = Number(value)
  if (!Number.isFinite(hours) || hours <= 0) return null
  return Math.round(hours * 100) / 100
}

function parsePositiveHoursInput(value) {
  const text = String(value ?? '').trim()
  if (!text) return Number.NaN
  const hours = normalizeHourNumber(text)
  return hours ?? Number.NaN
}

function formatHoursValue(value) {
  const hours = normalizeHourNumber(value)
  if (!hours) return '?'
  if (Number.isInteger(hours)) return String(hours)
  return hours.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

function sumEstimatedHours(items) {
  return Math.round(items.reduce((sum, item) => sum + (normalizeHourNumber(item?.subTarget?.estimatedHours) || 0), 0) * 100) / 100
}

function countUnknownEstimatedHours(items) {
  return items.filter((item) => !normalizeHourNumber(item?.subTarget?.estimatedHours)).length
}

function mergeOrderedRefKeys(...lists) {
  const merged = []
  const seen = new Set()
  lists.flat().forEach((key) => {
    if (!key || seen.has(key)) return
    seen.add(key)
    merged.push(key)
  })
  return merged
}

function placeKeyInList(keys, key, targetKey = '') {
  if (!key) return keys
  if (targetKey && key === targetKey) return keys

  const next = keys.filter((item) => item !== key)
  if (!targetKey) return [...next, key]

  const targetIndex = next.indexOf(targetKey)
  if (targetIndex === -1) return [...next, key]
  next.splice(targetIndex, 0, key)
  return next
}

function parseDragPayload(rawValue) {
  if (!rawValue) return { key: '', source: '' }
  try {
    const parsed = JSON.parse(rawValue)
    return {
      key: typeof parsed?.key === 'string' ? parsed.key : '',
      source: typeof parsed?.source === 'string' ? parsed.source : '',
    }
  } catch {
    return { key: rawValue, source: 'pool' }
  }
}

function parseWeeklyDragPayload(rawValue) {
  if (!rawValue) return { type: '', key: '', goalId: '' }
  try {
    const parsed = JSON.parse(rawValue)
    return {
      type: typeof parsed?.type === 'string' ? parsed.type : '',
      key: typeof parsed?.key === 'string' ? parsed.key : '',
      goalId: typeof parsed?.goalId === 'string' ? parsed.goalId : '',
    }
  } catch {
    return { type: '', key: '', goalId: '' }
  }
}

function getStatusLabel(status) {
  if (status === 'doing') return '正在做'
  if (status === 'done') return '做完了'
  return '想要做'
}

function InlineEstimatedHoursField({
  itemKey,
  value,
  onCommit,
  className = '',
  chipClassName = '',
  inputClassName = '',
}) {
  const defaultValue = value == null ? '' : formatHoursValue(value)

  function resetInputValue(input) {
    input.value = defaultValue
  }

  function handleCommit(event) {
    const input = event.currentTarget
    const text = String(input.value ?? '').trim()
    const nextValue = text ? normalizeHourNumber(text) : null

    if (text && !nextValue) {
      resetInputValue(input)
      window.alert('请填写正确的预估时长（小时），或留空')
      return
    }

    const currentValue = normalizeHourNumber(value)
    if ((currentValue ?? null) === (nextValue ?? null)) {
      input.value = nextValue == null ? '' : formatHoursValue(nextValue)
      return
    }

    const committed = onCommit(nextValue)
    if (committed === false) {
      resetInputValue(input)
      return
    }

    input.value = nextValue == null ? '' : formatHoursValue(nextValue)
  }

  function handleKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      event.currentTarget.blur()
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      resetInputValue(event.currentTarget)
      event.currentTarget.blur()
    }
  }

  const wrapperClassName = ['weekly-estimate-inline', className].filter(Boolean).join(' ')
  const shellClassName = ['weekly-estimate-inline-shell', chipClassName].filter(Boolean).join(' ')
  const fieldClassName = ['weekly-estimate-inline-input', inputClassName].filter(Boolean).join(' ')

  return (
    <span className={wrapperClassName}>
      <span className={shellClassName}>
        预估
        <input
          key={`${itemKey}-${defaultValue || 'empty'}`}
          className={fieldClassName}
          type="number"
          min="0"
          step="0.5"
          inputMode="decimal"
          defaultValue={defaultValue}
          placeholder="?"
          aria-label="预估时长（小时）"
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
        />
        小时
      </span>
    </span>
  )
}

export default function DailyPlanner() {
  const reminders = useHealthReminders()
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const currentWeekDate = useMemo(() => new Date(), [])
  const currentWeekMeta = useMemo(() => getWeekMetaForDate(currentWeekDate), [currentWeekDate])
  const initialSettings = useMemo(() => getSettings(), [])
  const [activeWeekOffset, setActiveWeekOffset] = useState(0)
  const activeWeekDate = useMemo(() => addWeeksToDate(currentWeekDate, activeWeekOffset), [activeWeekOffset, currentWeekDate])
  const activeWeekMeta = useMemo(() => getWeekMetaForDate(activeWeekDate), [activeWeekDate])
  const isViewingCurrentWeek = activeWeekMeta.weekKey === currentWeekMeta.weekKey
  const [planText, setPlanText] = useState(() => getDailyPlan(todayStr))
  const [conservative, setConservative] = useState(() => initialSettings.conservativeMinutes ?? 60)
  const [ambitious, setAmbitious] = useState(() => initialSettings.ambitiousMinutes ?? 180)
  const [saving, setSaving] = useState(false)
  const [, setPlannerDataRevision] = useState(0)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [builderStep, setBuilderStep] = useState(1)
  const [conservativeHoursTargetDraft, setConservativeHoursTargetDraft] = useState(String(DEFAULT_WEEKLY_CONSERVATIVE_HOURS))
  const [ambitiousHoursTargetDraft, setAmbitiousHoursTargetDraft] = useState(String(DEFAULT_WEEKLY_AMBITIOUS_HOURS))
  const [selectedConservativeRefKeys, setSelectedConservativeRefKeys] = useState([])
  const [selectedAmbitiousRefKeys, setSelectedAmbitiousRefKeys] = useState([])
  const [draggingBuilderKey, setDraggingBuilderKey] = useState('')
  const [draggingBuilderSource, setDraggingBuilderSource] = useState('')
  const [dropTargetKey, setDropTargetKey] = useState('')
  const [dropTargetColumn, setDropTargetColumn] = useState('')
  const [draggingWeeklyType, setDraggingWeeklyType] = useState('')
  const [draggingWeeklyItemKey, setDraggingWeeklyItemKey] = useState('')
  const [draggingWeeklyGoalId, setDraggingWeeklyGoalId] = useState('')
  const [weeklyItemDropKey, setWeeklyItemDropKey] = useState('')
  const [weeklyItemDropGoalId, setWeeklyItemDropGoalId] = useState('')
  const [weeklyGoalDropId, setWeeklyGoalDropId] = useState('')
  const [editingItemKey, setEditingItemKey] = useState('')
  const [editingDraft, setEditingDraft] = useState({ startDate: '', endDate: '', estimatedHours: '', content: '' })
  const [pendingRemovalKey, setPendingRemovalKey] = useState('')
  const [showOnlyActiveWeeklyItems, setShowOnlyActiveWeeklyItems] = useState(false)
  const planHydratedRef = useRef(false)

  const goals = listGoals()
  const weeklyPlan = getWeeklyPlan(activeWeekMeta.weekKey)

  function refreshPlannerData() {
    setPlannerDataRevision((current) => current + 1)
  }

  useEffect(() => {
    if (!planHydratedRef.current) {
      planHydratedRef.current = true
      return undefined
    }
    const timer = setTimeout(() => {
      setDailyPlan(todayStr, planText)
    }, 400)
    return () => clearTimeout(timer)
  }, [planText, todayStr])

  useEffect(() => {
    if (!builderOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [builderOpen])

  useEffect(() => {
    if (!pendingRemovalKey) return undefined
    const timer = window.setTimeout(() => {
      setPendingRemovalKey('')
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [pendingRemovalKey])

  const indexedItems = useMemo(() => {
    const map = new Map()
    goals.forEach((goal) => {
      ;(goal.subTargets || []).forEach((subTarget) => {
        map.set(toRefKey(goal.id, subTarget.id), {
          goalId: goal.id,
          goalTitle: goal.title,
          subTargetId: subTarget.id,
          key: toRefKey(goal.id, subTarget.id),
          subTarget,
        })
      })
    })
    return map
  }, [goals])

  const allGoalGroups = useMemo(() => goals
    .map((goal) => ({
      goalId: goal.id,
      goalTitle: goal.title,
      items: (goal.subTargets || []).map((subTarget) => ({
        goalId: goal.id,
        goalTitle: goal.title,
        subTargetId: subTarget.id,
        key: toRefKey(goal.id, subTarget.id),
        subTarget,
      })),
    }))
    .filter((group) => group.items.length), [goals])

  const builderCandidateGoalGroups = useMemo(() => allGoalGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => item.subTarget.status !== 'done'),
    }))
    .filter((group) => group.items.length), [allGoalGroups])

  const goalsWithoutSubTargets = useMemo(
    () => goals.filter((goal) => !(goal.subTargets || []).length),
    [goals],
  )

  const totalSubTargetCount = useMemo(
    () => goals.reduce((sum, goal) => sum + (goal.subTargets || []).length, 0),
    [goals],
  )

  const subTargetsMissingEstimateCount = useMemo(
    () => goals.reduce((sum, goal) => sum + (goal.subTargets || []).filter((subTarget) => !normalizeHourNumber(subTarget.estimatedHours)).length, 0),
    [goals],
  )

  const selectedConservativeKeySet = useMemo(() => new Set(selectedConservativeRefKeys), [selectedConservativeRefKeys])

  const selectedConservativeItems = useMemo(
    () => selectedConservativeRefKeys.map((key) => indexedItems.get(key)).filter(Boolean),
    [indexedItems, selectedConservativeRefKeys],
  )

  const selectedAmbitiousItems = useMemo(
    () => selectedAmbitiousRefKeys.map((key) => indexedItems.get(key)).filter(Boolean),
    [indexedItems, selectedAmbitiousRefKeys],
  )

  const selectedBuilderUnionRefKeys = useMemo(
    () => mergeOrderedRefKeys(selectedConservativeRefKeys, selectedAmbitiousRefKeys),
    [selectedAmbitiousRefKeys, selectedConservativeRefKeys],
  )

  const selectedBuilderUnionKeySet = useMemo(
    () => new Set(selectedBuilderUnionRefKeys),
    [selectedBuilderUnionRefKeys],
  )

  const selectedBuilderUnionItems = useMemo(
    () => selectedBuilderUnionRefKeys.map((key) => indexedItems.get(key)).filter(Boolean),
    [indexedItems, selectedBuilderUnionRefKeys],
  )

  const unplannedGoalGroups = useMemo(() => builderCandidateGoalGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => !selectedBuilderUnionKeySet.has(item.key)),
    }))
    .filter((group) => group.items.length), [builderCandidateGoalGroups, selectedBuilderUnionKeySet])

  const unplannedSubTargetCount = useMemo(
    () => unplannedGoalGroups.reduce((sum, group) => sum + group.items.length, 0),
    [unplannedGoalGroups],
  )

  const groupedSelectedConservativeItems = useMemo(
    () => groupWeeklyItems(selectedConservativeItems),
    [selectedConservativeItems],
  )

  const groupedSelectedAmbitiousItems = useMemo(
    () => groupWeeklyItems(selectedAmbitiousItems),
    [selectedAmbitiousItems],
  )

  const weeklyConservativeItems = useMemo(() => {
    if (!weeklyPlan?.conservativeSubTargetRefs?.length) return []
    return weeklyPlan.conservativeSubTargetRefs
      .map((ref) => indexedItems.get(toRefKey(ref.goalId, ref.subTargetId)))
      .filter(Boolean)
  }, [indexedItems, weeklyPlan])

  const weeklyAmbitiousItems = useMemo(() => {
    if (!weeklyPlan?.ambitiousSubTargetRefs?.length) return []
    const conservativeKeySet = new Set(weeklyConservativeItems.map((item) => item.key))
    return weeklyPlan.ambitiousSubTargetRefs
      .map((ref) => indexedItems.get(toRefKey(ref.goalId, ref.subTargetId)))
      .filter(Boolean)
      .filter((item) => !conservativeKeySet.has(item.key))
  }, [indexedItems, weeklyConservativeItems, weeklyPlan])

  const weeklyItems = useMemo(() => {
    if (!weeklyPlan?.subTargetRefs?.length) return []
    return weeklyPlan.subTargetRefs
      .map((ref) => indexedItems.get(toRefKey(ref.goalId, ref.subTargetId)))
      .filter(Boolean)
  }, [indexedItems, weeklyPlan])

  const weeklyConservativeKeySet = useMemo(
    () => new Set(weeklyConservativeItems.map((item) => item.key)),
    [weeklyConservativeItems],
  )

  const weeklyAmbitiousKeySet = useMemo(
    () => new Set(weeklyAmbitiousItems.map((item) => item.key)),
    [weeklyAmbitiousItems],
  )

  const weeklyStats = useMemo(() => ({
    total: weeklyItems.length,
    conservativeCount: weeklyConservativeItems.length,
    ambitiousCount: weeklyAmbitiousItems.length,
    conservativeHours: sumEstimatedHours(weeklyConservativeItems),
    ambitiousHours: sumEstimatedHours(weeklyAmbitiousItems),
    unknownEstimates: countUnknownEstimatedHours(weeklyItems),
    want: weeklyItems.filter((item) => item.subTarget.status === 'want').length,
    doing: weeklyItems.filter((item) => item.subTarget.status === 'doing').length,
    done: weeklyItems.filter((item) => item.subTarget.status === 'done').length,
  }), [weeklyAmbitiousItems, weeklyConservativeItems, weeklyItems])

  const visibleWeeklyConservativeItems = useMemo(
    () => (showOnlyActiveWeeklyItems ? weeklyConservativeItems.filter((item) => item.subTarget.status !== 'done') : weeklyConservativeItems),
    [showOnlyActiveWeeklyItems, weeklyConservativeItems],
  )

  const visibleWeeklyAmbitiousItems = useMemo(
    () => (showOnlyActiveWeeklyItems ? weeklyAmbitiousItems.filter((item) => item.subTarget.status !== 'done') : weeklyAmbitiousItems),
    [showOnlyActiveWeeklyItems, weeklyAmbitiousItems],
  )

  const groupedAllWeeklyItems = useMemo(() => groupWeeklyItems(weeklyItems), [weeklyItems])
  const groupedVisibleWeeklyConservativeItems = useMemo(() => groupWeeklyItems(visibleWeeklyConservativeItems), [visibleWeeklyConservativeItems])
  const groupedVisibleWeeklyAmbitiousItems = useMemo(() => groupWeeklyItems(visibleWeeklyAmbitiousItems), [visibleWeeklyAmbitiousItems])

  const weeklyGoalOrder = useMemo(
    () => groupedAllWeeklyItems.map((group) => group.goalId),
    [groupedAllWeeklyItems],
  )

  const weeklyGoalKeyMap = useMemo(() => new Map(
    groupedAllWeeklyItems.map((group) => [group.goalId, group.items.map((item) => item.key)]),
  ), [groupedAllWeeklyItems])

  const conservativeHoursTarget = parsePositiveHoursInput(conservativeHoursTargetDraft)
  const ambitiousHoursTarget = parsePositiveHoursInput(ambitiousHoursTargetDraft)

  function buildPlanRefsFromKeys(keys) {
    return keys
      .map((key) => indexedItems.get(key))
      .filter(Boolean)
      .map((item) => ({ goalId: item.goalId, subTargetId: item.subTargetId }))
  }

  function handleSave() {
    const nextConservative = Number(conservative)
    const nextAmbitious = Number(ambitious)
    if (!Number.isFinite(nextConservative) || nextConservative <= 0) return window.alert('请填写正确的保守行动时长（分钟）')
    if (!Number.isFinite(nextAmbitious) || nextAmbitious <= 0) return window.alert('请填写正确的进取行动时长（分钟）')
    if (nextAmbitious < nextConservative) return window.alert('进取行动时长建议大于等于保守行动时长')
    setSaving(true)
    updateSettings({ conservativeMinutes: nextConservative, ambitiousMinutes: nextAmbitious })
    setSaving(false)
    window.alert('已保存到日规划')
  }

  function openBuilder() {
    const existingConservative = (weeklyPlan?.conservativeSubTargetRefs || []).map((ref) => toRefKey(ref.goalId, ref.subTargetId))
    const existingAmbitious = (weeklyPlan?.ambitiousSubTargetRefs || []).map((ref) => toRefKey(ref.goalId, ref.subTargetId))

    const autoConservative = goals.flatMap((goal) => (goal.subTargets || [])
      .filter((subTarget) => overlapsWeek(subTarget, activeWeekMeta) && subTarget.status === 'doing')
      .map((subTarget) => toRefKey(goal.id, subTarget.id)))

    const nextConservative = mergeOrderedRefKeys(existingConservative, autoConservative)
    const nextConservativeKeySet = new Set(nextConservative)

    const autoAmbitious = goals.flatMap((goal) => (goal.subTargets || [])
      .filter((subTarget) => overlapsWeek(subTarget, activeWeekMeta) && subTarget.status !== 'done')
      .map((subTarget) => toRefKey(goal.id, subTarget.id))
      .filter((key) => !nextConservativeKeySet.has(key)))

    const nextAmbitious = mergeOrderedRefKeys(
      existingAmbitious.filter((key) => !nextConservativeKeySet.has(key)),
      autoAmbitious,
    )

    const nextConservativeTarget = weeklyPlan?.conservativeHoursTarget ?? DEFAULT_WEEKLY_CONSERVATIVE_HOURS
    const nextAmbitiousTarget = Math.max(
      weeklyPlan?.ambitiousHoursTarget ?? DEFAULT_WEEKLY_AMBITIOUS_HOURS,
      nextConservativeTarget,
    )

    setSelectedConservativeRefKeys(nextConservative)
    setSelectedAmbitiousRefKeys(nextAmbitious)
    setConservativeHoursTargetDraft(String(nextConservativeTarget))
    setAmbitiousHoursTargetDraft(String(nextAmbitiousTarget))
    setBuilderStep(1)
    setBuilderOpen(true)
  }

  function closeBuilder() {
    setBuilderOpen(false)
    setBuilderStep(1)
    setConservativeHoursTargetDraft(String(DEFAULT_WEEKLY_CONSERVATIVE_HOURS))
    setAmbitiousHoursTargetDraft(String(DEFAULT_WEEKLY_AMBITIOUS_HOURS))
    setSelectedConservativeRefKeys([])
    setSelectedAmbitiousRefKeys([])
    setDraggingBuilderKey('')
    setDraggingBuilderSource('')
    setDropTargetKey('')
    setDropTargetColumn('')
  }

  function addBuilderItemToConservative(key) {
    moveBuilderItem(key, 'conservative')
  }

  function addBuilderItemToAmbitious(key) {
    moveBuilderItem(key, 'ambitious')
  }

  function removeConservativeBuilderItem(key) {
    moveBuilderItem(key, 'pool')
  }

  function removeAmbitiousBuilderItem(key) {
    moveBuilderItem(key, 'pool')
  }

  function moveBuilderItem(key, targetColumn, targetKey = '') {
    if (!key) return

    if (targetColumn === 'pool') {
      setSelectedConservativeRefKeys((current) => current.filter((item) => item !== key))
      setSelectedAmbitiousRefKeys((current) => current.filter((item) => item !== key))
      return
    }

    if (targetColumn === 'conservative') {
      setSelectedConservativeRefKeys((current) => placeKeyInList(current, key, targetKey))
      setSelectedAmbitiousRefKeys((current) => current.filter((item) => item !== key))
      return
    }

    if (targetColumn === 'ambitious') {
      setSelectedAmbitiousRefKeys((current) => placeKeyInList(current, key, targetKey))
      setSelectedConservativeRefKeys((current) => current.filter((item) => item !== key))
    }
  }

  function handleBuilderItemDragStart(event, key, source) {
    setDraggingBuilderKey(key)
    setDraggingBuilderSource(source)
    event.dataTransfer.setData('text/plain', JSON.stringify({ key, source }))
    event.dataTransfer.effectAllowed = 'move'
  }

  function handleBuilderItemDragEnd() {
    setDraggingBuilderKey('')
    setDraggingBuilderSource('')
    setDropTargetKey('')
    setDropTargetColumn('')
  }

  function getActiveBuilderPayload(event) {
    if (draggingBuilderKey) {
      return { key: draggingBuilderKey, source: draggingBuilderSource }
    }

    return parseDragPayload(event.dataTransfer.getData('text/plain'))
  }

  function handleBuilderDragOver(event, columnKey, targetKey = '') {
    const payload = getActiveBuilderPayload(event)
    if (!payload.key) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
    if (dropTargetKey !== targetKey || dropTargetColumn !== columnKey) {
      setDropTargetKey(targetKey)
      setDropTargetColumn(columnKey)
    }
  }

  function handleBuilderDragLeave(columnKey, targetKey = '') {
    if (dropTargetKey === targetKey && dropTargetColumn === columnKey) {
      setDropTargetKey('')
      setDropTargetColumn('')
    }
  }

  function handleBuilderDrop(event, columnKey, targetKey = '') {
    event.preventDefault()
    const payload = getActiveBuilderPayload(event)
    if (!payload.key) return

    moveBuilderItem(payload.key, columnKey, targetKey)

    handleBuilderItemDragEnd()
  }

  function handleContinueAfterBrainstorm() {
    if (!totalSubTargetCount) return window.alert('请先至少创建一个子目标，再来制定这一周计划。')
    setBuilderStep(2)
  }

  function validateWeeklyTargets() {
    const nextConservativeTarget = parsePositiveHoursInput(conservativeHoursTargetDraft)
    const nextAmbitiousTarget = parsePositiveHoursInput(ambitiousHoursTargetDraft)
    if (Number.isNaN(nextConservativeTarget)) {
      window.alert('请填写正确的保守版周计划时长（小时）')
      return null
    }
    if (Number.isNaN(nextAmbitiousTarget)) {
      window.alert('请填写正确的进取版周计划时长（小时）')
      return null
    }
    if (nextAmbitiousTarget < nextConservativeTarget) {
      window.alert('进取版周计划时长需要大于或等于保守版时长')
      return null
    }
    return {
      conservativeHoursTarget: nextConservativeTarget,
      ambitiousHoursTarget: nextAmbitiousTarget,
    }
  }

  function handleContinueToSelection() {
    const nextTargets = validateWeeklyTargets()
    if (!nextTargets) return
    setConservativeHoursTargetDraft(String(nextTargets.conservativeHoursTarget))
    setAmbitiousHoursTargetDraft(String(nextTargets.ambitiousHoursTarget))
    setBuilderStep(3)
  }

  function handleConfirmWeeklyPlan() {
    const nextTargets = validateWeeklyTargets()
    if (!nextTargets) return
    if (!selectedConservativeItems.length) return window.alert('请至少为保守版周计划挑选一个子目标')
    if (!selectedAmbitiousItems.length) return window.alert('请至少为进取版周计划挑选一个子目标')

    const nextUnionKeySet = new Set(selectedBuilderUnionRefKeys)
    const previousItems = (weeklyPlan?.subTargetRefs || [])
      .map((ref) => indexedItems.get(toRefKey(ref.goalId, ref.subTargetId)))
      .filter(Boolean)

    previousItems.forEach((item) => {
      if (nextUnionKeySet.has(item.key)) return
      if (item.subTarget.status === 'done') return
      updateSubTarget(item.goalId, item.subTargetId, {
        status: 'want',
        startDate: isAssignedToWeek(item.subTarget, activeWeekMeta) ? '' : item.subTarget.startDate,
        endDate: isAssignedToWeek(item.subTarget, activeWeekMeta) ? '' : item.subTarget.endDate,
      })
    })

    selectedBuilderUnionItems.forEach((item) => {
      const shouldBeDoing = selectedConservativeKeySet.has(item.key)
      const patch = {
        startDate: activeWeekMeta.startDate,
        endDate: activeWeekMeta.endDate,
      }
      if (item.subTarget.status !== 'done') {
        patch.status = shouldBeDoing ? 'doing' : 'want'
      }
      updateSubTarget(item.goalId, item.subTargetId, patch)
    })

    setWeeklyPlan(activeWeekMeta.weekKey, {
      startDate: activeWeekMeta.startDate,
      endDate: activeWeekMeta.endDate,
      conservativeHoursTarget: nextTargets.conservativeHoursTarget,
      ambitiousHoursTarget: nextTargets.ambitiousHoursTarget,
      conservativeSubTargetRefs: buildPlanRefsFromKeys(selectedConservativeRefKeys),
      ambitiousSubTargetRefs: buildPlanRefsFromKeys(selectedAmbitiousRefKeys),
      subTargetRefs: buildPlanRefsFromKeys(selectedBuilderUnionRefKeys),
      confirmedAt: new Date().toISOString(),
    })

    closeBuilder()
    refreshPlannerData()
    window.alert('这一周的保守版 / 进取版周计划已确认')
  }

  function handleRemoveWeeklyItem(item) {
    if (pendingRemovalKey !== item.key) {
      setPendingRemovalKey(item.key)
      return
    }

    const nextConservativeKeys = (weeklyPlan?.conservativeSubTargetRefs || [])
      .map((ref) => toRefKey(ref.goalId, ref.subTargetId))
      .filter((key) => key !== item.key)
    const nextAmbitiousKeys = (weeklyPlan?.ambitiousSubTargetRefs || [])
      .map((ref) => toRefKey(ref.goalId, ref.subTargetId))
      .filter((key) => key !== item.key)
    const nextUnionKeys = mergeOrderedRefKeys(nextConservativeKeys, nextAmbitiousKeys)

    setWeeklyPlan(activeWeekMeta.weekKey, {
      startDate: activeWeekMeta.startDate,
      endDate: activeWeekMeta.endDate,
      conservativeHoursTarget: weeklyPlan?.conservativeHoursTarget ?? DEFAULT_WEEKLY_CONSERVATIVE_HOURS,
      ambitiousHoursTarget: weeklyPlan?.ambitiousHoursTarget ?? DEFAULT_WEEKLY_AMBITIOUS_HOURS,
      conservativeSubTargetRefs: buildPlanRefsFromKeys(nextConservativeKeys),
      ambitiousSubTargetRefs: buildPlanRefsFromKeys(nextAmbitiousKeys),
      subTargetRefs: buildPlanRefsFromKeys(nextUnionKeys),
      confirmedAt: new Date().toISOString(),
    })

    if (item.subTarget.status !== 'done') {
      updateSubTarget(item.goalId, item.subTargetId, {
        status: 'want',
        startDate: isAssignedToWeek(item.subTarget, activeWeekMeta) ? '' : item.subTarget.startDate,
        endDate: isAssignedToWeek(item.subTarget, activeWeekMeta) ? '' : item.subTarget.endDate,
      })
    }

    if (editingItemKey === item.key) handleCancelEdit()
    setPendingRemovalKey('')
    refreshPlannerData()
  }

  function handleStartEdit(item) {
    setEditingItemKey(item.key)
    setEditingDraft({
      startDate: item.subTarget.startDate || '',
      endDate: item.subTarget.endDate || '',
      estimatedHours: item.subTarget.estimatedHours == null ? '' : String(item.subTarget.estimatedHours),
      content: item.subTarget.content || '',
    })
  }

  function handleCancelEdit() {
    setEditingItemKey('')
    setEditingDraft({ startDate: '', endDate: '', estimatedHours: '', content: '' })
  }

  function handleSaveWeeklyItem(item) {
    const content = editingDraft.content.trim()
    if (!content) return window.alert('请填写子目标内容')
    if (!isValidSubTargetDateRange(editingDraft.startDate, editingDraft.endDate)) {
      return window.alert('结束日期需要晚于或等于开始日期')
    }

    const estimatedHoursText = String(editingDraft.estimatedHours ?? '').trim()
    const estimatedHours = estimatedHoursText ? normalizeHourNumber(estimatedHoursText) : null
    if (estimatedHoursText && !estimatedHours) return window.alert('请填写正确的预估时长（小时），或留空')

    const updated = updateSubTarget(item.goalId, item.subTargetId, {
      startDate: editingDraft.startDate,
      endDate: editingDraft.endDate,
      estimatedHours,
      content,
    })
    if (!updated) return window.alert('子目标更新失败，请稍后再试')
    handleCancelEdit()
    refreshPlannerData()
  }

  function handleWeeklyStatusChange(item, status) {
    if (item.subTarget.status === status) return
    updateSubTarget(item.goalId, item.subTargetId, { status })
    refreshPlannerData()
  }

  function handleEstimatedHoursUpdate(item, nextEstimatedHours) {
    const currentEstimatedHours = normalizeHourNumber(item.subTarget.estimatedHours)
    if ((currentEstimatedHours ?? null) === (nextEstimatedHours ?? null)) return true

    const updated = updateSubTarget(item.goalId, item.subTargetId, {
      estimatedHours: nextEstimatedHours,
    })

    if (!updated) {
      window.alert('预估时长更新失败，请稍后再试')
      return false
    }

    refreshPlannerData()
    return true
  }

  function saveWeeklyPresentationOrder(nextGoalOrder, nextGoalKeyMap) {
    const nextUnionKeys = nextGoalOrder.flatMap((goalId) => nextGoalKeyMap.get(goalId) || [])
    const currentUnionKeys = weeklyItems.map((item) => item.key)
    if (nextUnionKeys.join('|') === currentUnionKeys.join('|')) return

    const conservativeKeySet = new Set(weeklyConservativeItems.map((item) => item.key))
    const ambitiousKeySet = new Set(weeklyAmbitiousItems.map((item) => item.key))
    const nextConservativeKeys = nextUnionKeys.filter((key) => conservativeKeySet.has(key))
    const nextAmbitiousKeys = nextUnionKeys.filter((key) => ambitiousKeySet.has(key))

    setWeeklyPlan(activeWeekMeta.weekKey, {
      startDate: activeWeekMeta.startDate,
      endDate: activeWeekMeta.endDate,
      conservativeHoursTarget: weeklyPlan?.conservativeHoursTarget ?? DEFAULT_WEEKLY_CONSERVATIVE_HOURS,
      ambitiousHoursTarget: weeklyPlan?.ambitiousHoursTarget ?? DEFAULT_WEEKLY_AMBITIOUS_HOURS,
      conservativeSubTargetRefs: buildPlanRefsFromKeys(nextConservativeKeys),
      ambitiousSubTargetRefs: buildPlanRefsFromKeys(nextAmbitiousKeys),
      subTargetRefs: buildPlanRefsFromKeys(nextUnionKeys),
      confirmedAt: weeklyPlan?.confirmedAt || new Date().toISOString(),
    })

    refreshPlannerData()
  }

  function handleWeeklyItemReorder(goalId, movingKey, targetKey = '') {
    const currentGoalKeys = weeklyGoalKeyMap.get(goalId) || []
    if (!currentGoalKeys.includes(movingKey)) return
    if (targetKey && !currentGoalKeys.includes(targetKey)) return

    const nextGoalKeyMap = new Map(weeklyGoalKeyMap)
    nextGoalKeyMap.set(goalId, placeKeyInList(currentGoalKeys, movingKey, targetKey))
    saveWeeklyPresentationOrder(weeklyGoalOrder, nextGoalKeyMap)
  }

  function handleWeeklyGoalReorder(movingGoalId, targetGoalId = '') {
    if (!weeklyGoalOrder.includes(movingGoalId)) return
    if (targetGoalId && !weeklyGoalOrder.includes(targetGoalId)) return

    saveWeeklyPresentationOrder(
      placeKeyInList(weeklyGoalOrder, movingGoalId, targetGoalId),
      weeklyGoalKeyMap,
    )
  }

  function handleWeeklyDragStart(event, payload) {
    if (!payload?.type) return

    setDraggingWeeklyType(payload.type)
    setDraggingWeeklyItemKey(payload.key || '')
    setDraggingWeeklyGoalId(payload.goalId || '')
    event.dataTransfer.setData('text/plain', JSON.stringify(payload))
    event.dataTransfer.effectAllowed = 'move'
  }

  function getActiveWeeklyDragPayload(event) {
    if (draggingWeeklyType === 'item' && draggingWeeklyItemKey) {
      return { type: 'item', key: draggingWeeklyItemKey, goalId: draggingWeeklyGoalId }
    }

    if (draggingWeeklyType === 'goal' && draggingWeeklyGoalId) {
      return { type: 'goal', key: '', goalId: draggingWeeklyGoalId }
    }

    return parseWeeklyDragPayload(event.dataTransfer.getData('text/plain'))
  }

  function handleWeeklyDragEnd() {
    setDraggingWeeklyType('')
    setDraggingWeeklyItemKey('')
    setDraggingWeeklyGoalId('')
    setWeeklyItemDropKey('')
    setWeeklyItemDropGoalId('')
    setWeeklyGoalDropId('')
  }

  function handleWeeklyItemDragOver(event, goalId, targetKey = '') {
    const payload = getActiveWeeklyDragPayload(event)
    if (payload.type !== 'item' || payload.goalId !== goalId) return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    if (weeklyItemDropGoalId !== goalId || weeklyItemDropKey !== targetKey) {
      setWeeklyItemDropGoalId(goalId)
      setWeeklyItemDropKey(targetKey)
    }
    if (weeklyGoalDropId) setWeeklyGoalDropId('')
  }

  function handleWeeklyItemDrop(event, goalId, targetKey = '') {
    const payload = getActiveWeeklyDragPayload(event)
    if (payload.type !== 'item' || payload.goalId !== goalId) return

    event.preventDefault()
    event.stopPropagation()
    handleWeeklyItemReorder(goalId, payload.key, targetKey)
    handleWeeklyDragEnd()
  }

  function handleWeeklyGoalDragOver(event, targetGoalId = '') {
    const payload = getActiveWeeklyDragPayload(event)
    if (payload.type !== 'goal') return

    event.preventDefault()
    event.stopPropagation()
    event.dataTransfer.dropEffect = 'move'
    const nextDropGoalId = targetGoalId || '__weekly-end__'
    if (weeklyGoalDropId !== nextDropGoalId) {
      setWeeklyGoalDropId(nextDropGoalId)
    }
    if (weeklyItemDropGoalId || weeklyItemDropKey) {
      setWeeklyItemDropGoalId('')
      setWeeklyItemDropKey('')
    }
  }

  function handleWeeklyGoalDrop(event, targetGoalId = '') {
    const payload = getActiveWeeklyDragPayload(event)
    if (payload.type !== 'goal') return

    event.preventDefault()
    event.stopPropagation()
    handleWeeklyGoalReorder(payload.goalId, targetGoalId)
    handleWeeklyDragEnd()
  }

  function renderEstimatedHoursField(item, itemKeyPrefix, className = '', chipClassName = '', inputClassName = '') {
    return (
      <InlineEstimatedHoursField
        itemKey={`${itemKeyPrefix}-${item.key}`}
        value={item.subTarget.estimatedHours}
        onCommit={(nextEstimatedHours) => handleEstimatedHoursUpdate(item, nextEstimatedHours)}
        className={className}
        chipClassName={chipClassName}
        inputClassName={inputClassName}
      />
    )
  }

  function renderBuilderDragHandle(item, source, label = '拖拽移动') {
    return (
      <span
        className="weekly-builder-drag-handle"
        draggable
        role="button"
        tabIndex={0}
        aria-label={`${label}：${item.subTarget.content || '未填写内容'}`}
        onDragStart={(event) => handleBuilderItemDragStart(event, item.key, source)}
        onDragEnd={handleBuilderItemDragEnd}
      >
        {label}
      </span>
    )
  }

  function renderWeeklyItemDragHandle(item) {
    return (
      <span
        className="weekly-drag-hint"
        draggable
        role="button"
        tabIndex={0}
        aria-label={`拖拽子目标：${item.subTarget.content || '未填写内容'}`}
        onDragStart={(event) => handleWeeklyDragStart(event, { type: 'item', key: item.key, goalId: item.goalId })}
        onDragEnd={handleWeeklyDragEnd}
      >
        拖拽子目标
      </span>
    )
  }

  function renderWeeklyGoalDragHandle(group) {
    return (
      <span
        className="weekly-drag-hint weekly-goal-drag-handle"
        draggable
        role="button"
        tabIndex={0}
        aria-label={`拖拽目标：${group.goalTitle}`}
        onDragStart={(event) => handleWeeklyDragStart(event, { type: 'goal', key: '', goalId: group.goalId })}
        onDragEnd={handleWeeklyDragEnd}
      >
        拖拽目标组
      </span>
    )
  }

  function renderInteractiveWeeklyGroups(groups, emptyLabel) {
    if (!groups.length) {
      return <div className="weekly-version-empty">{emptyLabel}</div>
    }

    return (
      <div className="weekly-version-group-list">
        {groups.map((group) => (
          <div className={`weekly-goal-group weekly-version-goal-group ${draggingWeeklyType === 'goal' && draggingWeeklyGoalId === group.goalId ? 'is-dragging' : ''}`} key={group.goalId}>
            <div
              className={`weekly-goal-group-drop-anchor ${weeklyGoalDropId === group.goalId ? 'is-drop-target' : ''}`}
              onDragOver={(event) => handleWeeklyGoalDragOver(event, group.goalId)}
              onDrop={(event) => handleWeeklyGoalDrop(event, group.goalId)}
            />
            <div className="weekly-goal-group-header">
              <div>
                <div className="weekly-version-goal-title">{group.goalTitle}</div>
                <div className="weekly-goal-group-summary">
                  本行动 {group.items.length} 个子目标，已完成 {group.items.filter((item) => item.subTarget.status === 'done').length} 个
                </div>
              </div>
              <div className="weekly-goal-group-actions">{renderWeeklyGoalDragHandle(group)}</div>
            </div>
            <div className="weekly-item-list">
              {group.items.map((item) => {
                const isEditing = editingItemKey === item.key
                return (
                  <div className={`weekly-item weekly-item-${item.subTarget.status || 'want'} ${draggingWeeklyType === 'item' && draggingWeeklyItemKey === item.key ? 'is-dragging' : ''}`} key={item.key}>
                    <div
                      className={`weekly-item-drop-anchor ${weeklyItemDropGoalId === group.goalId && weeklyItemDropKey === item.key ? 'is-drop-target' : ''}`}
                      onDragOver={(event) => handleWeeklyItemDragOver(event, group.goalId, item.key)}
                      onDrop={(event) => handleWeeklyItemDrop(event, group.goalId, item.key)}
                    />
                    <div className="weekly-item-top">
                      <div>
                        <div className="weekly-item-meta">计划日期：{formatSubTargetSchedule(item.subTarget)}</div>
                        <div className="weekly-item-chip-row">
                          {weeklyConservativeKeySet.has(item.key) ? <span className="weekly-plan-badge weekly-plan-badge-conservative">保守版</span> : null}
                          {weeklyAmbitiousKeySet.has(item.key) ? <span className="weekly-plan-badge weekly-plan-badge-ambitious">进取版</span> : null}
                          {renderEstimatedHoursField(
                            item,
                            'weekly-version-list',
                            'weekly-plan-badge-estimate-wrap',
                            'weekly-plan-badge weekly-plan-badge-estimate weekly-estimate-badge-chip',
                            'weekly-estimate-badge-input',
                          )}
                        </div>
                        {!isEditing ? <div className="weekly-item-content">{item.subTarget.content || '未填写内容'}</div> : null}
                      </div>
                      <div className="weekly-item-actions">
                        {renderWeeklyItemDragHandle(item)}
                        <button className="small-btn ghost" type="button" onClick={() => handleStartEdit(item)}>编辑</button>
                        <button
                          className={`small-btn ${pendingRemovalKey === item.key ? 'active' : 'ghost'}`}
                          type="button"
                          onClick={() => handleRemoveWeeklyItem(item)}
                        >
                          {pendingRemovalKey === item.key ? '确认移出' : '移出该周'}
                        </button>
                      </div>
                    </div>

                    <div className="weekly-status-row">
                      {SUB_TARGET_STATUS_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`weekly-status-pill weekly-status-pill-${option.value} ${item.subTarget.status === option.value ? 'active' : ''}`}
                          onClick={() => handleWeeklyStatusChange(item, option.value)}
                        >
                          <span className="weekly-status-pill-label">{option.label}</span>
                          <span className="weekly-status-pill-hint">{option.hint}</span>
                        </button>
                      ))}
                    </div>

                    {isEditing ? (
                      <div className="weekly-edit-panel">
                        <div className="weekly-edit-grid">
                          <div>
                            <label htmlFor={`weekly-edit-start-${item.key}`}>开始日期</label>
                            <input
                              id={`weekly-edit-start-${item.key}`}
                              type="date"
                              value={editingDraft.startDate}
                              onChange={(e) => setEditingDraft((draft) => ({ ...draft, startDate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label htmlFor={`weekly-edit-end-${item.key}`}>结束日期</label>
                            <input
                              id={`weekly-edit-end-${item.key}`}
                              type="date"
                              value={editingDraft.endDate}
                              onChange={(e) => setEditingDraft((draft) => ({ ...draft, endDate: e.target.value }))}
                            />
                          </div>
                          <div>
                            <label htmlFor={`weekly-edit-estimated-hours-${item.key}`}>预估时长（小时，可留空）</label>
                            <input
                              id={`weekly-edit-estimated-hours-${item.key}`}
                              type="number"
                              min="0"
                              step="0.5"
                              inputMode="decimal"
                              placeholder="例如 2 或 3.5"
                              value={editingDraft.estimatedHours}
                              onChange={(e) => setEditingDraft((draft) => ({ ...draft, estimatedHours: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor={`weekly-edit-content-${item.key}`}>子目标内容</label>
                          <textarea
                            id={`weekly-edit-content-${item.key}`}
                            value={editingDraft.content}
                            onChange={(e) => setEditingDraft((draft) => ({ ...draft, content: e.target.value }))}
                          />
                        </div>
                        <div className="weekly-edit-actions">
                          <button className="small-btn ghost" type="button" onClick={handleCancelEdit}>取消</button>
                          <button className="btn-primary" type="button" onClick={() => handleSaveWeeklyItem(item)}>保存</button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )
              })}
              <div
                className={`weekly-item-list-end-dropzone ${weeklyItemDropGoalId === group.goalId && weeklyItemDropKey === '' ? 'is-drop-target' : ''}`}
                onDragOver={(event) => handleWeeklyItemDragOver(event, group.goalId)}
                onDrop={(event) => handleWeeklyItemDrop(event, group.goalId)}
              >
                在本目标末尾放下子目标
              </div>
            </div>
          </div>
        ))}
        <div
          className={`weekly-goal-groups-end-dropzone ${weeklyGoalDropId === '__weekly-end__' ? 'is-drop-target' : ''}`}
          onDragOver={(event) => handleWeeklyGoalDragOver(event)}
          onDrop={(event) => handleWeeklyGoalDrop(event)}
        >
          在末尾放下目标组
        </div>
      </div>
    )
  }

  function renderVersionCard(title, groups, targetHours, totalHours, toneClass) {
    return (
      <div className={`weekly-version-card ${toneClass}`}>
        <div className="weekly-version-card-header">
          <div>
            <div className="weekly-version-card-title">{title}</div>
            <div className="weekly-version-card-meta">目标 {formatHoursValue(targetHours)} 小时 · 当前 {formatHoursValue(totalHours)} 小时</div>
          </div>
          <div className="weekly-version-card-count">{groups.reduce((sum, group) => sum + group.items.length, 0)} 项</div>
        </div>

        {renderInteractiveWeeklyGroups(
          groups,
          showOnlyActiveWeeklyItems ? '当前筛选下没有可显示的子目标。' : '当前版本还没有挑选子目标。',
        )}
      </div>
    )
  }

  return (
    <div className="page daily-planner-page">
      <div className="page-shell planner-shell">
        <div className="page-header">
          <div>
            <h2 className="page-title">周规划 / 日规划</h2>
            <div className="page-subtitle">先确定所选周最稳妥的推进，再承接到今天的具体行动。</div>
          </div>
        </div>

        <div className="planner-sections">
          <section className="planner-card weekly-planner-card">
            <div className="weekly-planner-top">
              <div>
                <div className="planner-card-title">周计划</div>
                <div className="weekly-planner-weeknav-row">
                  <button className="small-btn ghost weekly-week-nav-btn" type="button" onClick={() => setActiveWeekOffset((current) => current - 1)} aria-label="查看上一周">←</button>
                  <div className="weekly-planner-weekline">Week {activeWeekMeta.weekNumber}: {formatDisplayDate(activeWeekMeta.startDate)} 到 {formatDisplayDate(activeWeekMeta.endDate)}</div>
                  <button className="small-btn ghost weekly-week-nav-btn" type="button" onClick={() => setActiveWeekOffset((current) => current + 1)} aria-label="查看下一周">→</button>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>{isViewingCurrentWeek ? '当前正在查看本周计划。' : '当前正在查看其他周的计划。'} 这一周属于 {activeWeekMeta.isoYear} 年的第 {activeWeekMeta.weekNumber} 周。</div>
              </div>
              <div className="weekly-planner-top-actions">
                {!isViewingCurrentWeek ? <button className="small-btn ghost" type="button" onClick={() => setActiveWeekOffset(0)}>回到本周</button> : null}
                {weeklyPlan ? <button className="small-btn ghost" type="button" onClick={openBuilder}>调整周计划</button> : null}
              </div>
            </div>

            {!weeklyPlan ? (
              <div className="weekly-empty-state">
                <div>
                  <div className="weekly-empty-title">这一周还没有建立保守版 / 进取版周计划</div>
                  <div className="muted">先头脑风暴补齐子目标，再分别挑出这一周稳妥能做和想冲一冲的两套安排。</div>
                </div>
                <button className="btn-primary" type="button" onClick={openBuilder}>制定这一周的计划</button>
              </div>
            ) : (
              <>
                <div className="weekly-stats-row">
                  <div className="weekly-stat-chip weekly-stat-chip-conservative">保守版 {weeklyStats.conservativeCount} 项 · {formatHoursValue(weeklyStats.conservativeHours)}/{formatHoursValue(weeklyPlan.conservativeHoursTarget)} 小时</div>
                  <div className="weekly-stat-chip weekly-stat-chip-ambitious">进取版 {weeklyStats.ambitiousCount} 项 · {formatHoursValue(weeklyStats.ambitiousHours)}/{formatHoursValue(weeklyPlan.ambitiousHoursTarget)} 小时</div>
                  <div className="weekly-stat-chip">共 {weeklyStats.total} 个该周子目标</div>
                  <div className="weekly-stat-chip weekly-stat-chip-done">做完了 {weeklyStats.done}</div>
                  <div className="weekly-stat-chip">想要做 {weeklyStats.want}</div>
                  <div className="weekly-stat-chip">正在做 {weeklyStats.doing}</div>
                  {weeklyStats.unknownEstimates ? <div className="weekly-stat-chip">待估时 {weeklyStats.unknownEstimates}</div> : null}
                  <button
                    className={`small-btn ${showOnlyActiveWeeklyItems ? 'active' : 'ghost'}`}
                    type="button"
                    onClick={() => setShowOnlyActiveWeeklyItems((current) => !current)}
                  >
                    {showOnlyActiveWeeklyItems ? '显示全部' : '只看未完成'}
                  </button>
                </div>

                <div className="weekly-version-grid">
                  {renderVersionCard(
                    '保守版周计划',
                    groupedVisibleWeeklyConservativeItems,
                    weeklyPlan.conservativeHoursTarget,
                    weeklyStats.conservativeHours,
                    'weekly-version-card-conservative',
                  )}
                  {renderVersionCard(
                    '进取版周计划',
                    groupedVisibleWeeklyAmbitiousItems,
                    weeklyPlan.ambitiousHoursTarget,
                    weeklyStats.ambitiousHours,
                    'weekly-version-card-ambitious',
                  )}
                </div>
              </>
            )}
          </section>

          <section className="planner-card daily-planner-section">
            <div className="planner-card-title">日计划</div>
            <div className="planner-grid">
              <div className="planner-card planner-card-plan planner-card-inner">
                <div className="planner-card-title">今日计划</div>
                <label className="muted">为今天写下计划：</label>
                <textarea
                  className="large-textarea"
                  placeholder="写下今天的主要目标与行动"
                  value={planText}
                  onChange={(e) => setPlanText(e.target.value)}
                  onBlur={() => setDailyPlan(todayStr, planText)}
                />
                <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>提示：这里会自动保存到本机（localStorage），按日期分别保存。</div>
              </div>

              <div className="planner-card planner-card-settings planner-card-inner">
                <div className="planner-card-title">行动时长设置</div>
                <div className="planner-form-grid">
                  <div>
                    <label>保守行动时长（分钟）</label>
                    <input type="number" min="1" value={conservative} onChange={(e) => setConservative(e.target.value)} />
                  </div>
                  <div>
                    <label>进取行动时长（分钟）</label>
                    <input type="number" min="1" value={ambitious} onChange={(e) => setAmbitious(e.target.value)} />
                  </div>
                </div>

                <div className="muted" style={{ marginTop: 10 }}>
                  当前生效：保守 {reminders.conservativeMinutes} 分钟 / 进取 {reminders.ambitiousMinutes} 分钟
                </div>

                <div style={{ marginTop: 12, display: 'flex', justifyContent: 'flex-end' }}>
                  <button className="btn-primary" disabled={saving} onClick={handleSave}>{saving ? '保存中…' : '保存设置'}</button>
                </div>
              </div>

              <div className="planner-card planner-card-tips planner-card-inner">
                <div className="planner-card-title">今日提示</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  <li>保守阈值：达成后可以自由选择休息或继续。</li>
                  <li>进取阈值：超过后建议注意疲劳与情绪波动。</li>
                  <li>行动面板与回顾在“行动”页进行。</li>
                </ul>
              </div>
            </div>
          </section>
        </div>

        {builderOpen ? createPortal(
          <div className="modal-overlay" onClick={closeBuilder}>
            <div className="modal-content weekly-builder-modal" onClick={(event) => event.stopPropagation()}>
              <div className="modal-header">
                <div>
                  <div className="modal-title">制定 {activeWeekMeta.isoYear} 年第 {activeWeekMeta.weekNumber} 周保守版 / 进取版周计划</div>
                  <div className="muted">{formatDisplayDate(activeWeekMeta.startDate)} 到 {formatDisplayDate(activeWeekMeta.endDate)}，按照“头脑风暴 → 确定时长 → 三栏挑选”的顺序完成这一周安排。</div>
                </div>
                <button className="small-btn ghost" type="button" onClick={closeBuilder}>关闭</button>
              </div>

              <div className="weekly-wizard-step-row" role="list" aria-label="周计划步骤">
                {[
                  { key: 1, label: 'Step 1 头脑风暴' },
                  { key: 2, label: 'Step 2 时长目标' },
                  { key: 3, label: 'Step 3 三栏挑选' },
                ].map((step) => (
                  <div
                    key={step.key}
                    role="listitem"
                    className={`weekly-wizard-step-pill ${builderStep === step.key ? 'is-active' : ''} ${builderStep > step.key ? 'is-complete' : ''}`}
                  >
                    {step.label}
                  </div>
                ))}
              </div>

              {builderStep === 1 ? (
                <div className="weekly-wizard-panel">
                  <div className="weekly-wizard-title">先做一轮头脑风暴，把各个目标的子目标尽量补齐。</div>
                  <div className="weekly-wizard-text">这一步不替你自动判断是否“足够完整”，但会先把当前拆解情况展示出来。你确认之后，下一步才会继续推进。</div>
                  <div className="weekly-wizard-stats-grid">
                    <div className="weekly-wizard-stat-card">
                      <div className="weekly-wizard-stat-value">{totalSubTargetCount}</div>
                      <div className="weekly-wizard-stat-label">当前子目标数</div>
                    </div>
                    <div className="weekly-wizard-stat-card">
                      <div className="weekly-wizard-stat-value">{subTargetsMissingEstimateCount}</div>
                      <div className="weekly-wizard-stat-label">未填写预估时长</div>
                    </div>
                    <div className="weekly-wizard-stat-card">
                      <div className="weekly-wizard-stat-value">{goalsWithoutSubTargets.length}</div>
                      <div className="weekly-wizard-stat-label">还没拆子目标的目标</div>
                    </div>
                  </div>

                  {goalsWithoutSubTargets.length ? (
                    <div className="weekly-wizard-warning">
                      这些目标还没有子目标：{goalsWithoutSubTargets.map((goal) => goal.title || '未命名目标').join('、')}
                    </div>
                  ) : null}

                  {subTargetsMissingEstimateCount ? (
                    <div className="weekly-wizard-note">
                      还有 {subTargetsMissingEstimateCount} 个子目标没有填写预估时长。进入三栏后，这些条目会先按 0 小时参与汇总，并显示为 “?”。
                    </div>
                  ) : null}

                  <div className="weekly-builder-footer">
                    <button className="small-btn ghost" type="button" onClick={closeBuilder}>取消</button>
                    <button className="btn-primary" type="button" onClick={handleContinueAfterBrainstorm}>我已完成这一步，继续</button>
                  </div>
                </div>
              ) : null}

              {builderStep === 2 ? (
                <div className="weekly-wizard-panel">
                  <div className="weekly-wizard-title">确定这一周两套计划的目标时长。</div>
                  <div className="weekly-wizard-text">默认值分别是保守版 12 小时、进取版 24 小时。这里的单位是小时，不是分钟。</div>
                  <div className="weekly-wizard-duration-grid">
                    <div className="weekly-wizard-duration-card">
                      <label htmlFor="weekly-conservative-hours">保守版周计划时长（小时）</label>
                      <input
                        id="weekly-conservative-hours"
                        type="number"
                        min="1"
                        step="0.5"
                        inputMode="decimal"
                        value={conservativeHoursTargetDraft}
                        onChange={(event) => setConservativeHoursTargetDraft(event.target.value)}
                      />
                      <div className="muted">建议填这周最稳妥能完成的工作量。</div>
                    </div>
                    <div className="weekly-wizard-duration-card">
                      <label htmlFor="weekly-ambitious-hours">进取版周计划时长（小时）</label>
                      <input
                        id="weekly-ambitious-hours"
                        type="number"
                        min="1"
                        step="0.5"
                        inputMode="decimal"
                        value={ambitiousHoursTargetDraft}
                        onChange={(event) => setAmbitiousHoursTargetDraft(event.target.value)}
                      />
                      <div className="muted">建议填状态好时想冲一冲的上限。</div>
                    </div>
                  </div>

                  <div className="weekly-builder-footer">
                    <button className="small-btn ghost" type="button" onClick={() => setBuilderStep(1)}>上一步</button>
                    <button className="btn-primary" type="button" onClick={handleContinueToSelection}>下一步：挑选子目标</button>
                  </div>
                </div>
              ) : null}

              {builderStep === 3 ? (
                <>
                  <div className="weekly-builder-intro muted">三列分别代表“未纳入目标 / 保守版 / 进取版”。三个栏之间都可以直接拖动，左右两列互斥，不会重复出现同一个子目标。</div>

                  <div className="weekly-builder-grid weekly-builder-grid-triplet">
                    <div
                      className={`weekly-builder-column ${dropTargetColumn === 'pool' && !dropTargetKey ? 'is-column-drop-target' : ''}`}
                      onDragOver={(event) => handleBuilderDragOver(event, 'pool')}
                      onDragLeave={() => handleBuilderDragLeave('pool')}
                      onDrop={(event) => handleBuilderDrop(event, 'pool')}
                    >
                      <div className="weekly-builder-column-header">
                        <div>
                          <div className="weekly-builder-column-title">未纳入目标</div>
                          <div className="weekly-builder-column-summary">当前还未放入任何版本</div>
                        </div>
                        <div className="weekly-builder-summary-badge">{unplannedSubTargetCount} 项</div>
                      </div>

                      {unplannedGoalGroups.length ? unplannedGoalGroups.map((group) => (
                        <div className="weekly-builder-goal-group" key={group.goalId}>
                          <div className="weekly-builder-goal-title">{group.goalTitle}</div>
                          <div className="weekly-builder-candidate-list">
                            {group.items.map((item) => {
                              return (
                                <div
                                  key={item.key}
                                  className="weekly-builder-item"
                                >
                                  <div className="weekly-builder-item-main">
                                    <div className="weekly-builder-item-content">{item.subTarget.content || '未填写内容'}</div>
                                    <div className="weekly-builder-item-meta-row">
                                      <div className="weekly-builder-item-meta">{formatSubTargetSchedule(item.subTarget)}</div>
                                      {renderEstimatedHoursField(
                                        item,
                                        'builder-pool',
                                        'weekly-builder-estimate-wrap',
                                        'weekly-builder-estimate-chip',
                                        'weekly-builder-estimate-input',
                                      )}
                                    </div>
                                    <div className="weekly-builder-membership-row">
                                      <span className="weekly-builder-membership-chip">{getStatusLabel(item.subTarget.status)}</span>
                                    </div>
                                  </div>
                                  <div className="weekly-builder-item-actions">
                                    {renderBuilderDragHandle(item, 'pool')}
                                    <button className="small-btn ghost" type="button" onClick={() => addBuilderItemToConservative(item.key)}>加入保守版</button>
                                    <button className="small-btn ghost" type="button" onClick={() => addBuilderItemToAmbitious(item.key)}>加入进取版</button>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )) : <div className="weekly-builder-empty">当前没有未纳入的子目标。把右侧的条目拖回来，也可以快速重新分配。</div>}
                    </div>

                    <div
                      className={`weekly-builder-column weekly-builder-selected ${dropTargetColumn === 'conservative' && !dropTargetKey ? 'is-column-drop-target' : ''}`}
                      onDragOver={(event) => handleBuilderDragOver(event, 'conservative')}
                      onDragLeave={() => handleBuilderDragLeave('conservative')}
                      onDrop={(event) => handleBuilderDrop(event, 'conservative')}
                    >
                      <div className="weekly-builder-column-header">
                        <div>
                          <div className="weekly-builder-column-title">保守版子目标</div>
                          <div className="weekly-builder-column-summary">{selectedConservativeItems.length} 项 · 当前 {formatHoursValue(sumEstimatedHours(selectedConservativeItems))}/{Number.isNaN(conservativeHoursTarget) ? '?' : formatHoursValue(conservativeHoursTarget)} 小时</div>
                        </div>
                        {countUnknownEstimatedHours(selectedConservativeItems) ? <div className="weekly-builder-summary-badge">待估时 {countUnknownEstimatedHours(selectedConservativeItems)}</div> : null}
                      </div>

                      {groupedSelectedConservativeItems.length ? (
                        <div className="weekly-builder-selected-list">
                          {groupedSelectedConservativeItems.map((group) => (
                            <div className="weekly-builder-selected-group" key={group.goalId}>
                              <div className="weekly-builder-selected-group-header">
                                <div className="weekly-builder-goal-title">{group.goalTitle}</div>
                                <div className="weekly-builder-selected-summary">已选 {group.items.length} 项</div>
                              </div>
                              <div className="weekly-builder-selected-group-list">
                                {group.items.map((item) => (
                                  <div
                                    className={`weekly-builder-selected-item ${draggingBuilderKey === item.key && draggingBuilderSource === 'conservative' ? 'is-dragging' : ''} ${dropTargetColumn === 'conservative' && dropTargetKey === item.key ? 'is-drop-target' : ''}`}
                                    key={item.key}
                                    onDragOver={(event) => handleBuilderDragOver(event, 'conservative', item.key)}
                                    onDragLeave={() => handleBuilderDragLeave('conservative', item.key)}
                                    onDrop={(event) => handleBuilderDrop(event, 'conservative', item.key)}
                                  >
                                    <div className="weekly-builder-item-main">
                                      <div className="weekly-builder-item-content">{item.subTarget.content || '未填写内容'}</div>
                                      <div className="weekly-builder-item-meta-row">
                                        <div className="weekly-builder-item-meta">{formatSubTargetSchedule(item.subTarget)}</div>
                                        {renderEstimatedHoursField(
                                          item,
                                          'builder-conservative',
                                          'weekly-builder-estimate-wrap',
                                          'weekly-builder-estimate-chip',
                                          'weekly-builder-estimate-input',
                                        )}
                                      </div>
                                    </div>
                                    <div className="weekly-builder-selected-actions">
                                      {renderBuilderDragHandle(item, 'conservative', '拖拽排序')}
                                      <button className="small-btn ghost" type="button" onClick={() => removeConservativeBuilderItem(item.key)}>移回未纳入</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="weekly-builder-dropzone">把左侧子目标拖到这里，形成这一周最稳妥的保守版周计划。</div>
                      )}
                    </div>

                    <div
                      className={`weekly-builder-column weekly-builder-selected weekly-builder-selected-ambitious ${dropTargetColumn === 'ambitious' && !dropTargetKey ? 'is-column-drop-target' : ''}`}
                      onDragOver={(event) => handleBuilderDragOver(event, 'ambitious')}
                      onDragLeave={() => handleBuilderDragLeave('ambitious')}
                      onDrop={(event) => handleBuilderDrop(event, 'ambitious')}
                    >
                      <div className="weekly-builder-column-header">
                        <div>
                          <div className="weekly-builder-column-title">进取版子目标</div>
                          <div className="weekly-builder-column-summary">{selectedAmbitiousItems.length} 项 · 当前 {formatHoursValue(sumEstimatedHours(selectedAmbitiousItems))}/{Number.isNaN(ambitiousHoursTarget) ? '?' : formatHoursValue(ambitiousHoursTarget)} 小时</div>
                        </div>
                        {countUnknownEstimatedHours(selectedAmbitiousItems) ? <div className="weekly-builder-summary-badge">待估时 {countUnknownEstimatedHours(selectedAmbitiousItems)}</div> : null}
                      </div>

                      {groupedSelectedAmbitiousItems.length ? (
                        <div className="weekly-builder-selected-list">
                          {groupedSelectedAmbitiousItems.map((group) => (
                            <div className="weekly-builder-selected-group" key={group.goalId}>
                              <div className="weekly-builder-selected-group-header">
                                <div className="weekly-builder-goal-title">{group.goalTitle}</div>
                                <div className="weekly-builder-selected-summary">已选 {group.items.length} 项</div>
                              </div>
                              <div className="weekly-builder-selected-group-list">
                                {group.items.map((item) => (
                                  <div
                                    className={`weekly-builder-selected-item ${draggingBuilderKey === item.key && draggingBuilderSource === 'ambitious' ? 'is-dragging' : ''} ${dropTargetColumn === 'ambitious' && dropTargetKey === item.key ? 'is-drop-target' : ''}`}
                                    key={item.key}
                                    onDragOver={(event) => handleBuilderDragOver(event, 'ambitious', item.key)}
                                    onDragLeave={() => handleBuilderDragLeave('ambitious', item.key)}
                                    onDrop={(event) => handleBuilderDrop(event, 'ambitious', item.key)}
                                  >
                                    <div className="weekly-builder-item-main">
                                      <div className="weekly-builder-item-content">{item.subTarget.content || '未填写内容'}</div>
                                      <div className="weekly-builder-item-meta-row">
                                        <div className="weekly-builder-item-meta">{formatSubTargetSchedule(item.subTarget)}</div>
                                        {renderEstimatedHoursField(
                                          item,
                                          'builder-ambitious',
                                          'weekly-builder-estimate-wrap',
                                          'weekly-builder-estimate-chip',
                                          'weekly-builder-estimate-input',
                                        )}
                                      </div>
                                    </div>
                                    <div className="weekly-builder-selected-actions">
                                      {renderBuilderDragHandle(item, 'ambitious', '拖拽排序')}
                                      <button className="small-btn ghost" type="button" onClick={() => removeAmbitiousBuilderItem(item.key)}>移回未纳入</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="weekly-builder-dropzone">把左侧子目标拖到这里，形成这一周想冲一冲的进取版周计划。</div>
                      )}
                    </div>
                  </div>

                  <div className="weekly-builder-footer">
                    <button className="small-btn ghost" type="button" onClick={() => setBuilderStep(2)}>上一步</button>
                    <button className="btn-primary" type="button" onClick={handleConfirmWeeklyPlan}>确认周计划</button>
                  </div>
                </>
              ) : null}
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    </div>
  )
}
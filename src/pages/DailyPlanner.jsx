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

function getCurrentWeekMeta() {
  const today = new Date()
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate())
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

function overlapsCurrentWeek(subTarget, weekMeta) {
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

function isCurrentWeekAssigned(subTarget, weekMeta) {
  return subTarget?.startDate === weekMeta.startDate && subTarget?.endDate === weekMeta.endDate
}

export default function DailyPlanner() {
  const reminders = useHealthReminders()
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const weekMeta = useMemo(() => getCurrentWeekMeta(), [])
  const [planText, setPlanText] = useState('')
  const [conservative, setConservative] = useState(60)
  const [ambitious, setAmbitious] = useState(180)
  const [saving, setSaving] = useState(false)
  const [goals, setGoals] = useState([])
  const [weeklyPlan, setWeeklyPlanState] = useState(null)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [selectedRefKeys, setSelectedRefKeys] = useState([])
  const [draggingPlanKey, setDraggingPlanKey] = useState('')
  const [dropTargetKey, setDropTargetKey] = useState('')
  const [editingItemKey, setEditingItemKey] = useState('')
  const [editingDraft, setEditingDraft] = useState({ startDate: '', endDate: '', content: '' })
  const [pendingRemovalKey, setPendingRemovalKey] = useState('')
  const [showOnlyActiveWeeklyItems, setShowOnlyActiveWeeklyItems] = useState(false)
  const planHydratedRef = useRef(false)

  function reloadWeeklyData() {
    setGoals(listGoals())
    setWeeklyPlanState(getWeeklyPlan(weekMeta.weekKey))
  }

  useEffect(() => {
    const s = getSettings()
    setConservative(s.conservativeMinutes ?? 60)
    setAmbitious(s.ambitiousMinutes ?? 180)
    reloadWeeklyData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    setPlanText(getDailyPlan(todayStr))
    planHydratedRef.current = true
  }, [todayStr])

  useEffect(() => {
    if (!planHydratedRef.current) return
    const t = setTimeout(() => {
      setDailyPlan(todayStr, planText)
    }, 400)
    return () => clearTimeout(t)
  }, [planText, todayStr])

  useEffect(() => {
    if (!builderOpen) return undefined
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
    }
  }, [builderOpen])

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

  const availableGoalGroups = useMemo(() => goals
    .map((goal) => ({
      goalId: goal.id,
      goalTitle: goal.title,
      items: (goal.subTargets || [])
        .filter((subTarget) => subTarget.status === 'want')
        .map((subTarget) => ({
          goalId: goal.id,
          goalTitle: goal.title,
          subTargetId: subTarget.id,
          key: toRefKey(goal.id, subTarget.id),
          subTarget,
        })),
    }))
    .filter((group) => group.items.length), [goals])

  const weeklyItems = useMemo(() => {
    if (!weeklyPlan?.subTargetRefs?.length) return []
    return weeklyPlan.subTargetRefs
      .map((ref) => indexedItems.get(toRefKey(ref.goalId, ref.subTargetId)))
      .filter(Boolean)
  }, [indexedItems, weeklyPlan])

  const selectedBuilderItems = useMemo(() => selectedRefKeys
    .map((key) => indexedItems.get(key))
    .filter(Boolean), [indexedItems, selectedRefKeys])

  const groupedSelectedBuilderItems = useMemo(() => groupWeeklyItems(selectedBuilderItems), [selectedBuilderItems])

  const weeklyStats = useMemo(() => ({
    total: weeklyItems.length,
    want: weeklyItems.filter((item) => item.subTarget.status === 'want').length,
    doing: weeklyItems.filter((item) => item.subTarget.status === 'doing').length,
    done: weeklyItems.filter((item) => item.subTarget.status === 'done').length,
  }), [weeklyItems])

  function handleSave() {
    const c = Number(conservative)
    const a = Number(ambitious)
    if (!Number.isFinite(c) || c <= 0) return window.alert('请填写正确的保守行动时长（分钟）')
    if (!Number.isFinite(a) || a <= 0) return window.alert('请填写正确的进取行动时长（分钟）')
    if (a < c) return window.alert('进取行动时长建议大于等于保守行动时长')
    setSaving(true)
    updateSettings({ conservativeMinutes: c, ambitiousMinutes: a })
    setSaving(false)
    window.alert('已保存到日规划')
  }

  function openBuilder() {
    const autoSelected = goals.flatMap((goal) => (goal.subTargets || [])
      .filter((subTarget) => overlapsCurrentWeek(subTarget, weekMeta))
      .map((subTarget) => toRefKey(goal.id, subTarget.id)))
    const existing = (weeklyPlan?.subTargetRefs || []).map((ref) => toRefKey(ref.goalId, ref.subTargetId))
    setSelectedRefKeys(Array.from(new Set([...existing, ...autoSelected])))
    setBuilderOpen(true)
  }

  function closeBuilder() {
    setBuilderOpen(false)
    setSelectedRefKeys([])
    setDraggingPlanKey('')
    setDropTargetKey('')
  }

  function addBuilderItem(key) {
    setSelectedRefKeys((current) => (current.includes(key) ? current : [...current, key]))
  }

  function removeBuilderItem(key) {
    setSelectedRefKeys((current) => current.filter((item) => item !== key))
    if (draggingPlanKey === key) setDraggingPlanKey('')
    if (dropTargetKey === key) setDropTargetKey('')
  }

  function moveSelectedBuilderItem(fromKey, toKey) {
    if (!fromKey || !toKey || fromKey === toKey) return
    setSelectedRefKeys((current) => {
      const fromIndex = current.indexOf(fromKey)
      const toIndex = current.indexOf(toKey)
      if (fromIndex === -1 || toIndex === -1) return current

      const next = [...current]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  function reorderWeeklyPlanRefs(fromKey, toKey) {
    if (!weeklyPlan?.subTargetRefs?.length || !fromKey || !toKey || fromKey === toKey) return

    const currentKeys = weeklyPlan.subTargetRefs.map((ref) => toRefKey(ref.goalId, ref.subTargetId))
    const fromIndex = currentKeys.indexOf(fromKey)
    const toIndex = currentKeys.indexOf(toKey)
    if (fromIndex === -1 || toIndex === -1) return

    const nextRefs = [...weeklyPlan.subTargetRefs]
    const [movedRef] = nextRefs.splice(fromIndex, 1)
    nextRefs.splice(toIndex, 0, movedRef)

    const updatedPlan = setWeeklyPlan(weekMeta.weekKey, {
      startDate: weeklyPlan.startDate || weekMeta.startDate,
      endDate: weeklyPlan.endDate || weekMeta.endDate,
      subTargetRefs: nextRefs,
      confirmedAt: weeklyPlan.confirmedAt || new Date().toISOString(),
    })

    setWeeklyPlanState(updatedPlan)
    reloadWeeklyData()
  }

  function handlePlanItemDragStart(event, key) {
    setDraggingPlanKey(key)
    event.dataTransfer.setData('text/plain', key)
    event.dataTransfer.effectAllowed = 'move'
  }

  function handlePlanItemDragEnd() {
    setDraggingPlanKey('')
    setDropTargetKey('')
  }

  function handlePlanItemDragOver(event, targetKey, { selectedOnly = false } = {}) {
    if (!draggingPlanKey) return
    if (selectedOnly && !selectedRefKeys.includes(draggingPlanKey)) return
    event.preventDefault()
    if (dropTargetKey !== targetKey) setDropTargetKey(targetKey)
  }

  function handlePlanItemDragLeave(targetKey) {
    if (dropTargetKey === targetKey) setDropTargetKey('')
  }

  function handleBuilderDrop(event) {
    event.preventDefault()
    const key = event.dataTransfer.getData('text/plain')
    if (key) addBuilderItem(key)
  }

  function handleSelectedItemDrop(event, targetKey) {
    event.preventDefault()
    const sourceKey = event.dataTransfer.getData('text/plain')
    if (!selectedRefKeys.includes(sourceKey)) return
    moveSelectedBuilderItem(sourceKey, targetKey)
    setDraggingPlanKey('')
    setDropTargetKey('')
  }

  function handleWeeklyPreviewItemDrop(event, targetKey) {
    event.preventDefault()
    const sourceKey = event.dataTransfer.getData('text/plain')
    reorderWeeklyPlanRefs(sourceKey, targetKey)
    setDraggingPlanKey('')
    setDropTargetKey('')
  }

  function handleConfirmWeeklyPlan() {
    if (!selectedBuilderItems.length) return window.alert('请先为本周挑选至少一个子目标')

    const nextRefKeys = new Set(selectedBuilderItems.map((item) => item.key))
    const previousItems = (weeklyPlan?.subTargetRefs || [])
      .map((ref) => indexedItems.get(toRefKey(ref.goalId, ref.subTargetId)))
      .filter(Boolean)

    previousItems.forEach((item) => {
      if (nextRefKeys.has(item.key)) return
      if (item.subTarget.status === 'doing') {
        updateSubTarget(item.goalId, item.subTargetId, {
          status: 'want',
          startDate: isCurrentWeekAssigned(item.subTarget, weekMeta) ? '' : item.subTarget.startDate,
          endDate: isCurrentWeekAssigned(item.subTarget, weekMeta) ? '' : item.subTarget.endDate,
        })
      }
    })

    selectedBuilderItems.forEach((item) => {
      updateSubTarget(item.goalId, item.subTargetId, {
        status: item.subTarget.status === 'done' ? 'done' : 'doing',
        startDate: weekMeta.startDate,
        endDate: weekMeta.endDate,
      })
    })

    const savedPlan = setWeeklyPlan(weekMeta.weekKey, {
      startDate: weekMeta.startDate,
      endDate: weekMeta.endDate,
      subTargetRefs: selectedBuilderItems.map((item) => ({ goalId: item.goalId, subTargetId: item.subTargetId })),
      confirmedAt: new Date().toISOString(),
    })

    setWeeklyPlanState(savedPlan)
    closeBuilder()
    reloadWeeklyData()
    window.alert('本周保守版周规划已建立')
  }

  function handleRemoveWeeklyItem(item) {
    if (pendingRemovalKey !== item.key) {
      setPendingRemovalKey(item.key)
      return
    }

    const nextRefs = (weeklyPlan?.subTargetRefs || []).filter((ref) => !(ref.goalId === item.goalId && ref.subTargetId === item.subTargetId))
    const updatedPlan = setWeeklyPlan(weekMeta.weekKey, {
      startDate: weekMeta.startDate,
      endDate: weekMeta.endDate,
      subTargetRefs: nextRefs,
      confirmedAt: new Date().toISOString(),
    })

    if (item.subTarget.status === 'doing') {
      updateSubTarget(item.goalId, item.subTargetId, {
        status: 'want',
        startDate: isCurrentWeekAssigned(item.subTarget, weekMeta) ? '' : item.subTarget.startDate,
        endDate: isCurrentWeekAssigned(item.subTarget, weekMeta) ? '' : item.subTarget.endDate,
      })
    }

    setWeeklyPlanState(updatedPlan)
    if (editingItemKey === item.key) handleCancelEdit()
    setPendingRemovalKey('')
    reloadWeeklyData()
  }

  function handleStartEdit(item) {
    setEditingItemKey(item.key)
    setEditingDraft({
      startDate: item.subTarget.startDate || '',
      endDate: item.subTarget.endDate || '',
      content: item.subTarget.content || '',
    })
  }

  function handleCancelEdit() {
    setEditingItemKey('')
    setEditingDraft({ startDate: '', endDate: '', content: '' })
  }

  function handleSaveWeeklyItem(item) {
    const content = editingDraft.content.trim()
    if (!content) return window.alert('请填写子目标内容')
    if (!isValidSubTargetDateRange(editingDraft.startDate, editingDraft.endDate)) {
      return window.alert('结束日期需要晚于或等于开始日期')
    }

    const updated = updateSubTarget(item.goalId, item.subTargetId, {
      startDate: editingDraft.startDate,
      endDate: editingDraft.endDate,
      content,
    })
    if (!updated) return window.alert('子目标更新失败，请稍后再试')
    handleCancelEdit()
    reloadWeeklyData()
  }

  function handleWeeklyStatusChange(item, status) {
    if (item.subTarget.status === status) return
    updateSubTarget(item.goalId, item.subTargetId, { status })
    reloadWeeklyData()
  }

  useEffect(() => {
    if (!pendingRemovalKey) return undefined
    const timer = window.setTimeout(() => {
      setPendingRemovalKey('')
    }, 2200)
    return () => window.clearTimeout(timer)
  }, [pendingRemovalKey])

  const visibleWeeklyItems = useMemo(
    () => (showOnlyActiveWeeklyItems ? weeklyItems.filter((item) => item.subTarget.status !== 'done') : weeklyItems),
    [showOnlyActiveWeeklyItems, weeklyItems],
  )

  const groupedWeeklyItems = useMemo(() => groupWeeklyItems(visibleWeeklyItems), [visibleWeeklyItems])

  return (
    <div className="page daily-planner-page">
      <div className="page-shell planner-shell">
        <div className="page-header">
          <div>
            <h2 className="page-title">周规划 / 日规划</h2>
            <div className="page-subtitle">先确定本周最稳妥的推进，再承接到今天的具体行动。</div>
          </div>
        </div>

        <div className="planner-sections">
          <section className="planner-card weekly-planner-card">
            <div className="weekly-planner-top">
              <div>
                <div className="planner-card-title">周计划</div>
                <div className="weekly-planner-weekline">Week {weekMeta.weekNumber}: {formatDisplayDate(weekMeta.startDate)} 到 {formatDisplayDate(weekMeta.endDate)}</div>
                <div className="muted" style={{ marginTop: 6 }}>本周属于 {weekMeta.isoYear} 年的第 {weekMeta.weekNumber} 周。</div>
              </div>
              <div>
                {weeklyPlan ? <button className="small-btn ghost" type="button" onClick={openBuilder}>调整周计划</button> : null}
              </div>
            </div>

            {!weeklyPlan ? (
              <div className="weekly-empty-state">
                <div>
                  <div className="weekly-empty-title">本周还没有建立保守版周规划</div>
                  <div className="muted">先从“想要做”的子目标里挑出这周最稳妥能推进的那几项。</div>
                </div>
                <button className="btn-primary" type="button" onClick={openBuilder}>建立保守版周计划</button>
              </div>
            ) : (
              <>
                <div className="weekly-stats-row">
                  <div className="weekly-stat-chip">共 {weeklyStats.total} 个子目标</div>
                  <div className="weekly-stat-chip weekly-stat-chip-want">想要做 {weeklyStats.want}</div>
                  <div className="weekly-stat-chip weekly-stat-chip-doing">正在做 {weeklyStats.doing}</div>
                  <div className="weekly-stat-chip weekly-stat-chip-done">做完了 {weeklyStats.done}</div>
                  <button
                    className={`small-btn ${showOnlyActiveWeeklyItems ? 'active' : 'ghost'}`}
                    type="button"
                    onClick={() => setShowOnlyActiveWeeklyItems((current) => !current)}
                  >
                    {showOnlyActiveWeeklyItems ? '显示全部' : '只看未完成'}
                  </button>
                </div>

                {groupedWeeklyItems.length ? (
                  <div className="weekly-goal-groups">
                    {groupedWeeklyItems.map((group) => (
                      <div className="weekly-goal-group" key={group.goalId}>
                        <div className="weekly-goal-group-header">
                          <div className="weekly-goal-group-title">{group.goalTitle}</div>
                          <div className="weekly-goal-group-summary">
                            本行动 {group.items.length} 个子目标，已完成 {group.items.filter((item) => item.subTarget.status === 'done').length} 个
                          </div>
                        </div>
                        <div className="weekly-item-list">
                          {group.items.map((item) => {
                            const isEditing = editingItemKey === item.key
                            return (
                              <div className={`weekly-item weekly-item-${item.subTarget.status || 'want'}`} key={item.key}>
                                <div
                                  className={`weekly-item-drop-anchor ${dropTargetKey === item.key ? 'is-drop-target' : ''}`}
                                  onDragOver={(event) => handlePlanItemDragOver(event, item.key)}
                                  onDragLeave={() => handlePlanItemDragLeave(item.key)}
                                  onDrop={(event) => handleWeeklyPreviewItemDrop(event, item.key)}
                                />
                                <div className="weekly-item-top">
                                  <div>
                                    <div className="weekly-item-meta">计划日期：{formatSubTargetSchedule(item.subTarget)}</div>
                                    {!isEditing ? <div className="weekly-item-content">{item.subTarget.content || '未填写内容'}</div> : null}
                                  </div>
                                  <div className="weekly-item-actions">
                                    {!isEditing ? (
                                      <span className="weekly-drag-hint" draggable onDragStart={(event) => handlePlanItemDragStart(event, item.key)} onDragEnd={handlePlanItemDragEnd}>拖拽排序</span>
                                    ) : null}
                                    <button className="small-btn ghost" type="button" onClick={() => handleStartEdit(item)}>编辑</button>
                                    <button
                                      className={`small-btn ${pendingRemovalKey === item.key ? 'active' : 'ghost'}`}
                                      type="button"
                                      onClick={() => handleRemoveWeeklyItem(item)}
                                    >
                                      {pendingRemovalKey === item.key ? '确认移出' : '移出本周'}
                                    </button>
                                  </div>
                                </div>

                                <div className="weekly-status-row">
                                  {SUB_TARGET_STATUS_OPTIONS.map((option) => (
                                    <button
                                      key={option.value}
                                      type="button"
                                      className={`weekly-status-pill ${item.subTarget.status === option.value ? 'active' : ''} ${option.value === 'done' ? 'weekly-status-pill-done' : ''}`}
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
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="weekly-empty-list muted">{showOnlyActiveWeeklyItems ? '当前筛选下没有未完成的子目标。' : '本周计划已建立，但当前没有可显示的子目标。可能它们已被删除。'}</div>
                )}
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
                  <div className="modal-title">建立保守版周计划</div>
                  <div className="muted">左侧是所有“想要做”的子目标，拖动或点击加入右侧；已安排在本周的子目标会自动出现在右侧。</div>
                </div>
                <button className="small-btn ghost" type="button" onClick={closeBuilder}>关闭</button>
              </div>

              <div className="weekly-builder-grid">
                <div className="weekly-builder-column">
                  <div className="weekly-builder-column-title">候选子目标</div>
                  {availableGoalGroups.length ? availableGoalGroups.map((group) => (
                    <div className="weekly-builder-goal-group" key={group.goalId}>
                      <div className="weekly-builder-goal-title">{group.goalTitle}</div>
                      <div className="weekly-builder-candidate-list">
                        {group.items.map((item) => {
                          const isSelected = selectedRefKeys.includes(item.key)
                          return (
                            <div
                              key={item.key}
                              className={`weekly-builder-item ${isSelected ? 'is-selected' : ''}`}
                              draggable
                              onDragStart={(event) => event.dataTransfer.setData('text/plain', item.key)}
                            >
                              <div>
                                <div className="weekly-builder-item-content">{item.subTarget.content || '未填写内容'}</div>
                                <div className="weekly-builder-item-meta">{formatSubTargetSchedule(item.subTarget)}</div>
                              </div>
                              <button className="small-btn ghost" type="button" onClick={() => addBuilderItem(item.key)}>{isSelected ? '已加入' : '加入本周'}</button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )) : <div className="weekly-builder-empty">当前没有标签为“想要做”的子目标。</div>}
                </div>

                <div className="weekly-builder-column weekly-builder-selected" onDragOver={(event) => event.preventDefault()} onDrop={handleBuilderDrop}>
                  <div className="weekly-builder-column-title">本周确定的周计划</div>
                  {groupedSelectedBuilderItems.length ? (
                    <div className="weekly-builder-selected-list">
                      {groupedSelectedBuilderItems.map((group) => (
                        <div className="weekly-builder-selected-group" key={group.goalId}>
                          <div className="weekly-builder-selected-group-header">
                            <div className="weekly-builder-goal-title">{group.goalTitle}</div>
                            <div className="weekly-builder-selected-summary">已选 {group.items.length} 个子目标</div>
                          </div>
                          <div className="weekly-builder-selected-group-list">
                            {group.items.map((item) => (
                              <div
                                className={`weekly-builder-selected-item ${draggingPlanKey === item.key ? 'is-dragging' : ''} ${dropTargetKey === item.key ? 'is-drop-target' : ''}`}
                                key={item.key}
                                draggable
                                onDragStart={(event) => handlePlanItemDragStart(event, item.key)}
                                onDragEnd={handlePlanItemDragEnd}
                                onDragOver={(event) => handlePlanItemDragOver(event, item.key, { selectedOnly: true })}
                                onDragLeave={() => handlePlanItemDragLeave(item.key)}
                                onDrop={(event) => handleSelectedItemDrop(event, item.key)}
                              >
                                <div>
                                  <div className="weekly-builder-item-content">{item.subTarget.content || '未填写内容'}</div>
                                  <div className="weekly-builder-item-meta">{formatSubTargetSchedule(item.subTarget)}</div>
                                </div>
                                <div className="weekly-builder-selected-actions">
                                  <span className="weekly-builder-drag-hint">拖拽排序</span>
                                  <button className="small-btn ghost" type="button" onClick={() => removeBuilderItem(item.key)}>移出</button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="weekly-builder-dropzone">把左侧子目标拖到这里，或点击“加入本周”。</div>
                  )}
                </div>
              </div>

              <div className="weekly-builder-footer">
                <button className="small-btn ghost" type="button" onClick={closeBuilder}>取消</button>
                <button className="btn-primary" type="button" onClick={handleConfirmWeeklyPlan}>确定</button>
              </div>
            </div>
          </div>,
          document.body,
        ) : null}
      </div>
    </div>
  )
}

import React, { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { getActionFeelingText, hasExpectedDuration, hasText } from '../lib/actionRecord'
import SidebarGoals from '../components/SidebarGoals'
import ActionTimer from '../components/ActionTimer'
import ActionReview from '../components/ActionReview'
import {
  getGoal,
  listActionsByGoal,
  getAction,
  addAction,
  addSubTarget,
  addSubTargets,
  updateSubTarget,
  deleteSubTarget,
  deleteAction,
} from '../storage/storage'

const SUB_TARGET_STATUS_OPTIONS = [
  { value: 'want', label: '想要做', icon: '🌱', hint: '先种下一个念头' },
  { value: 'doing', label: '正在做', icon: '🔥', hint: '现在就推进一点点' },
  { value: 'done', label: '做完了', icon: '🏆', hint: '收下这份完成感' },
]

const SUB_TARGET_FILTER_ALL = 'all'
const SUB_TARGET_WEEK_FILTER_UNSCHEDULED = 'unscheduled'

function pad(value) {
  return String(value).padStart(2, '0')
}

function formatDateOnly(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function getWeekMetaFromDate(dateStr) {
  if (!dateStr) return null
  const parsed = new Date(`${dateStr}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) return null

  const base = new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
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
    key: `${isoDate.getFullYear()}-W${pad(weekNumber)}`,
    label: `W${weekNumber}`,
    isoYear: isoDate.getFullYear(),
    weekNumber,
    startDate: formatDateOnly(weekStart),
    endDate: formatDateOnly(weekEnd),
  }
}

function getSubTargetWeekMetas(subTarget) {
  const startDate = subTarget?.startDate || subTarget?.endDate || ''
  const endDate = subTarget?.endDate || subTarget?.startDate || ''
  if (!startDate || !endDate || startDate > endDate) return []

  const firstWeekMeta = getWeekMetaFromDate(startDate)
  if (!firstWeekMeta) return []

  const weekMetas = []
  const seenKeys = new Set()
  const cursor = new Date(`${firstWeekMeta.startDate}T12:00:00`)

  while (formatDateOnly(cursor) <= endDate) {
    const meta = getWeekMetaFromDate(formatDateOnly(cursor))
    if (meta && !seenKeys.has(meta.key)) {
      seenKeys.add(meta.key)
      weekMetas.push(meta)
    }
    cursor.setDate(cursor.getDate() + 7)
  }

  return weekMetas
}

export default function GoalDetail() {
  const { id } = useParams()
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [goal, setGoal] = useState(null)
  const [actions, setActions] = useState([])
  const [currentActionForReview, setCurrentActionForReview] = useState(null)
  const [reviewModalOpen, setReviewModalOpen] = useState(false)
  const [manualWizardOpen, setManualWizardOpen] = useState(false)
  const [manualStep, setManualStep] = useState(1)
  const [manualAction, setManualAction] = useState(null)
  const [timeScope, setTimeScope] = useState('all')
  const [recordDateFrom, setRecordDateFrom] = useState('')
  const [recordDateTo, setRecordDateTo] = useState('')
  const [manualStart, setManualStart] = useState('')
  const [manualEnd, setManualEnd] = useState('')
  const [createSubTargetModalOpen, setCreateSubTargetModalOpen] = useState(false)
  const [newSubTargetStartDate, setNewSubTargetStartDate] = useState('')
  const [newSubTargetEndDate, setNewSubTargetEndDate] = useState('')
  const [newSubTargetEstimatedHours, setNewSubTargetEstimatedHours] = useState('')
  const [newSubTargetContent, setNewSubTargetContent] = useState('')
  const [bulkSubTargetContent, setBulkSubTargetContent] = useState('')
  const [subTargetCreateMode, setSubTargetCreateMode] = useState('single')
  const [subTargetStatusFilter, setSubTargetStatusFilter] = useState(SUB_TARGET_FILTER_ALL)
  const [subTargetWeekFilter, setSubTargetWeekFilter] = useState(SUB_TARGET_FILTER_ALL)
  const [editingSubTargetId, setEditingSubTargetId] = useState(null)
  const [editingSubTargetDraft, setEditingSubTargetDraft] = useState({ startDate: '', endDate: '', estimatedHours: '', content: '' })
  const [celebratingSubTargetId, setCelebratingSubTargetId] = useState(null)

  function getStartDate(g) {
    return g?.startDate || (g?.createdAt ? String(g.createdAt).slice(0, 10) : '')
  }

  function getCompletedDate(g) {
    return g?.completedDate || ''
  }

  function formatDateTime(iso) {
    if (!iso) return ''
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString()
  }

  function formatDuration(startIso, endIso) {
    if (!startIso) return '0小时0分钟'
    const start = new Date(startIso).getTime()
    const end = endIso ? new Date(endIso).getTime() : Date.now()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '0小时0分钟'
    const totalMinutesSpent = Math.floor((end - start) / 60000)
    const hours = Math.floor(totalMinutesSpent / 60)
    const minutes = totalMinutesSpent % 60
    return `${hours}小时${minutes}分钟`
  }

  function formatExpectedDuration(minutesValue) {
    const minutes = Number(minutesValue)
    if (!Number.isFinite(minutes) || minutes <= 0) return '未设置'
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    if (!hours) return `${remainingMinutes}分钟`
    if (!remainingMinutes) return `${hours}小时`
    return `${hours}小时${remainingMinutes}分钟`
  }

  function formatHourValue(value) {
    const normalized = Math.round(Number(value) * 100) / 100
    if (!Number.isFinite(normalized)) return ''
    return Number.isInteger(normalized) ? String(normalized) : String(normalized)
  }

  function formatEstimatedHoursLabel(value) {
    const hours = Number(value)
    if (!Number.isFinite(hours) || hours <= 0) return '未填写预估时长'
    return `预估 ${formatHourValue(hours)} 小时`
  }

  function parseEstimatedHoursInput(value) {
    const text = String(value ?? '').trim()
    if (!text) return null
    const hours = Number(text)
    if (!Number.isFinite(hours) || hours <= 0) return Number.NaN
    return Math.round(hours * 100) / 100
  }

  function renderActionTextRow(label, value) {
    if (!hasText(value)) return null
    return <div className="action-kv-full action-kv-text"><strong>{label}：</strong>{value}</div>
  }

  function getStatusText(status) {
    if (status === 'doing') return '正在做'
    if (status === 'done') return '做完了'
    return '想要做'
  }

  function formatSubTargetSchedule(subTarget) {
    const startDate = subTarget?.startDate || ''
    const endDate = subTarget?.endDate || ''
    if (!startDate && !endDate) return '暂未安排日期'
    if (startDate && endDate) return `${startDate} 至 ${endDate}`
    if (startDate) return `从 ${startDate} 开始`
    return `到 ${endDate} 结束`
  }

  function isValidSubTargetDateRange(startDate, endDate) {
    if (!startDate || !endDate) return true
    return startDate <= endDate
  }

  function load() {
    setGoal(getGoal(id))
    setActions(listActionsByGoal(id))
  }

  function openReviewForAction(actionId) {
    const fresh = getAction(actionId)
    if (!fresh) return
    setCurrentActionForReview(fresh)
    setReviewModalOpen(true)
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('reviewAction', actionId)
    setSearchParams(nextParams, { replace: true })
  }

  useEffect(() => {
    if (!id) return
    try {
      localStorage.setItem('action-journal:lastGoalId', id)
    } catch {
      // ignore
    }
  }, [id])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  useEffect(() => {
    const reviewActionId = searchParams.get('reviewAction')
    if (!reviewActionId) return
    const fresh = getAction(reviewActionId)
    if (!fresh || fresh.goalId !== id) return
    setCurrentActionForReview(fresh)
    setReviewModalOpen(true)
  }, [id, searchParams, actions])

  function handleActionStopped(action) {
    openReviewForAction(action.id)
    load()
  }

  function handleReviewSaved() {
    setCurrentActionForReview(null)
    setReviewModalOpen(false)
    load()
  }

  function closeReviewModal() {
    setReviewModalOpen(false)
    setCurrentActionForReview(null)
    if (searchParams.get('reviewAction')) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('reviewAction')
      setSearchParams(nextParams, { replace: true })
    }
  }

  function openManualWizard() {
    setManualStart('')
    setManualEnd('')
    setManualAction(null)
    setManualStep(1)
    setManualWizardOpen(true)
  }

  function openCreateSubTargetModal() {
    setNewSubTargetStartDate('')
    setNewSubTargetEndDate('')
    setNewSubTargetEstimatedHours('')
    setNewSubTargetContent('')
    setBulkSubTargetContent('')
    setSubTargetCreateMode('single')
    setCreateSubTargetModalOpen(true)
  }

  function closeCreateSubTargetModal() {
    setCreateSubTargetModalOpen(false)
    setNewSubTargetStartDate('')
    setNewSubTargetEndDate('')
    setNewSubTargetEstimatedHours('')
    setNewSubTargetContent('')
    setBulkSubTargetContent('')
    setSubTargetCreateMode('single')
  }

  function closeManualWizard() {
    setManualWizardOpen(false)
    setManualAction(null)
    setManualStep(1)
    setManualStart('')
    setManualEnd('')
  }

  function handleManualStep1Next(e) {
    e.preventDefault()
    if (!manualStart) return window.alert('请填写开始时间')
    const start = new Date(manualStart)
    if (Number.isNaN(start.getTime())) return window.alert('开始时间格式不正确')

    let endIso = null
    if (manualEnd) {
      const end = new Date(manualEnd)
      if (Number.isNaN(end.getTime())) return window.alert('结束时间格式不正确')
      if (end.getTime() <= start.getTime()) return window.alert('结束时间需要晚于开始时间')
      endIso = end.toISOString()
    }

    const payload = { startTime: start.toISOString() }
    if (endIso) payload.endTime = endIso
    const created = addAction(id, payload)
    const fresh = getAction(created.id) || created
    setManualAction(fresh)
    setManualStep(2)
    load()
  }

  useEffect(() => {
    if (!reviewModalOpen && !manualWizardOpen && !createSubTargetModalOpen) return
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        if (createSubTargetModalOpen) closeCreateSubTargetModal()
        else if (manualWizardOpen) closeManualWizard()
        else closeReviewModal()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reviewModalOpen, manualWizardOpen, createSubTargetModalOpen])

  useEffect(() => {
    if (!celebratingSubTargetId) return undefined
    const timer = window.setTimeout(() => {
      setCelebratingSubTargetId(null)
    }, 1800)
    return () => window.clearTimeout(timer)
  }, [celebratingSubTargetId])

  function handleDeleteAction(actionId) {
    const ok = window.confirm('确定删除这条行动记录吗？此操作不可恢复。')
    if (!ok) return
    deleteAction(actionId)
    if (currentActionForReview?.id === actionId) {
      setCurrentActionForReview(null)
    }
    load()
  }

  function handleEditAction(actionId) {
    openReviewForAction(actionId)
  }

  function handleCreateSubTarget(e) {
    e.preventDefault()
    if (!isValidSubTargetDateRange(newSubTargetStartDate, newSubTargetEndDate)) {
      return window.alert('结束日期需要晚于或等于开始日期')
    }

    const estimatedHours = parseEstimatedHoursInput(newSubTargetEstimatedHours)
    if (Number.isNaN(estimatedHours)) return window.alert('请填写正确的预估时长（小时），或留空')

    if (subTargetCreateMode === 'batch') {
      const lines = bulkSubTargetContent
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)

      if (!lines.length) return window.alert('请至少输入一个子目标，每行一个')

      const createdItems = addSubTargets(id, lines.map((content) => ({
        startDate: newSubTargetStartDate,
        endDate: newSubTargetEndDate,
        estimatedHours,
        content,
        status: 'want',
      })))

      if (!createdItems.length) return window.alert('子目标创建失败，请稍后再试')

      closeCreateSubTargetModal()
      load()
      return
    }

    const content = newSubTargetContent.trim()
    if (!content) return window.alert('请填写子目标内容')

    const created = addSubTarget(id, {
      startDate: newSubTargetStartDate,
      endDate: newSubTargetEndDate,
      estimatedHours,
      content,
      status: 'want',
    })

    if (!created) return window.alert('子目标创建失败，请稍后再试')

    closeCreateSubTargetModal()
    load()
  }

  function handleStartEditSubTarget(subTarget) {
    setEditingSubTargetId(subTarget.id)
    setEditingSubTargetDraft({
      startDate: subTarget.startDate || '',
      endDate: subTarget.endDate || '',
      estimatedHours: subTarget.estimatedHours ? formatHourValue(subTarget.estimatedHours) : '',
      content: subTarget.content || '',
    })
  }

  function handleCancelEditSubTarget() {
    setEditingSubTargetId(null)
    setEditingSubTargetDraft({ startDate: '', endDate: '', estimatedHours: '', content: '' })
  }

  function handleSaveSubTarget(subTargetId) {
    const content = editingSubTargetDraft.content.trim()
    if (!content) return window.alert('请填写子目标内容')
    if (!isValidSubTargetDateRange(editingSubTargetDraft.startDate, editingSubTargetDraft.endDate)) {
      return window.alert('结束日期需要晚于或等于开始日期')
    }
    const estimatedHours = parseEstimatedHoursInput(editingSubTargetDraft.estimatedHours)
    if (Number.isNaN(estimatedHours)) return window.alert('请填写正确的预估时长（小时），或留空')

    const updated = updateSubTarget(id, subTargetId, {
      startDate: editingSubTargetDraft.startDate,
      endDate: editingSubTargetDraft.endDate,
      estimatedHours,
      content,
    })

    if (!updated) return window.alert('子目标更新失败，请稍后再试')

    handleCancelEditSubTarget()
    load()
  }

  function handleSubTargetStatusChange(subTargetId, status) {
    const target = subTargets.find((subTarget) => subTarget.id === subTargetId)
    if (!target || target.status === status) return

    updateSubTarget(id, subTargetId, { status })
    if (status === 'done') {
      setCelebratingSubTargetId(subTargetId)
    } else if (celebratingSubTargetId === subTargetId) {
      setCelebratingSubTargetId(null)
    }
    load()
  }

  function handleDeleteSubTarget(subTargetId) {
    const ok = window.confirm('确定删除这个子目标吗？')
    if (!ok) return
    deleteSubTarget(id, subTargetId)
    if (editingSubTargetId === subTargetId) handleCancelEditSubTarget()
    load()
  }

  function getWorkExperiencePath(actionId) {
    const query = searchParams.toString()
    return `/goals/${id}/actions/${actionId}/work-experience${query ? `?${query}` : ''}`
  }

  function getWorkExperienceState(options = {}) {
    const query = searchParams.toString()
    return {
      returnTo: location.pathname + (query ? `?${query}` : ''),
      returnLabel: options.returnLabel || '返回行动记录',
      basePath: location.pathname.startsWith('/action') ? '/action' : '/goal',
    }
  }

  function isActionInScope(action) {
    if (!action.startTime) return false
    if (timeScope === 'all') return true

    const start = new Date(action.startTime)
    if (Number.isNaN(start.getTime())) return false
    const now = new Date()

    if (timeScope === 'today') {
      const today = now.toISOString().slice(0, 10)
      return start.toISOString().slice(0, 10) === today
    }

    // week starts on Monday
    const day = now.getDay() || 7
    const weekStart = new Date(now)
    weekStart.setHours(0, 0, 0, 0)
    weekStart.setDate(now.getDate() - day + 1)
    return start >= weekStart
  }

  const scopedActions = actions.filter(isActionInScope)

  const totalMinutes = scopedActions.reduce((acc, a) => {
    if (!a.startTime) return acc
    const start = new Date(a.startTime).getTime()
    const end = a.endTime ? new Date(a.endTime).getTime() : Date.now()
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return acc
    return acc + Math.floor((end - start) / 60000)
  }, 0)
  const totalHoursPart = Math.floor(totalMinutes / 60)
  const totalMinutesPart = totalMinutes % 60

  const filteredActions = actions.filter((a) => {
    if (!a.startTime) return false
    const start = new Date(a.startTime)
    if (Number.isNaN(start.getTime())) return false

    if (recordDateFrom) {
      const from = new Date(`${recordDateFrom}T00:00:00`)
      if (start < from) return false
    }
    if (recordDateTo) {
      const to = new Date(`${recordDateTo}T23:59:59`)
      if (start > to) return false
    }
    return true
  })

  const workExperienceActions = actions.filter((action) => action.workExperienceTitle || action.workExperienceHtml)
  const subTargets = goal?.subTargets || []
  const subTargetWeekOptions = useMemo(() => {
    const optionMap = new Map()
    subTargets.forEach((subTarget) => {
      getSubTargetWeekMetas(subTarget).forEach((meta) => {
        if (!optionMap.has(meta.key)) optionMap.set(meta.key, meta)
      })
    })
    return Array.from(optionMap.values()).sort((left, right) => left.startDate.localeCompare(right.startDate))
  }, [subTargets])
  const filteredSubTargets = useMemo(() => {
    return subTargets.filter((subTarget) => {
      if (subTargetStatusFilter !== SUB_TARGET_FILTER_ALL && (subTarget.status || 'want') !== subTargetStatusFilter) {
        return false
      }

      if (subTargetWeekFilter === SUB_TARGET_FILTER_ALL) return true

      const weekMetas = getSubTargetWeekMetas(subTarget)
      if (subTargetWeekFilter === SUB_TARGET_WEEK_FILTER_UNSCHEDULED) {
        return weekMetas.length === 0
      }
      return weekMetas.some((meta) => meta.key === subTargetWeekFilter)
    })
  }, [subTargets, subTargetStatusFilter, subTargetWeekFilter])
  const bulkSubTargetLines = bulkSubTargetContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  return (
    <div className="page page-with-sidebar goal-detail-page">
      <aside className="side-col">
        <SidebarGoals activeId={id} basePath={location.pathname.startsWith('/action') ? '/action' : '/goal'} />
      </aside>

      <section className="main-col">
        <div className="goal-detail-inner">
          <div className="right-panel">
            <div className="goal-head-row">
              <h1 className="goal-top-title">{goal ? goal.title : '目标详情'}</h1>
              {goal && (
                <Link className="small-btn ghost" to={`/edit-goal/${goal.id}`}>编辑目标</Link>
              )}
            </div>
            {goal && (
              <div className="goal-head-meta muted">
                开始：{getStartDate(goal) || '未记录'}
                {goal.status === 'done' ? ` · 做完啦：${getCompletedDate(goal) || '未记录'}` : ''}
              </div>
            )}
            <div className="goal-right-grid">
              {/* Card 1: Goal full info */}
              <div className="card card-why">
                <h3>目标详细信息</h3>

                <div className="goal-info-status-row">
                  <span className={`goal-tag goal-tag-${goal?.status || 'want'}`}>{getStatusText(goal?.status)}</span>
                </div>

                <div className="goal-info-block">
                  <div className="goal-info-title">我期待在什么时候，获得什么结果/实现什么目标</div>
                  <div className="goal-info-content">{goal?.expectedOutcome || '未设置'}</div>
                </div>

                <div className="goal-info-block">
                  <div className="goal-info-title">为什么自己想要做这件事？</div>
                  <ul className="goal-info-list">
                    {goal?.reasons && goal.reasons.length ? goal.reasons.map((r, i) => <li key={i}>{r}</li>) : <li className="muted">尚未填写</li>}
                  </ul>
                </div>

                <div className="goal-info-block">
                  <div className="goal-info-title">在实现目标的过程中，哪些人际联结，可能为我提供动力和支持</div>
                  <ul className="goal-info-list">
                    {goal?.supports && goal.supports.length ? goal.supports.map((s, i) => <li key={i}>{s}</li>) : <li className="muted">尚未填写</li>}
                  </ul>
                </div>

                <div className="goal-info-block">
                  <div className="goal-info-title">可能影响结果的内部和外部因素（可控程度 0-10）</div>
                  <ul className="goal-info-list">
                    {goal?.factors && goal.factors.length
                      ? goal.factors.map((f, i) => (
                          <li key={i}>
                            {f?.name || '未命名因素'}（可控程度：{Number.isFinite(Number(f?.controllability)) ? Number(f.controllability) : '-'}）
                          </li>
                        ))
                      : <li className="muted">尚未填写</li>}
                  </ul>
                </div>
              </div>

              {/* Card 2: Action panel with start button & elapsed */}
              <div className="card card-action-panel">
                <h3>行动面板</h3>
                <ActionTimer goalId={id} onStopped={handleActionStopped} onStarted={() => load()} />
                <div style={{ marginTop: 8 }}>
                  <button className="small-btn ghost" onClick={openManualWizard}>补录行动</button>
                </div>
              </div>

              <div className="card card-subtargets">
                <div className="subtarget-card-header">
                  <div>
                    <h3>子目标</h3>
                    <div className="muted subtarget-card-subtitle">把当前目标拆成更容易开始的小步骤，状态和内容都能随时修改。</div>
                  </div>
                  <button type="button" className="btn-primary subtarget-open-modal-btn" onClick={openCreateSubTargetModal}>创建子目标</button>
                </div>

                <div className="subtarget-overview-row">
                  <div className="subtarget-overview-chip">共 {subTargets.length} 个子目标</div>
                  <div className="subtarget-overview-chip">当前显示 {filteredSubTargets.length} 个</div>
                  <div className="subtarget-overview-chip subtarget-overview-chip-want">想要做 {subTargets.filter((item) => item.status === 'want').length}</div>
                  <div className="subtarget-overview-chip subtarget-overview-chip-doing">正在做 {subTargets.filter((item) => item.status === 'doing').length}</div>
                  <div className="subtarget-overview-chip subtarget-overview-chip-done">做完了 {subTargets.filter((item) => item.status === 'done').length}</div>
                </div>

                <div className="subtarget-filter-panel">
                  <div className="subtarget-filter-group" role="group" aria-label="按标签筛选子目标">
                    <button type="button" className={`small-btn ${subTargetStatusFilter === 'all' ? 'active' : 'ghost'}`} onClick={() => setSubTargetStatusFilter('all')}>全部标签</button>
                    <button type="button" className={`small-btn ${subTargetStatusFilter === 'want' ? 'active' : 'ghost'}`} onClick={() => setSubTargetStatusFilter('want')}>想要做</button>
                    <button type="button" className={`small-btn ${subTargetStatusFilter === 'doing' ? 'active' : 'ghost'}`} onClick={() => setSubTargetStatusFilter('doing')}>正在做</button>
                    <button type="button" className={`small-btn ${subTargetStatusFilter === 'done' ? 'active' : 'ghost'}`} onClick={() => setSubTargetStatusFilter('done')}>做完了</button>
                  </div>

                  <div className="subtarget-week-filter-row">
                    <label htmlFor="subtarget-week-filter">按周次筛选</label>
                    <select id="subtarget-week-filter" value={subTargetWeekFilter} onChange={(e) => setSubTargetWeekFilter(e.target.value)}>
                      <option value="all">全部周次</option>
                      <option value="unscheduled">未安排周次</option>
                      {subTargetWeekOptions.map((option) => (
                        <option key={option.key} value={option.key}>{option.label} · {option.startDate} 至 {option.endDate}</option>
                      ))}
                    </select>
                  </div>

                  {(subTargetStatusFilter !== 'all' || subTargetWeekFilter !== 'all') && (
                    <button
                      type="button"
                      className="small-btn ghost"
                      onClick={() => {
                        setSubTargetStatusFilter('all')
                        setSubTargetWeekFilter('all')
                      }}
                    >
                      清空筛选
                    </button>
                  )}
                </div>

                {subTargets.length ? (
                  filteredSubTargets.length ? (
                    <div className="subtarget-list">
                      {filteredSubTargets.map((subTarget) => {
                      const isEditing = editingSubTargetId === subTarget.id
                      const isCelebrating = celebratingSubTargetId === subTarget.id
                      const subTargetWeekMetas = getSubTargetWeekMetas(subTarget)

                      return (
                        <div className={`subtarget-item subtarget-item-${subTarget.status || 'want'} ${isCelebrating ? 'is-complete-celebration' : ''}`} key={subTarget.id}>
                          <div className="subtarget-item-top">
                            <div>
                              <div className="subtarget-meta-row">
                                <div className="subtarget-meta">计划日期：{formatSubTargetSchedule(subTarget)}</div>
                                <div className="subtarget-estimate-chip">{formatEstimatedHoursLabel(subTarget.estimatedHours)}</div>
                              </div>
                              <div className="subtarget-week-chip-row">
                                {subTargetWeekMetas.length ? subTargetWeekMetas.map((meta) => (
                                  <span className="subtarget-week-chip" key={meta.key}>{meta.label}</span>
                                )) : <span className="subtarget-week-chip subtarget-week-chip-empty">未排周次</span>}
                              </div>
                              {!isEditing && <div className="subtarget-content">{subTarget.content || '未填写内容'}</div>}
                              {!isEditing && isCelebrating && <div className="subtarget-celebration-note">完成一个子目标，继续保持这个节奏！</div>}
                            </div>
                            <div className="subtarget-item-actions">
                              <button className="small-btn ghost" type="button" onClick={() => handleStartEditSubTarget(subTarget)}>编辑</button>
                              <button className="small-btn danger" type="button" onClick={() => handleDeleteSubTarget(subTarget.id)}>删除</button>
                            </div>
                          </div>

                          <div className="subtarget-status-row">
                            {SUB_TARGET_STATUS_OPTIONS.map((option) => (
                              <button
                                key={option.value}
                                type="button"
                                className={`subtarget-status-pill ${subTarget.status === option.value ? 'active' : ''} ${option.value === 'done' ? 'subtarget-status-pill-done' : ''}`}
                                onClick={() => handleSubTargetStatusChange(subTarget.id, option.value)}
                              >
                                <span className="subtarget-status-pill-icon" aria-hidden="true">{option.icon}</span>
                                <span className="subtarget-status-pill-texts">
                                  <span className="subtarget-status-pill-label">{option.label}</span>
                                  <span className="subtarget-status-pill-hint">{option.hint}</span>
                                </span>
                              </button>
                            ))}
                          </div>

                          {isEditing && (
                            <div className="subtarget-edit-panel">
                              <div className="subtarget-form-field">
                                <label htmlFor={`edit-subtarget-start-${subTarget.id}`}>开始日期（可选）</label>
                                <input
                                  id={`edit-subtarget-start-${subTarget.id}`}
                                  type="date"
                                  value={editingSubTargetDraft.startDate}
                                  onChange={(e) => setEditingSubTargetDraft((draft) => ({ ...draft, startDate: e.target.value }))}
                                />
                              </div>
                              <div className="subtarget-form-field">
                                <label htmlFor={`edit-subtarget-end-${subTarget.id}`}>结束日期（可选）</label>
                                <input
                                  id={`edit-subtarget-end-${subTarget.id}`}
                                  type="date"
                                  value={editingSubTargetDraft.endDate}
                                  onChange={(e) => setEditingSubTargetDraft((draft) => ({ ...draft, endDate: e.target.value }))}
                                />
                              </div>
                              <div className="subtarget-form-field">
                                <label htmlFor={`edit-subtarget-estimated-hours-${subTarget.id}`}>预估时长（小时，可留空）</label>
                                <input
                                  id={`edit-subtarget-estimated-hours-${subTarget.id}`}
                                  type="number"
                                  min="0"
                                  step="0.5"
                                  inputMode="decimal"
                                  placeholder="例如 2 或 3.5"
                                  value={editingSubTargetDraft.estimatedHours}
                                  onChange={(e) => setEditingSubTargetDraft((draft) => ({ ...draft, estimatedHours: e.target.value }))}
                                />
                              </div>
                              <div className="subtarget-form-field subtarget-form-field-wide">
                                <label htmlFor={`edit-subtarget-content-${subTarget.id}`}>子目标内容</label>
                                <textarea
                                  id={`edit-subtarget-content-${subTarget.id}`}
                                  value={editingSubTargetDraft.content}
                                  onChange={(e) => setEditingSubTargetDraft((draft) => ({ ...draft, content: e.target.value }))}
                                />
                              </div>
                              <div className="subtarget-edit-actions">
                                <button type="button" className="small-btn ghost" onClick={handleCancelEditSubTarget}>取消</button>
                                <button type="button" className="btn-primary" onClick={() => handleSaveSubTarget(subTarget.id)}>保存</button>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                      })}
                    </div>
                  ) : (
                    <div className="muted subtarget-empty">没有符合当前筛选条件的子目标。</div>
                  )
                ) : (
                  <div className="muted subtarget-empty">还没有子目标，先添加一个小步骤吧。</div>
                )}
              </div>

              <div className="card card-total-time">
                <h3>行动总时间</h3>
                <div className="time-scope-switch">
                  <button className={`small-btn ${timeScope === 'all' ? 'active' : 'ghost'}`} onClick={() => setTimeScope('all')}>全部</button>
                  <button className={`small-btn ${timeScope === 'today' ? 'active' : 'ghost'}`} onClick={() => setTimeScope('today')}>今日</button>
                  <button className={`small-btn ${timeScope === 'week' ? 'active' : 'ghost'}`} onClick={() => setTimeScope('week')}>本周</button>
                </div>
                <div className="time-total-highlight">
                  <span className="time-total-number">{totalHoursPart}</span>
                  <span className="time-total-unit">小时</span>
                  <span className="time-total-number">{totalMinutesPart}</span>
                  <span className="time-total-unit">分钟</span>
                </div>
                <div className="muted" style={{ marginTop: 6 }}>统计范围：{timeScope === 'all' ? '全部' : timeScope === 'today' ? '今日' : '本周'}</div>
              </div>

              {/* Card 3: Action records with detailed reviews */}
              <div className="card card-records">
                <h3>行动记录</h3>
                <div className="record-filter-row">
                  <label>开始日期</label>
                  <input type="date" value={recordDateFrom} onChange={(e) => setRecordDateFrom(e.target.value)} />
                  <label>结束日期</label>
                  <input type="date" value={recordDateTo} onChange={(e) => setRecordDateTo(e.target.value)} />
                  <button className="small-btn ghost" onClick={() => { setRecordDateFrom(''); setRecordDateTo('') }}>清空</button>
                </div>

                {filteredActions.length ? (
                  <div className="action-list">
                    {filteredActions.map((a) => (
                      <div className="action-record" key={a.id} style={{ borderBottom: '1px solid #eee', padding: '8px 0' }}>
                        <div className="action-record-header">
                          <div className="action-record-meta">
                            <div className="action-times">{a.startTime ? formatDateTime(a.startTime) : '无开始时间'} — {a.endTime ? formatDateTime(a.endTime) : '进行中'}</div>
                            <div className="action-duration muted">持续时间：{formatDuration(a.startTime, a.endTime)}</div>
                          </div>
                          <div className="action-record-actions">
                            <button className="small-btn ghost" onClick={() => handleEditAction(a.id)}>编辑</button>
                            <button className="small-btn danger" onClick={() => handleDeleteAction(a.id)}>删除</button>
                          </div>
                        </div>
                        <div className="action-kv-grid">
                          <div><strong>唤醒度：</strong>{a.scores?.arousal ?? '-'}</div>
                          <div><strong>效价：</strong>{a.scores?.valence ?? '-'}</div>
                          {hasExpectedDuration(a.expectedDurationMinutes) ? <div><strong>预期时长：</strong>{formatExpectedDuration(a.expectedDurationMinutes)}</div> : null}
                          {renderActionTextRow('行动内容', a.content)}
                          {renderActionTextRow('行动感受', getActionFeelingText(a))}
                          {renderActionTextRow('庆祝小活动', a.celebration)}
                          {renderActionTextRow('下一步行动', a.nextAction || a.notes || '')}
                          {(a.workExperienceTitle || a.workExperienceHtml) && (
                            <div className="action-kv-full action-work-experience-row">
                              <strong>工作经验：</strong>
                              <span className="action-work-experience-title">{a.workExperienceTitle || '未命名工作经验'}</span>
                              <Link className="small-btn ghost" to={getWorkExperiencePath(a.id)} state={getWorkExperienceState({ returnLabel: '返回行动记录' })}>查看工作经验</Link>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="muted">该日期范围内暂无行动</div>
                )}
              </div>

              <div className="card card-work-experience-summary">
                <h3>工作经验</h3>
                {workExperienceActions.length ? (
                  <div className="work-experience-summary-list">
                    {workExperienceActions.map((action) => (
                      <Link
                        key={action.id}
                        className="work-experience-summary-item"
                        to={getWorkExperiencePath(action.id)}
                        state={getWorkExperienceState({ returnLabel: '返回工作经验汇总' })}
                      >
                        <span className="work-experience-summary-title">{action.workExperienceTitle || '未命名工作经验'}</span>
                        <span className="work-experience-summary-meta">
                          {action.startTime ? formatDateTime(action.startTime) : '未记录时间'} · {formatDuration(action.startTime, action.endTime)}
                        </span>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="muted">当前还没有填写任何工作经验。</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {reviewModalOpen && currentActionForReview && (
        <div className="modal-overlay" onMouseDown={closeReviewModal} role="presentation">
          <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="回顾本次行动">
            <div className="modal-header">
              <div>
                <div className="modal-title">回顾本次行动</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>
                  {currentActionForReview.startTime ? new Date(currentActionForReview.startTime).toLocaleString() : ''}
                  {currentActionForReview.endTime ? ` — ${new Date(currentActionForReview.endTime).toLocaleString()}` : ''}
                </div>
              </div>
              <button className="small-btn ghost" onClick={closeReviewModal}>关闭</button>
            </div>

            <ActionReview action={currentActionForReview} onSave={handleReviewSaved} onCancel={closeReviewModal} />
          </div>
        </div>
      )}

      {manualWizardOpen && (
        <div className="modal-overlay" onMouseDown={closeManualWizard} role="presentation">
          <div className="modal-content" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="补录行动">
            <div className="modal-header">
              <div>
                <div className="modal-title">补录行动 <span className="step-badge">{manualStep}/2</span></div>
                <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>第1步补时间段，第2步补回顾内容（与行动记录字段一致）</div>
              </div>
              <button className="small-btn ghost" onClick={closeManualWizard}>关闭</button>
            </div>

            {manualStep === 1 ? (
              <form className="manual-step-form" onSubmit={handleManualStep1Next}>
                <div className="manual-step-grid">
                  <div>
                    <label>开始时间</label>
                    <input type="datetime-local" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
                  </div>
                  <div>
                    <label>结束时间（可选）</label>
                    <input type="datetime-local" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
                  </div>
                </div>
                <div className="review-actions">
                  <button type="button" className="small-btn ghost" onClick={closeManualWizard}>取消</button>
                  <button type="submit" className="btn-primary">下一步：填写回顾</button>
                </div>
              </form>
            ) : (
              <div style={{ paddingTop: 12 }}>
                <div className="muted" style={{ fontSize: 13, marginBottom: 10 }}>
                  {manualAction?.startTime ? new Date(manualAction.startTime).toLocaleString() : ''}
                  {manualAction?.endTime ? ` — ${new Date(manualAction.endTime).toLocaleString()}` : ''}
                </div>
                <ActionReview
                  action={manualAction}
                  onSave={() => {
                    closeManualWizard()
                    load()
                  }}
                  onCancel={closeManualWizard}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {createSubTargetModalOpen && (
        <div className="modal-overlay" onMouseDown={closeCreateSubTargetModal} role="presentation">
          <div className="modal-content subtarget-create-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="创建子目标">
            <div className="modal-header">
              <div>
                <div className="modal-title">创建子目标</div>
                <div className="muted" style={{ marginTop: 2, fontSize: 13 }}>支持单条创建，也支持批量粘贴多条子目标；开始和结束日期会应用到这次创建的所有内容。</div>
              </div>
              <button className="small-btn ghost" onClick={closeCreateSubTargetModal}>关闭</button>
            </div>

            <form className="subtarget-create-form" onSubmit={handleCreateSubTarget}>
              <div className="subtarget-create-mode-row subtarget-form-field-wide" role="group" aria-label="选择子目标创建方式">
                <button type="button" className={`small-btn ${subTargetCreateMode === 'single' ? 'active' : 'ghost'}`} onClick={() => setSubTargetCreateMode('single')}>单条创建</button>
                <button type="button" className={`small-btn ${subTargetCreateMode === 'batch' ? 'active' : 'ghost'}`} onClick={() => setSubTargetCreateMode('batch')}>批量创建</button>
              </div>
              <div className="subtarget-form-field">
                <label htmlFor="subtarget-start-date">开始日期（可选）</label>
                <input
                  id="subtarget-start-date"
                  type="date"
                  value={newSubTargetStartDate}
                  onChange={(e) => setNewSubTargetStartDate(e.target.value)}
                />
              </div>
              <div className="subtarget-form-field">
                <label htmlFor="subtarget-end-date">结束日期（可选）</label>
                <input
                  id="subtarget-end-date"
                  type="date"
                  value={newSubTargetEndDate}
                  onChange={(e) => setNewSubTargetEndDate(e.target.value)}
                />
              </div>
              <div className="subtarget-form-field">
                <label htmlFor="subtarget-estimated-hours">预估时长（小时，可留空）</label>
                <input
                  id="subtarget-estimated-hours"
                  type="number"
                  min="0"
                  step="0.5"
                  inputMode="decimal"
                  placeholder="例如 2 或 3.5"
                  value={newSubTargetEstimatedHours}
                  onChange={(e) => setNewSubTargetEstimatedHours(e.target.value)}
                />
                <div className="muted subtarget-bulk-hint">不确定时可以留空，周计划里会显示为“？”；批量创建时会把这个数值应用到所有新条目。</div>
              </div>

              {subTargetCreateMode === 'single' ? (
                <div className="subtarget-form-field subtarget-form-field-wide">
                  <label htmlFor="subtarget-content">子目标内容</label>
                  <textarea
                    id="subtarget-content"
                    value={newSubTargetContent}
                    onChange={(e) => setNewSubTargetContent(e.target.value)}
                    placeholder="例如：先列出今天要完成的 3 个关键步骤"
                  />
                </div>
              ) : (
                <div className="subtarget-form-field subtarget-form-field-wide">
                  <label htmlFor="subtarget-bulk-content">批量子目标</label>
                  <textarea
                    id="subtarget-bulk-content"
                    value={bulkSubTargetContent}
                    onChange={(e) => setBulkSubTargetContent(e.target.value)}
                    placeholder={'每行一个子目标\n例如：\n整理本周要推进的资料\n写出第一版方案\n和同事确认反馈'}
                  />
                  <div className="muted subtarget-bulk-hint">已识别 {bulkSubTargetLines.length} 条非空子目标。</div>
                </div>
              )}

              <div className="subtarget-create-actions">
                <button type="button" className="small-btn ghost" onClick={closeCreateSubTargetModal}>取消</button>
                <button type="submit" className="btn-primary">{subTargetCreateMode === 'batch' ? `批量创建 ${bulkSubTargetLines.length || ''}`.trim() : '保存子目标'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
